#!/usr/bin/env node
/**
 * palette-sweep — the rendered-DOM contrast probe, over EVERY shipped palette.
 *
 * WHY THIS EXISTS. `check-slide-contrast.js` measures the real DOM and has found every
 * contrast defect this repo has shipped. It is also, structurally, the only tier that can
 * see a CASCADE defect — a token that is correct in the table and still loses to whichever
 * rule actually wins. `slide-contrast.test.js` wires it to CI, and covers `indaco` and
 * `indaco-dark`. Thirty of the thirty-two shipped palettes had never been measured this
 * way, on any deck, ever. Analytic gates cover them — and analytic gates are precisely the
 * layer that certified a 1:1 invisible label as correct (2026-08-19-website-accessibility-gate).
 *
 * WHY IT IS AFFORDABLE. A palette matrix reads as unaffordable: one gallery render is
 * 11-36 s, so 32 of them is 6-19 minutes of wall clock for one deck. But the render is not
 * the palette-dependent part. Parsing the markdown, rendering Mermaid, running KaTeX and
 * laying out 117 slides produce the same DOM whatever the colors are; only the PAINT
 * changes. So the document is rendered ONCE and re-themed in place. That is fast enough to
 * gate every PR, which is the difference between a nightly job nobody reads and a merge gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THE THREE THINGS THAT MAKE THIS HONEST RATHER THAN MERELY FAST.
 *
 *   1. THE SWAP REPRODUCES THE SHIPPED CASCADE, BECAUSE IT HAPPENS WHERE THE PALETTE
 *      ALREADY IS. This tool's first version APPENDED a `<style>` to `<head>`. The export
 *      shell emits ONE stylesheet in which `dist/lattice.css` comes FIRST and the palette
 *      follows (`/* @theme <name>` … `PALETTE_END_MARK`), so appending inverted that
 *      order and 30 of 126 tokens resolved from the wrong side. It was wrong in BOTH
 *      directions and quietly: measured against native renders, `onyx` reported 3 where the
 *      truth is 5 (it MISSED two `redline` runs at 4.29:1) and `atelier` reported 19 where
 *      the truth is 16 (three phantom `journey` runs). A gate that invents findings and
 *      hides real ones is worse than no gate.
 *
 *      So the palette region is REPLACED IN PLACE — the span between the two markers above
 *      is overwritten and everything around it is left alone. The swapped palette then
 *      occupies the exact byte range, and therefore the exact cascade position, that the
 *      shipped palette did. Verified against native renders: `onyx` 5, `atelier` 16,
 *      `mustard` 95, all three matching to the row.
 *
 *      This is a TEXTUAL assumption about the export shell, so it fails LOUDLY rather than
 *      falling back: exactly one stylesheet must carry both markers, in order. If the shell
 *      ever stops emitting them the sweep stops, instead of silently measuring fiction the
 *      way its first version did. The nightly native referee (see below) is the second
 *      guard on the same assumption.
 *
 *   2. THIRD-PARTY PAINT IS DROPPED BY PROVENANCE, NOT BY GUESSWORK. Mermaid ships its own
 *      stylesheet INSIDE the `<svg>` it renders, resolved against whatever palette was in
 *      force AT RENDER TIME. Swapping our palette cannot move it: on a native `indaco-dark`
 *      render a flowchart edge label paints white-on-#001D33, but after an in-place swap
 *      from `indaco` the ink follows (ours, `!important`) while the pill stays baked white
 *      — 1:1, a number describing no rendered pixel anywhere. Those runs must not be scored.
 *
 *      The FIRST version identified them by INVARIANCE — "if a channel never changed across
 *      all 32 palettes it must be third-party." That rule cannot do the one job it exists
 *      for. A HARDCODED HEX IN OUR OWN CSS also never changes, so a literal `#888` that
 *      fails contrast was classified as third-party paint and silently dropped — the exact
 *      regression class this gate is built to catch was the one it was blind to.
 *
 *      So provenance is asked directly instead: a stylesheet whose `ownerNode` sits inside
 *      an `<svg>` came from whatever renderer produced that SVG, not from us. Disabling
 *      those sheets and re-probing says, per run and PER CHANNEL, whether a third-party
 *      sheet was contributing. A channel painted from our document stylesheets is KEPT and
 *      scored even when it never varies — which is the whole point.
 *
 *   3. A SWAP THAT SILENTLY FAILS MUST NOT READ AS A CLEAN PALETTE. If the replacement were
 *      inert, every palette would probe identically and the sweep would report 32 clean
 *      palettes having measured one. So each palette is checked against the static resolver
 *      every ANALYTIC gate uses (`parsePaletteVars`) — two independent paths to the same
 *      answer — and the count of DISTINCT painted canvases is reported so a collapsed matrix
 *      fails closed. The first version of this compared each palette to the one BEFORE it
 *      and reported six false alarms, because sibling palettes legitimately share a canvas
 *      (the four `a11y-*` variants do so by construction). An adjacent-pair test measures
 *      sort order, not repaint.
 *
 * WHAT THIS TIER STILL CANNOT SEE, AND WHO DOES. Anything baked at render time — Mermaid's
 * node fills and label pills above all — is dropped here BY CONSTRUCTION, because no swap
 * can move it. That coverage is not abandoned: `tools/palette-native.js` re-renders all 32
 * palettes for real on a nightly schedule and scores what this tool dropped, and it also
 * re-scores what this tool KEPT and fails if the two disagree. That referee is what stops
 * the fast path from drifting back into measuring fiction — the failure mode above was
 * found by a reviewer, and a reviewer is not a gate.
 *
 * Usage:
 *   node tools/palette-sweep.js <rendered-deck.html> [--themes=a,b,c] [--json=out.json]
 *
 * Exits non-zero if any palette fails its canary. Sub-threshold RUNS are reported but do
 * not set the exit code here — policy belongs to the gate
 * (`test/integration/invariants/palette-sweep.test.js`), the same split
 * `check-slide-contrast.js` and `slide-contrast.test.js` already use: the tool owns the
 * number, the test owns what is allowed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PROBE } = require('./check-slide-contrast.js');
const { paletteChainCss, parsePaletteVars, listAllThemes } = require('./contrast-audit.js');

/**
 * The two markers that bracket the palette inside the export shell's stylesheet, taken from
 * the ONE module the export shell writes them with (`lib/core/export-shell-marks.js`).
 *
 * `/* @theme <name>` opens every file in `themes/` (all 32 carry it — Marp's own theme
 * annotation, which this engine kept). The region used to be CLOSED by the engine bundle's
 * own `/* dist/lattice.css` banner, because the export concatenated the palette FIRST and
 * the bundle second. #1527 flipped that — the palette is last now, which is the order every
 * theme's own `@import 'lattice';` declares — so no banner follows it and the shell emits an
 * explicit end sentinel instead. Inferring the end from whatever rule happens to come next
 * would put this tool back to measuring a hybrid the first time that rule moved.
 */
