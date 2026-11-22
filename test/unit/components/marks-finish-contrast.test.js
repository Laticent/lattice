/**
 * Unit: the `marks:` finishes' marks clear the slide, measured from the GENERATED rules
 * (lib/plugins/chart-family/chart-family.styles.generated.css), on every built-in palette.
 *
 * Two contracts, both WCAG 1.4.11 (a graphical mark against what it sits on, 3:1):
 *
 *   1. ETCH ON A DARK SLIDE. Etch's dark body was the category hue at 40% toward the canvas, and it measured
 *      1.14 to 1.57:1 at its worst slot on every built-in dark face: the outline carried the bar and the fill vanished. The generator
 *      now mixes the category INK at 78% (tools/build-marks-css.js `ETCH_BODY_INK_D`). This holds every slot of every
 *      palette in dark at 3:1 or better, and the bullet measure with it.
 *   2. TONE'S SOURCE (`marks: tone ink`, `marks: tone accent`). The source is tone's one hue AND its ink: names and
 *      edges are drawn in it, and the ladder's steps are mixes of it. So the source must read as text on the slide
 *      (4.5:1), and the ladder's strongest step must clear 3:1, in both modes.
 *
 * The levels are read out of the generated CSS, not imported from the generator, so a hand edit to the output, a
 * changed level and a changed token all fail here. Colors resolve through test/helpers/chart-color.js, the resolver
 * chart-contrast.test.js uses (light-dark(), var() with fallback, color-mix in oklab).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast, rgbToOklab, oklabToRgb } = require('../../helpers/chart-color');

const CSS = fs.readFileSync(path.join(__dirname, '../../../lib/plugins/chart-family/chart-family.styles.generated.css'), 'utf8');
const PALETTES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const MARK = 3;
const TEXT = 4.5;

/** The declarations of the first block whose selector list starts with `head`. */
function block(head) {
  const at = CSS.indexOf(`\n${head}`);
  assert.ok(at >= 0, `the generated CSS has a block headed ${head}`);
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
}

/** color-mix(in oklab, a p%, b), opaque colors. */
function mix(a, p, b) {
  const A = rgbToOklab(a);
  const B = rgbToOklab(b);
  const k = p / 100;
  return oklabToRgb({ L: A.L * k + B.L * (1 - k), a: A.a * k + B.a * (1 - k), b: A.b * k + B.b * (1 - k) });
}
const pct = (v) => Number(String(v).replace('%', ''));

describe('etch on a dark slide: every body clears 3:1 against the slide', () => {
  const etch = block('section.marks-etch');
  test('the dark body mixes toward the canvas, so its contrast is against the slide itself', () => {
    assert.equal(etch['--finish-base-d'], 'var(--bg)');
  });
  for (const name of PALETTES) {
    test(`${name}/dark: every slot's body, and the bullet measure`, () => {
      const vars = loadThemeChain(name);
      const bg = resolve(vars.bg, vars, 'dark');
      assert.ok(bg, `${name}: --bg resolves`);
      for (let n = 1; n <= 8; n++) {
        const src = resolve(etch[`--finish-hue-d-${n}`], vars, 'dark');
        assert.ok(src, `${name}: slot ${n}'s dark body source resolves`);
        const body = mix(src, pct(etch[`--finish-body-d-${n}`]), bg);
        const r = contrast(body, bg);
        assert.ok(r >= MARK, `${name}/dark: etch slot ${n} body ${r.toFixed(2)}:1 against the slide (< ${MARK})`);
      }
      // The bullet's measure is a bar drawn in the category ink (`--finish-mark-edge`) at its own dark level.
      // The dark arm is light-dark()'s second color: the last color-mix before the closing parenthesis.
      const rule = CSS.match(/marks-etch :where\(\.bullet-measure\[data-hue\]\) \{\n\s*fill: light-dark\(.*, color-mix\(in oklab, var\(--finish-mark-edge\) (\d+)%, var\(--bg\)\)\) !important;/);
      assert.ok(rule, 'the etch bullet measure rule is generated');
      for (let n = 1; n <= 8; n++) {
        const ink = resolve(`var(--chart-cat-${n}-ink)`, vars, 'dark');
        const r = contrast(mix(ink, Number(rule[1]), bg), bg);
        assert.ok(r >= MARK, `${name}/dark: etch bullet measure, slot ${n}, ${r.toFixed(2)}:1 (< ${MARK})`);
      }
    });
  }
});

describe('tone\'s source: the one hue reads as text, and its strongest step clears 3:1, in both modes', () => {
  const tone = block('section.marks-tone');
  const steps = { light: pct(tone['--finish-body-1']), dark: pct(tone['--finish-body-d-1']) };
  for (const word of ['ink', 'accent']) {
    const src = block(`section.marks-tone.marks-${word}`);
    test(`marks: tone ${word} re-points tone's one hue, its ink and its ramp to one color`, () => {
      assert.ok(src['--finish-one'], 'sets the hue');
      assert.equal(src['--finish-one-ink'], src['--finish-one'], 'the ink is the hue: one color');
      // A ramp (heatmap, map) reads the palette's --ramp-hue / --ramp-ink hook, so the source sets the hook too.
      assert.equal(src['--ramp-hue'], `${src['--finish-one']} !important`, 'a ramp follows the source');
      assert.equal(src['--ramp-ink'], `${src['--finish-one']} !important`, 'and so does its ink');
      assert.equal(tone['--finish-one'], 'var(--chart-cat-1-hue)', 'with no source, tone draws in chart color one');
    });
    for (const name of PALETTES) {
      for (const mode of ['light', 'dark']) {
        test(`${name}/${mode}: tone ${word}`, () => {
          const vars = loadThemeChain(name);
          const bg = resolve(vars.bg, vars, mode);
          const hue = resolve(src['--finish-one'], vars, mode);
          assert.ok(bg && hue, `${name}/${mode}: the slide and the source resolve`);
          const ink = contrast(hue, bg);
          assert.ok(ink >= TEXT, `${name}/${mode}: tone ${word} ink ${ink.toFixed(2)}:1 against the slide (< ${TEXT}); a name is drawn in it`);
          // The light ladder mixes toward a base lifted from the hue (TONE_BASE_REL, L 0.97 at 30% of its chroma), or the
          // slide where the engine lacks relative color; the dark ladder toward the slide. Hold the worse of the two.
          const o = rgbToOklab(hue);
          const bases = mode === 'light' ? [bg, oklabToRgb({ L: 0.97, a: o.a * 0.3, b: o.b * 0.3 })] : [bg];
          for (const base of bases) {
            const r = contrast(mix(hue, steps[mode], base), bg);
            assert.ok(r >= MARK, `${name}/${mode}: tone ${word} strongest step ${r.toFixed(2)}:1 (< ${MARK})`);
          }
        });
      }
    }
  }
});
