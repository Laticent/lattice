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
 * palette-wide defect could sit in `main` indefinitely: the one palette anybody looks at is
 * very nearly the best one. Two defects this file found on its first honest run, both
 * invisible to every existing gate:
 *
 *   · `mustard`'s `--accent` was ink on both plain canvases at 4.35:1 and 3.89:1 — 79
 *     sub-threshold runs across fourteen component classes. No analytic gate scored
 *     `--accent` AS INK on `--bg` / `--bg-alt`; the row exists now.
 *   · the `journey` mood legend's numeric keys carried an `opacity: 0.85` wash over
 *     `--text-secondary` — 35 runs on seven palettes, worst 3.72:1. The labels DIRECTLY
 *     ABOVE them in the same file had that exact wash removed for that exact reason; this
 *     rule kept it and stayed green, because `indaco` lands at 4.72:1 and passes.
 *
 * WHY IT IS AFFORDABLE. The palette is not the expensive part of a render. Parsing the
 * markdown, rendering Mermaid, running KaTeX and laying out 117 slides produce the same DOM
 * whatever the colors are; only paint changes. `tools/palette-sweep.js` renders ONCE and
 * re-themes in place: ~15 s for the render and ~2 min for all 32 palettes, against ~7
 * minutes to re-render the matrix natively.
 *
 * WHY THE FAST PATH CAN BE TRUSTED, WHICH IS A SEPARATE QUESTION FROM WHETHER IT IS FAST.
 * The sweep's first version APPENDED its stylesheet to `<head>` instead of replacing the
 * palette in place. The export shell puts the palette FIRST and `dist/lattice.css` after,
 * so appending inverted the cascade for 30 of 126 tokens and produced confident numbers
 * that were wrong in BOTH directions — `onyx` 3 where the truth is 5 (two real `redline`
 * runs missed), `atelier` 19 where the truth is 16 (three invented). No gate could tell; a
 * human reading the diff caught it. So the assumption now has two guards: this file's
 * oracle check, and `tools/palette-native.js`, which re-renders all 32 for real on the
 * nightly and fails if the two disagree. The sweep has been reconciled against a native
 * render of every palette, and agrees on 32 of 32.
 *
 * WHAT IT STILL DOES NOT COVER:
 *   · ONE deck (`gallery.md`) and ONE viewport (1280x720) — the palette axis is what this
 *     file buys; the surface axis is still `slide-contrast.test.js`'s three.
 *   · Runs painted by a stylesheet a third-party renderer ships INSIDE its own `<svg>` are
 *     dropped, because no palette swap can move them: Mermaid resolves its stylesheet
 *     against whatever palette was in force at RENDER time. They are not unmeasurable, only
 *     unmeasurable by swapping — `tools/palette-native.js` scores them on the nightly.
 *   · The decorative exclusions are NOT re-litigated here. They are the same adjudications
 *     `slide-contrast.test.js` made, imported from the module both gates share.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');

const { ROOT, runEmulator } = require('../../helpers/render');
const { sweep, offenders, listSweepThemes } = require('../../../tools/palette-sweep.js');
const { SANCTIONED_CONTRAST_EXEMPTIONS } = require('../../../tools/contrast-exemptions.js');

const DECK = path.join(ROOT, 'test/integration/baseline-decks/gallery.md');

/**
 * Exceed-only ceilings, measured on `gallery.md` at 1280x720 AFTER the shared decorative
 * exemptions apply.
 *
 * A number here is a debt, not a budget: lowering one is always correct and never needs
 * this comment updated. What remains is ONE population, and naming it is the point —
 * every row below is status or accent ink sitting on a tint OF ITSELF:
 *
 *   · `redline`'s `<ins>` / `<del>` on `--pass-bg` / `--fail-bg` (82 runs, 19 palettes)
 *   · the inline-code chip inside a `kanban` card, dark mode only (28 runs, 5 palettes)
 *   · `policy-recommendation`'s adopt badge (2 runs) and one `kpi target` row
 *
 * The background MOVES WITH THE INK, so re-tuning a hue gains nothing on its own and
 * lowering the tint alone plateaus — measured across all 32 palettes, dropping the tint
 * from 12% to 3% clears roughly a third and stalls. Clearing the rest means re-curating
 * the status trios across the fifteen palettes that self-curate them, which is a palette
 * change with its own blast radius and its own visual sign-off, and is already tracked as
 * its own slice (#1698). It does not belong in the change that first measured it — HARD
 * RULE #18's pre-existing / off-path arm. `tools/composed-contrast.js` holds the same
 * population analytically, at 108 frozen pairs.
 *
 * `indaco` is at zero. It is the only one, and that is the whole argument for this file.
 */
const CEILING = {
  'a11y-achromatopsia': 2,
  'a11y-base': 2,
  'a11y-deuteranopia': 2,
  'a11y-protanopia': 2,
  'a11y-tritanopia': 2,
  ardesia: 2,
  'ardesia-dark': 3,
  atelier: 6,
  'atelier-dark': 2,
  brina: 3,
  'brina-dark': 3,
  burgundy: 2,
  'burgundy-dark': 7,
  carbone: 5,
  carta: 2,
  'carta-dark': 2,
  concrete: 9,
  'concrete-dark': 7,
  crepuscolo: 2,
  'crepuscolo-dark': 7,
  cuoio: 2,
  'cuoio-dark': 5,
  indaco: 0,
  'indaco-dark': 2,
  laguna: 2,
  'laguna-dark': 7,
  magnolia: 4,
  'magnolia-dark': 2,
  mustard: 6,
  'mustard-dark': 7,
  onyx: 2,
  'onyx-dark': 2,
};