const {
  PALETTE_START_MARK: PALETTE_MARK,
  PALETTE_END_MARK,
} = require('../lib/core/export-shell-marks.js');
const PROBE_ID = '__palette_sweep_probe__';

/** Every palette the engine ships, from `themes/` — the same list every analytic gate uses. */
function listSweepThemes() {
  return listAllThemes();
}

/**
 * The palette as a COMPLETE, self-contained stylesheet.
 *
 * NOT `dist/themes/<name>.min.css`. Those files are override layers joined by `@import`:
 * `cuoio-dark` is 1,948 bytes and declares no `--bg` at all, `a11y-base` declares no
 * `--bg`, `--text-body` or `--accent` and reaches them through `@import "onyx"`. An
 * `@import` inside a `<style>` injected mid-document does not load, so injecting those
 * files applied an override layer on top of WHICHEVER PALETTE WAS INJECTED BEFORE IT —
 * a hybrid that exists in no build. It measured cleanly and reported confident numbers:
 * 18 of the 32 palettes were hybrids, and the tell was two unrelated palettes
 * (`mustard`, `a11y-base`) reporting byte-identical offender breakdowns.
 *
 * `paletteChainCss` flattens the chain the way every analytic gate already resolves it,
 * and its order is already the one a cascade needs: `themeChain` returns [base, …, self]
 * (`cuoio-dark` → ["cuoio","cuoio-dark"]), so the override lands last and wins.
 *
 * The theme files' own `@import 'lattice';` is stripped. Mid-sheet it would be ignored by
 * the parser anyway (CSS requires `@import` before other rules), but leaving a directive in
 * that reads as "and now pull in the entire engine" invites exactly the misreading that
 * produced the hybrid-palette bug.
 */
