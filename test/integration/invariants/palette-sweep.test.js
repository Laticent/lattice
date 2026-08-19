/**
 * PALETTE SWEEP — the rendered-DOM contrast probe over every shipped palette.
 *
 * WHAT THIS ADDS THAT `slide-contrast.test.js` DOES NOT. That file owns rendered-DOM
 * contrast POLICY and does it well, on three surfaces: the gallery at `indaco`, the same
 * gallery at `indaco-dark`, and editorial prose at `indaco`. One palette family. The
 * rendered tier is the only one that can see a cascade or composition defect — a token
 * that is correct in every table and still loses to whichever rule actually paints — and
 * thirty of the thirty-two shipped palettes had never been measured that way on any deck.
 *
 * The selection effect that hid this is worth stating plainly, because it is the reason a
 * palette-wide defect could sit in `main` indefinitely: measured across all 32, the gated
 * palette scores 5 sub-threshold runs and SIXTEEN palettes score worse. The one palette
 * anybody looks at is very nearly the best one.
 *
 * WHY IT IS AFFORDABLE. The palette is not the expensive part of a render. Parsing the
 * markdown, rendering Mermaid, running KaTeX and laying out 117 slides produce the same DOM
 * whatever the colors are; only paint changes. `tools/palette-sweep.js` renders ONCE and
 * re-themes in place. Measured on this suite's own box: ~15 s for the render and ~80 s
 * for all 32 probes, against ~19 minutes to re-render the matrix. See that tool's header
 * for the two mechanisms that keep it honest (per-channel baked-paint detection, and the
 * oracle check below).
 *
 * WHAT THIS FILE ASSERTS, read literally. Not "every palette clears AA" — three of the four
 * assertions below are integrity checks on the measurement itself, and the fourth is an
 * exceed-only CEILING seeded at measured truth. A ratchet, not a bar: today's counts are
 * recorded so they can only fall, and a palette that regresses fails immediately. Seeding
 * at zero would have meant blocking on a re-tune of `mustard` — 95 runs across eight
 * component classes, 90 of them in the 3.5-4.5 band, i.e. runs that clear WCAG's large-text
 * allowance and fail the flat 4.5 floor this repo deliberately holds instead (see PROBE's
 * `AA` note and 2026-08-18-contrast-floor-deck-scale.md). That re-tune is a palette change
 * with its own blast radius and does not belong in the change that first measured it
 * (HARD RULE #18's pre-existing / off-path arm). The number is in the table below, in the
 * open, and it can only go down.
 *
 * WHAT IT STILL DOES NOT COVER:
 *   · ONE deck (`gallery.md`) and ONE viewport (1280x720) — the palette axis is what this
 *     file buys; the surface axis is still `slide-contrast.test.js`'s three.
 *   · Runs whose ink or ground never moved across the sweep are DROPPED, because a stale
 *     ink scored against a live ground describes no rendered pixel. That is Mermaid's baked
 *     label paint, and it is covered analytically over all 32 palettes by
 *     `diagram-ink-contrast` / `diagram-nontext-contrast` / `checkCatContrast`. The count is
 *     asserted below so the coverage given up is pinned rather than silent.
 *   · The exclusion ledgers in `slide-contrast.test.js` (decorative watermark, raster
 *     backdrop) are NOT re-litigated here; those runs fail on every palette and so sit
 *     inside every ceiling below.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');

const { ROOT, runEmulator } = require('../../helpers/render');
const { sweep, offenders, listSweepThemes } = require('../../../tools/palette-sweep.js');

const DECK = path.join(ROOT, 'test/integration/baseline-decks/gallery.md');

/**
 * Exceed-only ceilings, seeded at the measured truth of `gallery.md` at 1280x720.
 *
 * A number here is a debt, not a budget: lowering one is always correct and never needs
 * this comment updated. `mustard` is the outlier and the reason this landed as a ratchet —
 * its 95 are spread across glossary / list-tabular / list / journey / stats / list-criteria
 * / timeline-list, which is a palette-wide ink tuning question rather than any component's
 * bug.
 */
const CEILING = {
  'a11y-achromatopsia': 3,
  'a11y-base': 3,
  'a11y-deuteranopia': 3,
  'a11y-protanopia': 3,
  'a11y-tritanopia': 5,
  ardesia: 5,
  'ardesia-dark': 5,
  atelier: 19,
  'atelier-dark': 5,
  brina: 11,
  'brina-dark': 5,
  burgundy: 9,
  'burgundy-dark': 8,
  carbone: 7,
  carta: 5,
  'carta-dark': 5,
  concrete: 14,
  'concrete-dark': 10,
  crepuscolo: 7,
  'crepuscolo-dark': 10,
  cuoio: 10,
  'cuoio-dark': 8,
  indaco: 5,
  'indaco-dark': 5,
  laguna: 10,
  'laguna-dark': 10,
  magnolia: 14,
  'magnolia-dark': 5,
  mustard: 95,
  'mustard-dark': 10,
  onyx: 3,
  'onyx-dark': 3,
};

/** Runs dropped because a channel never followed the swap. Pinned so the loss stays visible. */
const UNSWEPT_RUNS = 11;

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