/**
 * Runs dropped from the per-palette scores, pinned so the coverage given up stays visible.
 *
 * FIVE because a third-party stylesheet inside an `<svg>` paints one of their channels —
 * Mermaid's baked edge-label pills — and SIX because their `runKey` (`page|tag|class|text`)
 * is not unique and the colliding members paint differently, so a per-key verdict describes
 * neither of them.
 *
 * Pinned BOTH ways. A jump means new un-swappable paint shipped. A drop toward zero means
 * the detection broke and stale ink is being scored as if it followed the swap — which is
 * not hypothetical: the rule this replaced identified third-party paint by INVARIANCE ("a
 * channel that never changed must be baked"), and that cannot distinguish Mermaid's pill
 * from a hardcoded hex in our own CSS. It dropped 17 runs, six more than provenance does,
 * and the six it over-dropped were ours to score.
 */
const UNSWEPT_RUNS = 11;
const FOREIGN_RUNS = 5;
const AMBIGUOUS_RUNS = 6;

/**
 * The `<svg>`-scoped stylesheets provenance detection keys on. Zero would mean the
 * detection silently found nothing to disable — at which point every "clean" verdict below
 * is the same measurement repeated, so it is pinned rather than assumed.
 */
const FOREIGN_SHEETS = 3;

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

/** Sub-threshold runs this tier simulates, minus the adjudications both gates share. */
function scored(rows, unswept) {
  return offenders(rows, unswept)
    .filter((r) => !SANCTIONED_CONTRAST_EXEMPTIONS.some((e) => e.match(r)));
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
   * So every palette is checked against the static resolver every ANALYTIC gate uses: the
   * browser's resolved `--bg` and `--text-body` must equal what `contrast-audit.js` says
   * that palette declares. Two independent paths to the same answer.
   */
  test('every palette fully applied — browser agrees with the static resolver', () => {
    const bad = result.palettes.filter((p) => !p.applied).map(
      (p) => `${p.theme}: painted ${p.paint.bg} / ${p.paint.ink}, declared ${p.expected.bg} / ${p.expected.ink}`,
    );
    assert.deepEqual(bad, [], `palettes whose swapped stylesheet did not fully apply:\n  ${bad.join('\n  ')}`);
  });

  /** A matrix that collapses to one painted canvas measured one palette 32 times. */
  test('the palettes actually painted differently from each other', () => {
    assert.ok(result.distinctPaints >= 20,
      `only ${result.distinctPaints} distinct painted canvases across ${themes.length} palettes — the swap looks inert`);
  });

  /**
   * Provenance detection is live. It works by DISABLING the stylesheets a third-party
   * renderer ships inside its own `<svg>` and re-probing; if it finds none to disable, it
   * silently classifies nothing as foreign and every baked run gets scored with a stale
   * channel. This deck renders Mermaid, so the count is known and pinned.
   */
  test(`provenance detection found the ${FOREIGN_SHEETS} svg-scoped stylesheets it keys on`, () => {
    assert.equal(result.foreignSheets, FOREIGN_SHEETS,
      `svg-scoped stylesheets moved from ${FOREIGN_SHEETS} to ${result.foreignSheets} — `
      + 'either the renderer changed shape, or the detection stopped finding them');
  });

  /** The drop set, pinned both ways and split by reason — see UNSWEPT_RUNS. */
  test(`exactly ${UNSWEPT_RUNS} runs are dropped (${FOREIGN_RUNS} foreign, ${AMBIGUOUS_RUNS} ambiguous)`, () => {
    assert.equal(result.foreign.size, FOREIGN_RUNS,
      `runs dropped as third-party-painted moved from ${FOREIGN_RUNS} to ${result.foreign.size}`);
    assert.equal(result.ambiguous.size, AMBIGUOUS_RUNS,
      `runs dropped for an ambiguous key moved from ${AMBIGUOUS_RUNS} to ${result.ambiguous.size}`);
    assert.equal(result.unswept.size, UNSWEPT_RUNS,
      `total dropped moved from ${UNSWEPT_RUNS} to ${result.unswept.size}`);
  });

  /**
   * The offender path is live. Without this, an `offenders()` that returned [] — a bad
   * filter, a renamed row field, a threshold that stopped being attached — would satisfy
   * EVERY ceiling below and this file would report 32 clean palettes. The ceilings are all
   * upper bounds, so nothing else here can tell the difference between "clean" and "not
   * measuring". Asserted on the RAW count, before the exemptions, because the exemptions
   * are themselves a filter that could swallow everything: the decorative watermark and the
   * pullquote glyph are sub-threshold on every palette by construction.
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
      const bad = scored(p.rows, result.unswept);
      const ceiling = CEILING[p.theme];
      if (bad.length > ceiling) {
        const worst = [...bad].sort((a, b) => a.r - b.r).slice(0, 5);
        over.push(`${p.theme}: ${bad.length} > ${ceiling}\n${worst.map(
          (r) => `        ${r.r}:1 <${r.tag}> ${r.cls || ''} "${String(r.text).slice(0, 56)}"`).join('\n')}`);
      } else if (bad.length < ceiling) {
        under.push(`${p.theme}: ${bad.length} (ceiling ${ceiling})`);
      }
    }
    // Progress prints and invites lowering the number, exactly as the sibling gate's
    // pre-existing backlog does — a ceiling nobody ever lowers is a budget, not a ratchet.
    if (under.length) console.log(`      ↓ below ceiling — lower these:\n        ${under.join('\n        ')}`);
    assert.deepEqual(over, [], `palettes above their recorded ceiling:\n  ${over.join('\n  ')}`);
  });
});