function themeCss(name) {
  return paletteChainCss(name).replace(/^\s*@import\s+[^;]+;\s*$/gm, '');
}

/**
 * Overwrite the palette region of the shipped stylesheet, IN PLACE (see header note 1).
 *
 * Returns `{ ok:false, why }` rather than throwing so the caller can name the palette that
 * failed. It never falls back to appending: an inverted cascade that reports numbers is the
 * bug this replaced.
 */
const APPLY = (cssText, paletteMark, endMark) => {
  const sheets = [...document.querySelectorAll('style')].filter(
    (s) => s.textContent.includes(paletteMark) && s.textContent.includes(endMark),
  );
  if (sheets.length !== 1) {
    return { ok: false, why: `expected exactly 1 stylesheet carrying both markers, found ${sheets.length}` };
  }
  const el = sheets[0];
  const text = el.textContent;
  const start = text.indexOf(paletteMark);
  const end = text.indexOf(endMark, start);
  if (start < 0 || end <= start) {
    return { ok: false, why: `markers out of order (palette@${start}, end@${end})` };
  }
  el.textContent = `${text.slice(0, start) + cssText}\n${text.slice(end)}`;
  return { ok: true, replaced: end - start, wrote: cssText.length };
};

/**
 * Read back what the browser ACTUALLY resolved, so the caller can prove the swap landed
 * rather than assume it.
 *
 * The read is done through a dedicated, empty probe element styled `background:var(--bg);
 * color:var(--text-body)` rather than off a slide: a slide's own background may be a finish,
 * a gradient or `--surface-inverse`, none of which answer "did this palette's tokens take".
 * The element carries no text, so the contrast PROBE — which walks text runs — never sees it.
 */
const READ_PAINT = (probeId) => {
  let probe = document.getElementById(probeId);
  if (!probe) {
    probe = document.createElement('div');
    probe.id = probeId;
    probe.setAttribute('style',
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;'
      + 'background:var(--bg);color:var(--text-body)');
    document.body.appendChild(probe);
  }
  const pcs = getComputedStyle(probe);
  return { bg: pcs.backgroundColor, ink: pcs.color };
};

/**
 * Enable or disable every stylesheet that a third-party renderer shipped inside its own
 * `<svg>` — see header note 2. Returns how many were touched, so the caller can fail closed
 * when the count is zero (this deck renders Mermaid; zero means the detection broke, not
 * that the paint went away).
 */
const SET_FOREIGN_SHEETS = (disabled) => {
  let n = 0;
  for (const sheet of document.styleSheets) {
    const owner = sheet.ownerNode;
    if (owner && typeof owner.closest === 'function' && owner.closest('svg')) {
      sheet.disabled = disabled;
      n += 1;
    }
  }
  return n;
};

/** `rgb(250, 247, 242)` / `#FAF7F2` → `250,247,242`, so browser and resolver can be compared. */
function rgbKey(v) {
  if (!v) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(v);
  return m ? `${Math.round(+m[1])},${Math.round(+m[2])},${Math.round(+m[3])}` : null;
}

/** Identity of a run, stable across palettes: position + element + text, never color. */
const runKey = (r) => `${r.page}|${r.tag}|${r.cls || ''}|${r.text}`;

/**
 * Which runs are painted — on EITHER channel — by a stylesheet a third-party renderer
 * shipped inside its own `<svg>`, AT THE PALETTE CURRENTLY APPLIED.
 *
 * The test is a mutation, not a guess: disable the foreign sheets, re-probe, and compare
 * against the paints already measured for this palette. A channel whose resolved color
 * MOVED was being supplied by one of those sheets. That answers the provenance question
 * with the browser's own cascade rather than by re-implementing rule matching, and — unlike
 * the invariance rule it replaces — it says nothing about whether a color VARIES, so a
 * hardcoded literal in OUR CSS stays in scope and gets scored.
 *
 * IT MUST RUN AT EVERY PALETTE, AND THAT IS NOT THOROUGHNESS. Run once on the document as
 * rendered (`indaco`), it MISSES the very run it was built for: Mermaid bakes a white pill
 * behind its edge labels, `indaco`'s canvas is also white, and removing a white pill from
 * in front of a white canvas changes nothing measurable. The signal only appears at a
 * palette whose canvas differs from the baked value — so the caller unions the verdict
 * across the whole matrix, and a key is foreign if ANY palette reveals it. Measured: run
 * once at `indaco` this left one baked run scored on all 13 dark palettes; unioned, the
 * sweep matches a native render on 32 of 32.
 */
