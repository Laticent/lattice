/**
 * Unit: OKLab + WCAG assessment of the CURATED chart palettes.
 *
 * The chart-family curation contract (chart-family.style.md › "Curating a
 * remaining theme" / design/theming.md › "Curate assessment-first") says a
 * theme's `--chart-cat*` and its status solids (`--pass` … `--mute`) must, on BOTH canvases:
 *
 *   1. marks clear the canvas      — each hue vs `--bg` ≥ 3:1 (WCAG 1.4.11,
 *                                     non-text graphical contrast)
 *   2. categories are distinct     — adjacent `--chart-cat*` ≥ 0.15 OKLab
 *   3. status roles are distinct   — the 5 status solids mutually ≥ 0.12
 *
 * This locks that in for all 13 curated themes (cuoio/onyx/indaco were the
 * original exemplars; the rest were brought to parity), so a re-curation that
 * picks a hue too close to the canvas or to a neighbor fails here instead of
 * shipping muddy/indistinct charts. Resolves the full
 * token expression — `light-dark()`, `var()` with fallback, and
 * `color-mix(in oklab, …)` (the dark-side hues + tints) — which the existing
 * contrast-audit.js intentionally skips.
 *
 * If a test fails: a curation dropped a hue below the bar. Re-tune the hue
 * (lift it off the canvas / spread it from its neighbor); do not lower the bar.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { baseThemeNames } = require('../../helpers/palette');

// Scope from the manifests — this array had 13 names and omitted `carta`.
const CURATED = baseThemeNames();

// The four accessibility palettes, which `baseThemeNames()` does NOT return.
//
// Only rule 1 applies to them, and the split is the whole point. Rule 2
// (adjacent slots >= 0.15 OKLab) is DELIBERATELY waived here — a11y-base says it
// outright, and `cvd-palette.test.js` gates the consequence: "the categorical
// cycle CANNOT be separated by color under CVD (~1-2 distinct — that's what the
// texture patterns carry)". Rule 3 (the status trio) is that file's subject too.
//
// Rule 1 is different in kind and was never waived anywhere: a mark you cannot
// SEE against the canvas is a defect on any palette, and it has nothing to do
// with whether hue tells two marks apart. Leaving these four outside the only
// gate that asserts it is what let `--cat-N-mark` ship at 1.55:1 on a
// `_class: dark` slide — the exact ratio, on the exact seam, that a11y-base's
// own `--cat-on-mark` comment records having fixed ONE TIER UP.
const A11Y = ['a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];

const { loadTheme, loadThemeChain, contrast, oklabDist, resolve } = require('../../helpers/chart-color');

// Hard floors the three curated exemplars all meet on both canvases — a
// regression guard, not the aspirational bar. style.md's ≥0.15 OKLab adjacent
// target is the AUTHORING goal (assessed during curation via
// tools/theme-scorecard.js); the exemplars themselves sit ~0.07–0.15 (the
// achromatic onyx ramp separates by value, tight brand triads by a small hue
// step), so gating at 0.15 would fail the gold standard. These floors catch the
// real regressions: a label that fails AA on its fill, a mark invisible on the
// canvas, or two slots collapsing to the same color.
const TEXT_ON_FILL   = 4.5;   // AA — the --text-heading label on a chart fill
const MARK_VS_CANVAS = 3.0;   // WCAG 1.4.11 — a saturated mark must clear the canvas
const MARK_MUTE_MIN  = 2.0;   // --mute is the deliberately-quiet "deferred" role
const SLOT_DISTINCT  = 0.06;  // adjacent slots must not collapse to the same color

describe('chart palette — curated theme assessment', () => {
  for (const theme of CURATED) {
    const vars = loadTheme(theme);
    for (const mode of ['light', 'dark']) {
      const bg = resolve(vars.bg, vars, mode);
      const textHeading = resolve(vars['text-heading'], vars, mode);
      assert.ok(bg, `${theme}/${mode}: --bg must resolve`);
      assert.ok(textHeading, `${theme}/${mode}: --text-heading must resolve`);

      const cats = [];
      for (let i = 1; i <= 8; i++) {
        const rgb = resolve(vars[`chart-cat${i}`], vars, mode);
        if (rgb) cats.push({ i, rgb, fill: resolve(vars[`chart-cat-${i}-fill`], vars, mode) });
      }
      const states = ['pass', 'warn', 'fail', 'info', 'mute']
        .map(k => ({ k, rgb: resolve(vars[k], vars, mode), fill: resolve(vars[`state-${k}-fill`], vars, mode) }))
        .filter(s => s.rgb);

      test(`${theme}/${mode}: every chart hue + fill resolves`, () => {
        assert.equal(cats.length, 8, `${theme}/${mode}: expected 8 --chart-cat*, got ${cats.length}`);
        assert.equal(states.length, 5, `${theme}/${mode}: expected the 5 status solids, got ${states.length}`);
        for (const c of cats) assert.ok(c.fill, `${theme}/${mode}: --chart-cat-${c.i}-fill must resolve`);
        for (const s of states) assert.ok(s.fill, `${theme}/${mode}: --state-${s.k}-fill must resolve`);
      });

      test(`${theme}/${mode}: heading label clears every fill (AA, ≥${TEXT_ON_FILL}:1)`, () => {
        for (const { i, fill } of cats) {
          const r = contrast(textHeading, fill);
          assert.ok(r >= TEXT_ON_FILL, `${theme}/${mode}: --text-heading on --chart-cat-${i}-fill = ${r.toFixed(2)}:1 (< ${TEXT_ON_FILL})`);
        }
        for (const { k, fill } of states) {
          const r = contrast(textHeading, fill);
          assert.ok(r >= TEXT_ON_FILL, `${theme}/${mode}: --text-heading on --state-${k}-fill = ${r.toFixed(2)}:1 (< ${TEXT_ON_FILL})`);
        }
      });

      test(`${theme}/${mode}: marks clear the canvas (≥${MARK_VS_CANVAS}:1; mute ≥${MARK_MUTE_MIN}:1)`, () => {
        for (const { i, rgb } of cats) {
          const r = contrast(rgb, bg);
          assert.ok(r >= MARK_VS_CANVAS, `${theme}/${mode}: --chart-cat${i} vs --bg = ${r.toFixed(2)}:1 (< ${MARK_VS_CANVAS})`);
        }
        for (const { k, rgb } of states) {
          const floor = k === 'mute' ? MARK_MUTE_MIN : MARK_VS_CANVAS;
          const r = contrast(rgb, bg);
          assert.ok(r >= floor, `${theme}/${mode}: --${k} vs --bg = ${r.toFixed(2)}:1 (< ${floor})`);
        }
      });

      test(`${theme}/${mode}: the working categories stay distinct (≥${SLOT_DISTINCT} OKLab)`, () => {
        // Only the first 6 slots: the spec caps perceptual distinctness at ~6
        // (Wong 2011) and slots 7–8 are allowed to converge — charts past six
        // categories should consolidate, not cycle on.
        const working = cats.filter(c => c.i <= 6);
        for (let j = 0; j < working.length - 1; j++) {
          const d = oklabDist(working[j].rgb, working[j + 1].rgb);
          assert.ok(d >= SLOT_DISTINCT, `${theme}/${mode}: --chart-cat${working[j].i}↔${working[j + 1].i} OKLab = ${d.toFixed(3)} (< ${SLOT_DISTINCT})`);
        }
        for (let a = 0; a < states.length; a++) {
          for (let b = a + 1; b < states.length; b++) {
            const d = oklabDist(states[a].rgb, states[b].rgb);
            assert.ok(d >= SLOT_DISTINCT, `${theme}/${mode}: --${states[a].k}↔${states[b].k} OKLab = ${d.toFixed(3)} (< ${SLOT_DISTINCT})`);
          }
        }
      });
    }
  }

  // Sanity: the resolver itself must handle the chart token grammar. A broken
  // resolver would make every assertion vacuously pass, so pin known values.
  test('resolver: hex, light-dark, color-mix(in oklab) all resolve', () => {
    const v = { bg: 'light-dark(#ffffff, #0a1628)', hue: 'light-dark(#006398, color-mix(in oklab, #006398, white 30%))' };
    assert.deepEqual(resolve(v.bg, v, 'light'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(resolve(v.bg, v, 'dark'), { r: 10, g: 22, b: 40 });
    const lightHue = resolve(v.hue, v, 'light');
    assert.deepEqual(lightHue, { r: 0, g: 99, b: 152 });
    const darkHue = resolve(v.hue, v, 'dark');
    // 70% #006398 + 30% white, mixed in OKLab → a lighter blue (all channels up).
    assert.ok(darkHue.r > 0 && darkHue.g > 99 && darkHue.b > 152, `dark hue should lighten: ${JSON.stringify(darkHue)}`);
  });
});

// ── The accessibility palettes — rule 1 only ────────────────────────────────
//
// A `_class: dark` slide is the seam these have to survive: a11y-base pins
// `color-scheme: light` at `:root` and `:root:root`, and that pin cannot reach a
// section, so one darkened slide in an a11y deck flips the canvas to the palette's
// dark arm while the ramp stays put. The status trio is PAIRED for exactly this
// reason and says so; the categorical ramp has to hold the same seam.
describe('chart palette — accessibility palettes clear their canvas', () => {
  for (const theme of A11Y) {
    const vars = loadThemeChain(theme);
    for (const mode of ['light', 'dark']) {
      const bg = resolve(vars.bg, vars, mode);
      test(`${theme}/${mode}: marks clear the canvas (≥${MARK_VS_CANVAS}:1)`, () => {
        assert.ok(bg, `${theme}/${mode}: --bg must resolve`);
        for (let i = 1; i <= 8; i++) {
          const rgb = resolve(vars[`chart-cat${i}`], vars, mode);
          assert.ok(rgb, `${theme}/${mode}: --chart-cat${i} must resolve`);
          const r = contrast(rgb, bg);
          assert.ok(r >= MARK_VS_CANVAS, `${theme}/${mode}: --chart-cat${i} vs --bg = ${r.toFixed(2)}:1 (< ${MARK_VS_CANVAS})`);
        }
      });

      // The tier a11y-base already fixed for this seam, pinned so it stays fixed.
      // `--cat-on-mark` is ink for `--cat-N-mark` — `base.tokens.css` says so in
      // as many words ("text on a --cat-N-mark (the saturated STROKE tier)") —
      // and NOT for `--chart-catN`, which is a separate, wider ramp. A first
      // draft of this arm paired it with `--chart-catN` and "found" a 3.79:1
      // failure that is not a pairing anything paints.
      test(`${theme}/${mode}: --cat-on-mark clears every chip (AA, ≥${TEXT_ON_FILL}:1)`, () => {
        const onMark = resolve(vars['cat-on-mark'], vars, mode);
        assert.ok(onMark, `${theme}/${mode}: --cat-on-mark must resolve`);
        for (let i = 1; i <= 12; i++) {
          const rgb = resolve(vars[`cat-${i}-mark`], vars, mode);
          if (!rgb) continue;
          const r = contrast(onMark, rgb);
          assert.ok(r >= TEXT_ON_FILL, `${theme}/${mode}: --cat-on-mark on --cat-${i}-mark = ${r.toFixed(2)}:1 (< ${TEXT_ON_FILL})`);
        }
      });
    }
  }
});
