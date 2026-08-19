#!/usr/bin/env node
/**
 * palette-sweep — the rendered-DOM contrast probe, over EVERY shipped palette.
 *
 * WHY THIS EXISTS. `check-slide-contrast.js` measures the real DOM and has found every
 * contrast defect this repo has shipped. It is also, structurally, the only tier that can
 * see a CASCADE defect — a token that is correct in the table and still loses to whichever
 * rule actually wins. `slide-contrast.test.js` wires it to CI, and covers `indaco` and
 * `indaco-dark`. Thirty of the thirty-two shipped palettes have never been measured this
 * way, on any deck, ever. Analytic gates cover them — and analytic gates are precisely the
 * layer that certified a 1:1 invisible label as correct (2026-08-19-website-accessibility-gate).
 *
 * WHY IT WAS NOT DONE BEFORE, AND WHY THAT REASONING WAS WRONG. A palette matrix reads as
 * unaffordable: one gallery render is 36 s, so 32 of them is roughly 19 minutes of wall
 * clock for one deck. But the render is not the palette-dependent part. Parsing the
 * markdown, rendering Mermaid, running KaTeX and laying out 117 slides produce the same DOM
 * whatever the colors are; only the PAINT changes. So the document is rendered ONCE and
 * re-themed in place, and the measured cost of a swap plus a full re-probe is
 * 150-270 ms. The matrix is ~45x cheaper than re-rendering, which is the difference between
 * a nightly job nobody runs and a per-PR gate.
 *
 * THE TWO THINGS THAT MAKE THIS HONEST RATHER THAN FAST.
 *
 *   1. BAKED PAINT DOES NOT FOLLOW A STYLESHEET, AND IT POISONS PER-CHANNEL. The exported
 *      gallery carries 6,197 `var()` reads — which re-resolve — and 755 raw hex values
 *      which do not: Mermaid bakes its label ink and node fills at render time. The
 *      dangerous case is not a run where BOTH channels are baked; it is a run where ONE is.
 *      A Mermaid label keeps a stale ink while the canvas behind it follows the swap, so
 *      the ratio scored is a color from palette A against a ground from palette B — a
 *      number that describes no rendered pixel anywhere. Measured: it reported Mermaid
 *      labels at 1.09:1 and 1.17:1 on every dark palette, which is neither a real defect
 *      nor a real pass. So invariance is tracked PER CHANNEL, and a run is dropped from
 *      the per-palette scores if EITHER its ink or its ground never moved across the whole
 *      sweep. Those runs belong to the analytic tier, which covers all 32 palettes at
 *      their own source (`diagram-ink-contrast`, `diagram-nontext-contrast`,
 *      `checkCatContrast`). The count of dropped runs is reported, so the coverage this
 *      sweep gives up is a number on the screen rather than a silence. Detection is
 *      empirical rather than a guess about which selectors are baked, so a legitimately
 *      palette-invariant ink lands in the same bucket — the conservative direction.
 *
 *   2. A SWAP THAT SILENTLY FAILS MUST NOT READ AS A CLEAN PALETTE. If the injected
 *      stylesheet were ignored — a CSP change, a specificity change in the export shell, a
 *      renamed dist path — every palette would probe identically and the sweep would report
 *      32 clean palettes having measured one. So each palette's painted canvas and ink are
 *      recorded as a signature and the DISTINCT COUNT is reported; a caller fails when the
 *      matrix collapses. The first version of this compared each palette against the one
 *      BEFORE it and reported six false alarms, because sibling palettes legitimately paint
 *      the same canvas — the four `a11y-*` variants share a ground by construction. An
 *      adjacent-pair test measures sort order, not repaint. This is the failure mode this
 *      repo has been bitten by twice (a probe returning [] scoring as zero failures, a token
 *      audit reporting 0 fails because every pair was unresolvable), so it fails CLOSED.
 *
 * CSP. `page.addStyleTag()` is blocked by the export shell's Content-Security-Policy —
 * measured, it throws "Could not load style". The stylesheet is therefore built from inside
 * the page with `page.evaluate`, the same idiom `axe-a11y.test.js` uses to get the axe
 * bundle past the player's CSP.
 *
 * SPECIFICITY. The injected `<style>` is appended to `<head>` and targets `:root`, exactly
 * as the shell's own inlined palette does, so it wins on source order at equal specificity.
 * That includes `color-scheme`, which is what lets a dark-pinned theme file flip
 * `light-dark()` for the whole document — 14 of the 32 theme files are dark-pinned, so the
 * 32 files ARE the shipped matrix and no media emulation is needed.
 *
 * Usage:
 *   node tools/palette-sweep.js <rendered-deck.html> [--themes a,b,c] [--json out.json]
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

const STYLE_ID = '__palette_sweep__';
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
 */
function themeCss(name) {
  return paletteChainCss(name);
}