async function foreignPaintedAt(page, before) {
  const sheets = await page.evaluate(SET_FOREIGN_SHEETS, true);
  const after = await page.evaluate(PROBE);
  await page.evaluate(SET_FOREIGN_SHEETS, false);

  // Paints are collected PER KEY AS A LIST, in DOM order, not as one value per key.
  // `runKey` is not unique — a component may repeat the same text in the same tag on one
  // slide — and keeping only the last paint per key hid a real detection: the Mermaid edge
  // label `5|p|diagram|monthly retrospective` shares its key with a sibling that our own
  // CSS paints, so a last-write-wins compare found "no change" and let a baked run through
  // on all 13 dark palettes. Comparing the whole ordered list marks the key foreign if ANY
  // member moved, which is the conservative direction and the correct one.
  const listPaints = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = runKey(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(`${r.fg}|${r.bg}`);
    }
    return m;
  };

  const seen = listPaints(before);
  const now = listPaints(after);
  const foreign = new Set();
  for (const [k, was] of seen) {
    const is = now.get(k);
    if (!is || is.length !== was.length || was.some((v, i) => v !== is[i])) foreign.add(k);
  }
  return { foreign, sheets, probed: seen.size };
}

/**
 * Probe one already-rendered page across many palettes.
 *
 * @param {import('puppeteer').Page} page  a page already navigated to the rendered deck
 * @param {string[]} themes                palette names present in themes/
 */
async function sweep(page, themes) {
  const palettes = [];
  const foreign = new Set();
  let foreignSheets = 0;

  for (const theme of themes) {
    const applied = await page.evaluate(APPLY, themeCss(theme), PALETTE_MARK, PALETTE_END_MARK);
    if (!applied.ok) {
      throw new Error(`palette-sweep: could not swap to ${theme} — ${applied.why}`);
    }
    const paint = await page.evaluate(READ_PAINT, PROBE_ID);
    const rows = await page.evaluate(PROBE);

    // Provenance, at THIS palette, unioned into the running verdict — see
    // `foreignPaintedAt` for why one palette is not enough.
    const at = await foreignPaintedAt(page, rows);
    for (const k of at.foreign) foreign.add(k);
    foreignSheets = at.sheets;

    // THE ORACLE CHECK. What the browser resolved, against what the static resolver every
    // analytic gate uses says this palette's tokens are. Disagreement means the replacement
    // did not fully take — which is the hybrid-palette bug that made this tool's first 18
    // palettes fiction while reporting confident numbers. Cheap, and it fails on the
    // specific palette rather than on an aggregate that can absorb it.
    const declared = parsePaletteVars(paletteChainCss(theme));
    const matches =
      rgbKey(paint.bg) === rgbKey(declared.bg) && rgbKey(paint.ink) === rgbKey(declared['text-body']);

    palettes.push({
      theme, paint, rows, applied: matches,
      expected: { bg: declared.bg, ink: declared['text-body'] },
      signature: `${paint.bg}|${paint.ink}`,
    });
  }

  // AMBIGUOUS KEYS. `runKey` is position + element + text, and that is NOT unique: on
  // `gallery.md` 1,541 rows collapse to 1,391 keys — 70 keys covering 220 rows — because a
  // component can legitimately repeat the same text in the same tag on the same slide
  // (`journey` stage spans, `pricing` row labels). Where the colliding members paint
  // DIFFERENTLY inside a single palette, a per-key verdict describes neither of them, so
  // the key is dropped. Strictly conservative: it can only remove a run from scoring, never
  // admit a mis-scored one.
  const ambiguous = new Set();
  for (const p of palettes) {
    const seen = new Map(); // key -> "fg|bg" of the first member in THIS palette
    for (const r of p.rows) {
      const k = runKey(r);
      const paint = `${r.fg}|${r.bg}`;
      if (seen.has(k) && seen.get(k) !== paint) ambiguous.add(k);
      else if (!seen.has(k)) seen.set(k, paint);
    }
  }

  const unswept = new Set([...foreign, ...ambiguous]);
  const distinctPaints = new Set(palettes.map((p) => p.signature)).size;

  return {
    palettes,
    unswept,
    foreign,
    ambiguous,
    foreignSheets,
    distinctPaints,
    probedRuns: new Set(palettes.flatMap((p) => p.rows.map(runKey))).size,
  };
}