describe('palette sweep — the rendered gallery, across every shipped palette', () => {
  let browser;
  let result;
  let themes;

  before(async () => {
    themes = listSweepThemes();
    const pdf = runEmulator(DECK, {});
    const html = pdf.replace(/\.pdf$/, '.html');
    assert.ok(fs.existsSync(html), `no HTML sidecar at ${html}`);

    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--font-render-hinting=none'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    result = await sweep(page, themes);
    await page.close();
  });

  after(async () => { if (browser) await browser.close(); });

  /**
   * The green-because-nothing-ran guard. Every assertion below is vacuously true over an
   * empty sweep, so a render that produced no slides — or a PROBE that threw and returned
   * [] — would pass this file as "32 clean palettes".
   */
  test('the sweep measured every shipped palette', () => {
    assert.ok(themes.length >= 30, `expected the full palette set, saw ${themes.length}`);
    assert.equal(result.palettes.length, themes.length, 'a palette failed to probe');
    for (const p of result.palettes) {
      assert.ok(p.rows.length >= 400,
        `${p.theme}: only ${p.rows.length} text runs measured — the probe is not reaching the deck`);
    }
  });

  /**
   * THE ORACLE CHECK, and the reason this file can be trusted at all.
   *
   * Injecting `dist/themes/<name>.min.css` LOOKED like it worked and was fiction for 18 of
   * the 32: those files are override layers that reach their base through `@import`, which
   * does not load inside an injected `<style>`, so each one landed on top of whichever
   * palette went before it. The sweep reported confident per-palette numbers for hybrids
   * that exist in no build — `mustard` and `a11y-base`, unrelated palettes, produced
   * byte-identical offender breakdowns, which is the only reason it was caught.
   *
   * So every palette is now checked against the static resolver every ANALYTIC gate uses:
   * the browser's resolved `--bg` and `--text-body` must equal what `contrast-audit.js`
   * says that palette declares. Two independent paths to the same answer.
   */
  test('every palette fully applied — browser agrees with the static resolver', () => {
    const bad = result.palettes.filter((p) => !p.applied).map(
      (p) => `${p.theme}: painted ${p.paint.bg} / ${p.paint.ink}, declared ${p.expected.bg} / ${p.expected.ink}`,
    );
    assert.deepEqual(bad, [], `palettes whose injected stylesheet did not fully apply:\n  ${bad.join('\n  ')}`);
  });

  /** A matrix that collapses to one painted canvas measured one palette 32 times. */
  test('the palettes actually painted differently from each other', () => {
    assert.ok(result.distinctPaints >= 20,
      `only ${result.distinctPaints} distinct painted canvases across ${themes.length} palettes — the swap looks inert`);
  });

  /**
   * Baked paint is dropped rather than mis-scored (see the tool's header). Pinned BOTH
   * ways: a jump means new un-swappable paint shipped, and a drop to zero means the
   * detection broke and stale ink is being scored as if it followed the swap.
   */
  test(`exactly ${UNSWEPT_RUNS} runs are dropped for not following the swap`, () => {
    assert.equal(result.unswept.size, UNSWEPT_RUNS,
      `runs dropped as un-swept moved from ${UNSWEPT_RUNS} to ${result.unswept.size} — `
      + 'either new baked paint shipped, or the per-channel detection changed shape');
  });

  /**
   * The offender path is live. Without this, an `offenders()` that returned [] — a bad
   * filter, a renamed row field, a threshold that stopped being attached — would satisfy
   * EVERY ceiling below and this file would report 32 clean palettes. The ceilings are all
   * upper bounds, so nothing else here can tell the difference between "clean" and "not
   * measuring". Zero is not a plausible reading of this deck: the decorative watermark and
   * the raster-backdrop runs are sub-threshold on every palette by construction.
   */
  test('the offender detection is actually returning rows', () => {
    const totals = result.palettes.map((p) => offenders(p.rows, result.unswept).length);
    assert.ok(Math.max(...totals) > 0,
      'no palette reported a single sub-threshold run — the offender filter is not measuring');
  });

  test('the ceiling table lines up with the palettes actually swept', () => {
    const swept = new Set(themes);
    const listed = new Set(Object.keys(CEILING));
    const missing = [...swept].filter((t) => !listed.has(t));
    const stale = [...listed].filter((t) => !swept.has(t));
    assert.deepEqual(missing, [], `palettes swept with no ceiling entry: ${missing.join(', ')}`);
    assert.deepEqual(stale, [], `ceiling entries for palettes that no longer ship: ${stale.join(', ')}`);
  });

  test('no palette exceeds its recorded ceiling', () => {
    const over = [];
    const under = [];
    for (const p of result.palettes) {
      const n = offenders(p.rows, result.unswept).length;
      const ceiling = CEILING[p.theme];
      if (n > ceiling) {
        const worst = offenders(p.rows, result.unswept).sort((a, b) => a.r - b.r).slice(0, 5);
        over.push(`${p.theme}: ${n} > ${ceiling}\n${worst.map(
          (r) => `        ${r.r}:1 <${r.tag}> ${r.cls || ''} "${String(r.text).slice(0, 56)}"`).join('\n')}`);
      } else if (n < ceiling) {
        under.push(`${p.theme}: ${n} (ceiling ${ceiling})`);
      }
    }
    // Progress prints and invites lowering the number, exactly as the sibling gate's
    // pre-existing backlog does — a ceiling nobody ever lowers is a budget, not a ratchet.
    if (under.length) console.log(`      ↓ below ceiling — lower these:\n        ${under.join('\n        ')}`);
    assert.deepEqual(over, [], `palettes above their recorded ceiling:\n  ${over.join('\n  ')}`);
  });
});
