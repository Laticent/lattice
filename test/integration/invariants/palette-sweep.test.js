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
 *   · ONE viewport (1280x720). The deck axis is no longer one — `gallery-jargon.md` joined
 *     `gallery.md` and immediately produced a run neither this file nor any analytic gate
 *     had ever scored (see DECKS below) — but every sweep is at one width, and a fit-spine
 *     reflow is a different composite.
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

/**
 * The SURFACE axis, which is the one this file did not buy.
 *
 * The palette axis was the point: 32 palettes for the price of one render. But one deck at
 * one viewport is one surface, and a run that no deck WRITES is a run no probe can score —
 * the catalog gap is not in the CSS, it is in the markup nobody authored.
 *
 * `gallery-jargon.md` is the second deck, and it earned its place on the first honest run:
 * it writes kanban cards with STATUS sub-bullets, which `gallery.md` does not, so the
 * `[data-s]` card takes its status-tinted fill (`kanban.styles.css` — `--state-*-fill` at
 * 55% light / 26% dark over the card) and the title's `--text-heading` lands on a colored
 * wash instead of the neutral card. 18 palettes, worst 3.13:1 on `concrete-dark`. Every
 * other gate in the repo was green on it, including this one, because the run does not
 * exist in the deck this file used to sweep.
 *
 * It is also cheap, which is why it is a per-PR deck and not a nightly: ~7 s to render and
 * ~47 s to sweep, against the gallery's ~15 s + ~100 s. Both together stay inside the
 * ~4 min this tier is budgeted.
 */
const DECKS = [
  {
    id: 'gallery',
    deck: path.join(ROOT, 'test/integration/baseline-decks/gallery.md'),
    // See UNSWEPT below — these are per-deck because the drop set is a property of what
    // the deck renders, not of the sweep.
    unswept: 11, foreign: 5, ambiguous: 6, sheets: 3, minRows: 400,
  },
  {
    id: 'gallery-jargon',
    deck: path.join(ROOT, 'examples/gallery-jargon.md'),
    unswept: 10, foreign: 5, ambiguous: 5, sheets: 3, minRows: 400,
  },
];

/**
 * The bar, at zero, on every shipped palette.
 *
 * This table was a RATCHET — exceed-only, seeded at measured truth, 113 sub-threshold runs
 * across 31 of 32 palettes, with `indaco` the only zero. It is now 5 runs across 3 palettes,
 * and every remaining entry is named below with what it is waiting on.
 *
 * Keeping the table rather than asserting a flat zero is deliberate. A per-palette entry is
 * what makes a regression legible — "mustard-dark: 4 > 0" names the palette in the failure
 * message, and the coverage test below fails if a shipped palette has no entry at all, which a
 * bare `assert.equal(total, 0)` cannot do.
 *
 * WHAT CLEARED IT, because "re-tune the trios" is only half and the other half is the reason
 * the first attempt would have moved nothing: the trios were declared at plain `:root`, and
 * the export path concatenates `dist/lattice.css` AFTER the palette, so the engine default won
 * on source order and every palette's curated value was inert in a rendered PDF. This gate
 * renders through the emulator, so it was measuring base's trio on 32 canvases while
 * `composed-contrast.js` measured the palettes' own. The trios are now declared at BOTH
 * `:root` (which the packed engine / Marp paths see) and `:root:root` (which the unpacked
 * CLI export sees), and were then re-solved against the bands they land on — neither form
 * alone reaches every path, and shipping only the doubled one moved the defect to the
 * Playground rather than fixing it.
 * engineering/decisions/2026-08-23-status-trio-export-cascade.md
 *
 * THE VALUES ARE #1801's, NOT THIS CHANGE'S. `2026-08-24-status-trio-monochromacy-respacing.md`
 * re-solved all 32 trios for the achromatopsia floor while this branch was open, and those two
 * solves cannot simply be added: one moves the ink to clear its own composed tint, the other to
 * hold three distinct weights under a monochromacy, and they pull the same token opposite ways.
 * #1801's floor is the harder constraint and the one already shipped, so it wins here and the
 * composed re-curation is re-derived on top of it rather than merged with it.
 *
 * `concrete-dark: 3` is the visible consequence and is NOT a regression this change introduced —
 * measured both ways, the pre-change export painted BASE's `--fail` on those three runs at
 * 3.58 / 3.37 / 3.94:1, and concrete's own #1801 value paints them at 3.91 / 3.61 / 4.35:1. So
 * making the curated value reach the page IMPROVES every one of them; the surface was failing
 * before and fails by less now. It is frozen analytically too — `concrete-dark|dark|redline/del`
 * and its two siblings sit in `KNOWN_SUB_THRESHOLD`. A one-token fix was attempted and does not
 * exist: lifting concrete's dark `--fail` far enough to clear 4.5:1 collapses `warn^fail` under
 * achromatopsia from 0.1203 to 0.0250, straight through #1801's 0.11 floor. The three arms have
 * to be solved JOINTLY against both constraint sets, which is a re-run of #1801's solve with the
 * composed surfaces added to it — a separate change, not a merge resolution.
 *
 * A NEW PALETTE LANDS HERE at its measured truth or not at all; lowering an entry is always
 * correct, raising one needs the reason written beside it.
 */
