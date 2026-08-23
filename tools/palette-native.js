#!/usr/bin/env node
/**
 * palette-native — the REFEREE for `tools/palette-sweep.js`.
 *
 * WHY A SECOND TOOL THAT MEASURES THE SAME THING. `palette-sweep.js` renders the deck ONCE
 * and re-themes it in place, which is what makes a 32-palette matrix affordable enough to
 * gate every PR. That speed is bought with an assumption: that overwriting the palette
 * region of the export shell's stylesheet reproduces what a real render at that palette
 * would paint.
 *
 * The assumption is TEXTUAL — it depends on the shell emitting the palette first, bracketed
 * by two comment markers — and the first version of the sweep got the equivalent assumption
 * WRONG in a way no gate could see. It appended its stylesheet instead of replacing in
 * place, inverting the cascade for 30 of 126 tokens, and reported confident per-palette
 * numbers that were wrong in both directions (`onyx` 3 where the truth is 5, `atelier` 19
 * where the truth is 16). That was found by a human reviewer reading the diff. A reviewer
 * is not a gate, and the next such drift will not have one.
 *
 * So this file re-renders all 32 palettes FOR REAL — no swap, no simulation, the same
 * `runEmulator` path the rest of the integration tier uses — and answers two questions the
 * fast path cannot answer about itself:
 *
 *   1. DOES THE SWEEP STILL AGREE WITH REALITY? For every palette, the offenders the sweep
 *      reports must equal the offenders a native render reports, restricted to the runs the
 *      sweep claims to simulate. A disagreement means the shell moved under the sweep and
 *      the fast gate is measuring fiction again. This is the check that keeps the cheap
 *      path honest.
 *
 *   2. WHAT ABOUT THE RUNS THE SWEEP DROPS? Mermaid bakes its own stylesheet into the SVG
 *      at render time, so no palette swap can move it and the sweep drops those runs by
 *      construction (see that file's header note 2). They are not unmeasurable — they are
 *      only unmeasurable BY SWAPPING. A native render paints them correctly, so this tier
 *      scores them, and the coverage the fast path gives up is recovered here rather than
 *      merely disclosed.
 *
 * COST, MEASURED. ~11-13 s per palette warm on this sandbox's box, so ~6-7 minutes for the
 * full matrix against the sweep's ~70 s. That is why this runs nightly and the sweep runs
 * per-PR: the split is not "thorough vs. sloppy", it is "the same measurement at two
 * cadences, where the slow one audits the fast one".
 *
 * Usage:
 *   node tools/palette-native.js [--themes=a,b] [--json=out.json] [--deck=path.md]
 *
 * Exits non-zero if a palette fails to render or produces implausibly few runs. Contrast
 * POLICY belongs to the gate, not here — same split as `check-slide-contrast.js`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PROBE } = require('./check-slide-contrast.js');
const { listAllThemes } = require('./contrast-audit.js');
const { runKey } = require('./palette-sweep.js');
const { SANCTIONED_CONTRAST_EXEMPTIONS } = require('./contrast-exemptions.js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DECK = path.join(ROOT, 'test/integration/baseline-decks/gallery.md');

/**
 * Render `deck` at every palette and probe each one.
 *
 * `render` is injected rather than required here so the integration tier can pass its own
 * cached `runEmulator` (which hashes every renderer input and reuses a warm PDF) while the
 * CLI below passes the same helper directly. One render path, two callers.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {(palette: string) => string} renderHtml  palette -> path to the HTML sidecar
 * @param {string[]} themes
 */