/**
 * Swap the document's palette from inside the page (CSP-safe) and read back what the
 * browser ACTUALLY resolved, so the caller can prove the swap landed rather than assume it.
 *
 * The read is done through a dedicated, empty probe element styled `background:var(--bg);
 * color:var(--text-body)` rather than off a slide: a slide's own background may be a finish,
 * a gradient or `--surface-inverse`, none of which answer "did this palette's tokens take".
 * The element carries no text, so the contrast PROBE — which walks text runs — never sees it.
 */
const APPLY = (cssText, styleId, probeId) => {
  let el = document.getElementById(styleId);
  if (!el) {
    el = document.createElement('style');
    el.id = styleId;
    document.head.appendChild(el);
  }
  el.textContent = cssText;

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
 * Probe one already-rendered page across many palettes.
 *
 * @param {import('puppeteer').Page} page  a page already navigated to the rendered deck
 * @param {string[]} themes                palette names present in dist/themes/
 * @returns {Promise<{palettes: object[], unswept: Set<string>, distinctPaints: number, probedRuns: number}>}
 */
async function sweep(page, themes) {
  const palettes = [];

  for (const theme of themes) {
    const paint = await page.evaluate(APPLY, themeCss(theme), STYLE_ID, PROBE_ID);
    const rows = await page.evaluate(PROBE);

    // THE ORACLE CHECK. What the browser resolved, against what the static resolver every
    // analytic gate uses says this palette's tokens are. Disagreement means the injected
    // stylesheet did not fully apply — which is exactly the hybrid-palette bug that made
    // this tool's first 18 palettes fiction while reporting confident numbers. Cheap, and
    // it fails on the specific palette rather than on an aggregate that can absorb it.
    const declared = parsePaletteVars(paletteChainCss(theme));
    const applied =
      rgbKey(paint.bg) === rgbKey(declared.bg) && rgbKey(paint.ink) === rgbKey(declared['text-body']);

    palettes.push({
      theme, paint, rows, applied,
      expected: { bg: declared.bg, ink: declared['text-body'] },
      signature: `${paint.bg}|${paint.ink}`,
    });
  }

  // PER-CHANNEL invariance. See header note 1: a run with one baked channel scores a
  // color from one palette against a ground from another, which describes no pixel.
  const ink = new Map();    // key -> Set(fg)
  const ground = new Map(); // key -> Set(bg)
  for (const p of palettes) {
    for (const r of p.rows) {
      const k = runKey(r);
      if (!ink.has(k)) { ink.set(k, new Set()); ground.set(k, new Set()); }
      ink.get(k).add(String(r.fg));
      ground.get(k).add(String(r.bg));
    }
  }
  const unswept = new Set();
  for (const k of ink.keys()) {
    if (ink.get(k).size === 1 || ground.get(k).size === 1) unswept.add(k);
  }

  const distinctPaints = new Set(palettes.map((p) => p.signature)).size;

  return { palettes, unswept, distinctPaints, probedRuns: ink.size };
}

/** Sub-threshold, non-exempt runs whose ink AND ground both followed the swap. */
function offenders(rows, unswept) {
  return rows.filter((r) => r.r < r.need && !r.exempt && !unswept.has(runKey(r)));
}

module.exports = { sweep, offenders, listSweepThemes, runKey, rgbKey, STYLE_ID };

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
      console.error('no palettes found in dist/themes — run `npm run build` first');
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
    const { palettes, unswept, distinctPaints, probedRuns } = await sweep(page, themes);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    await browser.close();

    console.log('');
    console.log('  Lattice · palette sweep');
    console.log('  ══════════════════════════════════════════════════════════════');
    console.log(`  ${palettes.length} palettes · ${probedRuns} distinct runs · ${unswept.size} dropped (a channel never moved)`);
    // The drop count is only meaningful over the FULL set. Across two palettes plenty of
    // runs coincidentally share an ink or a ground, so a `--themes=a,b` run reports
    // hundreds of drops and none of them mean baked paint. Say so rather than let the
    // number be read as a finding.
    if (palettes.length < 8) {
      console.log(`  ⚠ ${palettes.length} palettes only — the drop count is not meaningful below the full set`);
    }
    console.log(`  ${distinctPaints} distinct painted canvases`);
    const notApplied = palettes.filter((p) => !p.applied);
    console.log(`  ${palettes.length - notApplied.length}/${palettes.length} palettes matched the static resolver`);
    console.log(`  ${elapsed}s for the whole matrix (one render, ${palettes.length} re-probes)`);
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
        palettes.map((p) => ({ theme: p.theme, offenders: offenders(p.rows, unswept).length, runs: p.rows.length })),
        null, 2)}\n`);
      console.log(`\n  wrote ${jsonOut}`);
    }

    // Fails CLOSED on a collapsed matrix: distinct paints at or near 1 means the injected
    // stylesheet is inert and every "clean" palette above is the same measurement repeated.
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