const CEILING = {
  gallery: {
    'a11y-achromatopsia': 0,
    'a11y-base': 0,
    'a11y-deuteranopia': 0,
    'a11y-protanopia': 0,
    'a11y-tritanopia': 0,
    ardesia: 0,
    'ardesia-dark': 0,
    atelier: 0,
    'atelier-dark': 0,
    brina: 0,
    'brina-dark': 0,
    burgundy: 0,
    'burgundy-dark': 0,
    carbone: 0,
    carta: 0,
    'carta-dark': 0,
    concrete: 0,
    'concrete-dark': 3,
    crepuscolo: 0,
    'crepuscolo-dark': 0,
    cuoio: 0,
    'cuoio-dark': 0,
    indaco: 0,
    'indaco-dark': 0,
    laguna: 0,
    'laguna-dark': 0,
    magnolia: 0,
    'magnolia-dark': 0,
    mustard: 0,
    'mustard-dark': 0,
    onyx: 0,
    'onyx-dark': 0,
  },
  // NOT zero, and the 18 are ONE run: the `[data-s]` kanban card's title, `--text-heading`
  // on a status-tinted card fill. A ratchet again, on a deck that has never been swept —
  // the same shape `gallery` started at. Lowering one is always correct; the population is
  // named in the DECKS docblock above.
  'gallery-jargon': {
    'a11y-achromatopsia': 0,
    'a11y-base': 0,
    'a11y-deuteranopia': 0,
    'a11y-protanopia': 0,
    'a11y-tritanopia': 0,
    ardesia: 0,
    'ardesia-dark': 1,
    atelier: 1,
    'atelier-dark': 1,
    brina: 1,
    'brina-dark': 1,
    burgundy: 0,
    'burgundy-dark': 1,
    carbone: 1,
    carta: 0,
    'carta-dark': 1,
    concrete: 0,
    'concrete-dark': 1,
    crepuscolo: 0,
    'crepuscolo-dark': 1,
    cuoio: 1,
    'cuoio-dark': 1,
    indaco: 0,
    'indaco-dark': 1,
    laguna: 1,
    'laguna-dark': 1,
    magnolia: 1,
    'magnolia-dark': 1,
    mustard: 1,
    'mustard-dark': 1,
    onyx: 0,
    'onyx-dark': 1,
  },
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
// Per-deck, on `DECKS` above: a deck that renders no Mermaid drops nothing as foreign, and
// a deck with different repeated text has a different ambiguous set. A single shared number
// would have to be the max, which is a pin that no longer fails when one deck's drop set
// grows and another's shrinks by the same amount.

/**
 * The `<svg>`-scoped stylesheets provenance detection keys on. Zero would mean the
 * detection silently found nothing to disable — at which point every "clean" verdict below
 * is the same measurement repeated, so it is pinned rather than assumed.
 */
// (`sheets` on each DECKS entry.)

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

describe('palette sweep — every shipped palette, on every swept deck', () => {
  let browser;
  /** deck id -> sweep result. */
  const results = new Map();
  let themes;

  before(async () => {
    themes = listSweepThemes();
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--font-render-hinting=none'],
    });
    // Serially, not in parallel: the swap rewrites a `<style>` in the page it is given, and
    // two pages sharing one browser is not the cost here — the render is, and it is cached.
    for (const d of DECKS) {
      const pdf = runEmulator(d.deck, {});
      const html = pdf.replace(/\.pdf$/, '.html');
      assert.ok(fs.existsSync(html), `no HTML sidecar at ${html}`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      results.set(d.id, await sweep(page, themes));
      await page.close();
    }
  });

  after(async () => { if (browser) await browser.close(); });

  /**
   * The green-because-nothing-ran guard. Every assertion below is vacuously true over an
   * empty sweep, so a render that produced no slides — or a PROBE that threw and returned
   * [] — would pass this file as "32 clean palettes", once per deck.
   */
  test('every deck swept every shipped palette', () => {
    assert.ok(themes.length >= 30, `expected the full palette set, saw ${themes.length}`);
    assert.equal(results.size, DECKS.length, 'a deck failed to sweep');
    for (const d of DECKS) {
      const result = results.get(d.id);
      assert.equal(result.palettes.length, themes.length, `${d.id}: a palette failed to probe`);
      for (const p of result.palettes) {
        assert.ok(p.rows.length >= d.minRows,
          `${d.id}/${p.theme}: only ${p.rows.length} text runs measured — the probe is not reaching the deck`);
      }
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
   * that palette declares. Two independent paths to the same answer, on each deck.
   */
  test('every palette fully applied — browser agrees with the static resolver', () => {
    const bad = [];
    for (const d of DECKS) {
      for (const p of results.get(d.id).palettes.filter((x) => !x.applied)) {
        bad.push(`${d.id}/${p.theme}: painted ${p.paint.bg} / ${p.paint.ink}, declared ${p.expected.bg} / ${p.expected.ink}`);
      }
    }
    assert.deepEqual(bad, [], `palettes whose swapped stylesheet did not fully apply:\n  ${bad.join('\n  ')}`);
  });

  /** A matrix that collapses to one painted canvas measured one palette 32 times. */
  test('the palettes actually painted differently from each other', () => {
    for (const d of DECKS) {
      const { distinctPaints } = results.get(d.id);
      assert.ok(distinctPaints >= 20,
        `${d.id}: only ${distinctPaints} distinct painted canvases across ${themes.length} palettes — the swap looks inert`);
    }
  });

  /**
   * Provenance detection is live. It works by DISABLING the stylesheets a third-party
   * renderer ships inside its own `<svg>` and re-probing; if it finds none to disable, it
   * silently classifies nothing as foreign and every baked run gets scored with a stale
   * channel. Both decks render Mermaid, so the count is known and pinned PER DECK.
   */
  test('provenance detection found the svg-scoped stylesheets it keys on', () => {
    for (const d of DECKS) {
      assert.equal(results.get(d.id).foreignSheets, d.sheets,
        `${d.id}: svg-scoped stylesheets moved from ${d.sheets} to ${results.get(d.id).foreignSheets} — `
        + 'either the renderer changed shape, or the detection stopped finding them');
    }
  });

  /**
   * The drop set, pinned both ways and split by reason.
   *
   * A jump means new un-swappable paint shipped. A drop toward zero means the detection
   * broke and stale ink is being scored as if it followed the swap — which is not
   * hypothetical: the rule this replaced identified third-party paint by INVARIANCE ("a
   * channel that never changed must be baked"), and that cannot distinguish Mermaid's baked
   * edge-label pill from a hardcoded hex in our own CSS. It dropped 17 runs on `gallery`,
   * six more than provenance does, and the six it over-dropped were ours to score.
   */
  test('exactly the recorded runs are dropped, per deck', () => {
    for (const d of DECKS) {
      const result = results.get(d.id);
      assert.equal(result.foreign.size, d.foreign,
        `${d.id}: runs dropped as third-party-painted moved from ${d.foreign} to ${result.foreign.size}`);
      assert.equal(result.ambiguous.size, d.ambiguous,
        `${d.id}: runs dropped for an ambiguous key moved from ${d.ambiguous} to ${result.ambiguous.size}`);
      assert.equal(result.unswept.size, d.unswept,
        `${d.id}: total dropped moved from ${d.unswept} to ${result.unswept.size}`);
    }
  });

  /**
   * The offender path is live. Without this, an `offenders()` that returned [] — a bad
   * filter, a renamed row field, a threshold that stopped being attached — would satisfy
   * EVERY ceiling below and this file would report 32 clean palettes. The ceilings are all
   * upper bounds, so nothing else here can tell the difference between "clean" and "not
   * measuring". Asserted on the RAW count, before the exemptions, because the exemptions
   * are themselves a filter that could swallow everything: the decorative watermark and the
   * pullquote glyph are sub-threshold on every palette by construction.
   *
   * Per deck, and that matters now that `gallery`'s scored total is ZERO: a shared assertion
   * would be satisfied by the other deck while `gallery`'s probe quietly stopped measuring.
   */
  test('the offender detection is actually returning rows on every deck', () => {
    for (const d of DECKS) {
      const result = results.get(d.id);
      const totals = result.palettes.map((p) => offenders(p.rows, result.unswept).length);
      assert.ok(Math.max(...totals) > 0,
        `${d.id}: no palette reported a single sub-threshold run — the offender filter is not measuring`);
    }
  });

  test('the ceiling table lines up with the decks and palettes actually swept', () => {
    assert.deepEqual(Object.keys(CEILING).sort(), DECKS.map((d) => d.id).sort(),
      'the ceiling table and DECKS disagree about which decks are swept');
    const swept = new Set(themes);
    for (const d of DECKS) {
      const listed = new Set(Object.keys(CEILING[d.id]));
      const missing = [...swept].filter((t) => !listed.has(t));
      const stale = [...listed].filter((t) => !swept.has(t));
      assert.deepEqual(missing, [], `${d.id}: palettes swept with no ceiling entry: ${missing.join(', ')}`);
      assert.deepEqual(stale, [], `${d.id}: ceiling entries for palettes that no longer ship: ${stale.join(', ')}`);
    }
  });

  test('no palette exceeds its recorded ceiling on any deck', () => {
    const over = [];
    const under = [];
    for (const d of DECKS) {
      const result = results.get(d.id);
      for (const p of result.palettes) {
        const bad = scored(p.rows, result.unswept);
        const ceiling = CEILING[d.id][p.theme];
        if (bad.length > ceiling) {
          const worst = [...bad].sort((a, b) => a.r - b.r).slice(0, 5);
          over.push(`${d.id}/${p.theme}: ${bad.length} > ${ceiling}\n${worst.map(
            (r) => `        ${r.r}:1 <${r.tag}> ${r.cls || ''} "${String(r.text).slice(0, 56)}"`).join('\n')}`);
        } else if (bad.length < ceiling) {
          under.push(`${d.id}/${p.theme}: ${bad.length} (ceiling ${ceiling})`);
        }
      }
    }
    // Progress prints and invites lowering the number, exactly as the sibling gate's
    // pre-existing backlog does — a ceiling nobody ever lowers is a budget, not a ratchet.
    if (under.length) console.log(`      ↓ below ceiling — lower these:\n        ${under.join('\n        ')}`);
    assert.deepEqual(over, [], `palettes above their recorded ceiling:\n  ${over.join('\n  ')}`);
  });
});