async function renderMatrix(browser, renderHtml, themes) {
  const palettes = [];
  for (const theme of themes) {
    const html = renderHtml(theme);
    if (!fs.existsSync(html)) throw new Error(`palette-native: no HTML sidecar for ${theme} at ${html}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    const rows = await page.evaluate(PROBE);
    await page.close();
    palettes.push({ theme, rows });
  }
  return palettes;
}

/**
 * Sub-threshold, non-exempt runs — the same filter the sweep applies, minus its drop set.
 *
 * RAW, deliberately: this is what `reconcile` compares, and both sides must be filtered the
 * same way or the comparison is meaningless. The adjudicated decorative exemptions are
 * applied only where a HUMAN reads the number (`scored`, below).
 */
function nativeOffenders(rows) {
  return rows.filter((r) => r.r < r.need && !r.exempt);
}

/**
 * What a reader should treat as a finding: raw offenders minus the adjudications shared with
 * every other rendered-DOM gate.
 *
 * The split matters for a NIGHTLY specifically. Reporting raw marks `indaco` — the one
 * palette that is actually clean — with a ✗ every single night, because the decorative
 * watermark, its mirror and the pullquote glyph are sub-threshold on every palette by
 * construction. A scheduled job that cries wolf nightly is a job people stop reading, which
 * is the same failure as having no job.
 */
function scored(rows) {
  return nativeOffenders(rows)
    .filter((r) => !SANCTIONED_CONTRAST_EXEMPTIONS.some((e) => e.match(r)));
}

/**
 * Compare a native matrix against a sweep result, and say where they disagree.
 *
 * The comparison is restricted to the runs the sweep CLAIMS to simulate: a run the sweep
 * dropped (third-party paint, ambiguous key) is not a disagreement when the native tier
 * scores it — that is the division of labor, not a fault. Those runs are reported
 * separately as `droppedOffenders`, which is the coverage this tier adds.
 */
function reconcile(nativePalettes, sweepResult) {
  const bySweep = new Map(sweepResult.palettes.map((p) => [p.theme, p]));
  const disagreements = [];
  const droppedOffenders = [];

  for (const nat of nativePalettes) {
    const swept = bySweep.get(nat.theme);
    if (!swept) {
      disagreements.push(`${nat.theme}: rendered natively but absent from the sweep`);
      continue;
    }
    const nativeBad = new Map(nativeOffenders(nat.rows).map((r) => [runKey(r), r]));
    const sweptBad = new Set(
      swept.rows.filter((r) => r.r < r.need && !r.exempt && !sweepResult.unswept.has(runKey(r)))
        .map(runKey),
    );

    for (const [k, r] of nativeBad) {
      if (sweepResult.unswept.has(k)) { droppedOffenders.push(`${nat.theme}: ${r.r}:1 ${k}`); continue; }
      if (!sweptBad.has(k)) disagreements.push(`${nat.theme}: native says ${r.r}:1 but the sweep passed it — ${k}`);
    }
    for (const k of sweptBad) {
      if (!nativeBad.has(k)) disagreements.push(`${nat.theme}: the sweep flagged a run a native render passes — ${k}`);
    }
  }
  return { disagreements, droppedOffenders };
}

module.exports = { renderMatrix, nativeOffenders, scored, reconcile, DEFAULT_DECK };

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const only = (args.find((a) => a.startsWith('--themes=')) || '').split('=')[1];
  const jsonOut = (args.find((a) => a.startsWith('--json=')) || '').split('=')[1];
  const deck = (args.find((a) => a.startsWith('--deck=')) || '').split('=')[1] || DEFAULT_DECK;

  (async () => {
    const puppeteer = require('puppeteer');
    const { runEmulator } = require('../test/helpers/render.js');
    const themes = only ? only.split(',') : listAllThemes();

    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH,
      args: ['--no-sandbox', '--font-render-hinting=none'],
    });

    const started = Date.now();
    const palettes = await renderMatrix(
      browser,
      (palette) => runEmulator(deck, { palette }).replace(/\.pdf$/, '.html'),
      themes,
    );
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    await browser.close();

    console.log('');
    console.log('  Lattice · palette matrix, NATIVELY rendered');
    console.log('  ══════════════════════════════════════════════════════════════');
    console.log(`  ${palettes.length} palettes · ${elapsed}s · ${path.basename(deck)}`);
    console.log('');

    let thin = 0;
    for (const p of palettes) {
      const bad = scored(p.rows);
      const exempted = nativeOffenders(p.rows).length - bad.length;
      if (p.rows.length < 400) thin += 1;
      const mark = bad.length === 0 ? '✓' : '✗';
      console.log(
        `  ${mark} ${p.theme.padEnd(22)} ${String(bad.length).padStart(4)} sub-threshold  `
        + `(${p.rows.length} runs, ${exempted} adjudicated decorative)`,
      );
      for (const r of [...bad].sort((a, b) => a.r - b.r).slice(0, 4)) {
        console.log(`        ${r.r}:1  <${r.tag}> ${r.cls || ''}  "${String(r.text).slice(0, 48)}"`);
      }
      if (bad.length > 4) console.log(`        … ${bad.length - 4} more`);
    }

    if (jsonOut) {
      fs.writeFileSync(jsonOut, `${JSON.stringify(
        palettes.map((p) => ({
          theme: p.theme,
          runs: p.rows.length,
          offenders: scored(p.rows).map(
            (r) => ({ page: r.page, tag: r.tag, cls: r.cls, text: r.text, r: r.r }),
          ),
        })), null, 2)}\n`);
      console.log(`\n  wrote ${jsonOut}`);
    }

    // Fails CLOSED on a render that produced nothing to measure — every count above is
    // vacuously clean over an empty probe, which is how a broken render reads as a pass.
    if (thin) {
      console.error(`\n  ✗ ${thin} palette(s) probed under 400 text runs — the render did not reach the deck`);
      process.exit(1);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