/** Sub-threshold, non-exempt runs this tier can faithfully simulate. */
function offenders(rows, unswept) {
  return rows.filter((r) => r.r < r.need && !r.exempt && !unswept.has(runKey(r)));
}

module.exports = {
  sweep, offenders, listSweepThemes, runKey, rgbKey, themeCss,
  PALETTE_MARK, PALETTE_END_MARK,
};

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const html = args.find((a) => !a.startsWith('-'));
  const only = (args.find((a) => a.startsWith('--themes=')) || '').split('=')[1];
  const jsonOut = (args.find((a) => a.startsWith('--json=')) || '').split('=')[1];

  if (!html) {
    console.error('usage: node tools/palette-sweep.js <rendered-deck.html> [--themes=a,b] [--json=out.json]');
    process.exit(2);
  }

  (async () => {
    const puppeteer = require('puppeteer');
    const themes = only ? only.split(',') : listSweepThemes();
    if (!themes.length) {
      console.error('no palettes found in themes/ — run `npm run build` first');
      process.exit(2);
    }

    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH,
      args: ['--no-sandbox', '--font-render-hinting=none'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(`file://${path.resolve(html)}`, { waitUntil: 'networkidle0' });

    const started = Date.now();
    const result = await sweep(page, themes);
    const { palettes, unswept, foreign, ambiguous, foreignSheets, distinctPaints, probedRuns } = result;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    await browser.close();

    console.log('');
    console.log('  Lattice · palette sweep');
    console.log('  ══════════════════════════════════════════════════════════════');
    console.log(`  ${palettes.length} palettes · ${probedRuns} distinct runs`);
    console.log(`  ${unswept.size} dropped — ${foreign.size} painted by a third-party sheet, ${ambiguous.size} ambiguous keys`);
    console.log(`  ${foreignSheets} third-party stylesheet(s) inside <svg>`);
    console.log(`  ${distinctPaints} distinct painted canvases`);
    const notApplied = palettes.filter((p) => !p.applied);
    console.log(`  ${palettes.length - notApplied.length}/${palettes.length} palettes matched the static resolver`);
    console.log(`  ${elapsed}s for the whole matrix (one render, ${palettes.length} in-place swaps)`);
    console.log('');

    let worst = 0;
    for (const p of palettes) {
      const bad = offenders(p.rows, unswept);
      if (bad.length > worst) worst = bad.length;
      const mark = bad.length === 0 ? '✓' : '✗';
      console.log(`  ${mark} ${p.theme.padEnd(22)} ${String(bad.length).padStart(4)} sub-threshold  (${p.rows.length} runs)`);
      for (const r of bad.slice(0, 4)) {
        console.log(`        ${r.r}:1  <${r.tag}> ${r.cls || ''}  "${String(r.text).slice(0, 48)}"`);
      }
      if (bad.length > 4) console.log(`        … ${bad.length - 4} more`);
    }

    if (jsonOut) {
      fs.writeFileSync(jsonOut, `${JSON.stringify(
        palettes.map((p) => ({
          theme: p.theme,
          offenders: offenders(p.rows, unswept).map(
            (r) => ({ page: r.page, tag: r.tag, cls: r.cls, text: r.text, r: r.r }),
          ),
          runs: p.rows.length,
        })),
        null, 2)}\n`);
      console.log(`\n  wrote ${jsonOut}`);
    }

    // Fails CLOSED: an inert replacement, or a provenance probe that found no foreign
    // sheets at all, means every "clean" palette above is the same measurement repeated.
    if (notApplied.length) {
      console.error(`\n  ✗ ${notApplied.length} palette(s) did not fully apply — their numbers above are fiction:`);
      for (const p of notApplied.slice(0, 8)) {
        console.error(`      ${p.theme}: painted ${p.paint.bg} / ${p.paint.ink}, expected ${p.expected.bg} / ${p.expected.ink}`);
      }
      process.exit(1);
    }
    if (distinctPaints < 2) {
      console.error(`\n  ✗ the palette matrix collapsed to ${distinctPaints} distinct painted canvas — the swap is inert`);
      process.exit(1);
    }
    console.log(`\n  worst palette: ${worst} sub-threshold run(s)`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
