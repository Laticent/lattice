/**
 * Unit: the chart SOLIDS — one flat color per chart concept, and the ink that reads on it.
 *
 * ONE INK (engineering/chart-styling.md §3). Every solid, a category (`--chart-cat-N-hue`), the neutral
 * (`--chart-neutral-hue`) or a status (the base's `--X-solid`, `--X-solid-vivid`), is a DEEP fill under white (`--on-solid`,
 * the one ink). Each theme curates the seeds (tools/curate-chart-solids.js seeded them; a theme may
 * hand-tune any of them), and this holds every palette, in both modes and both intensities, to the bar:
 *
 *   1. text on a solid      >= 7:1 on the light face; >= 4.5:1 on the dark face, where a solid is a mid-tone white
 *                           still clears, so it can stand off the dark slide (an `a11y-*` palette's dark face is
 *                           bright under a near-black ink, at 7:1, chart-one-ink.test.js).
 *   2. a solid on the slide >= 3:1 against `--bg` (WCAG 1.4.11, a graphical object), by itself: no rim rescues it.
 *   3. a status as ink      a status LINE or TEXT paints the slide ink `--pass` … `--mute`, so it clears 4.5:1 off the
 *                           slide on both faces (cvd-trio-floor.test.js holds the trio apart for the colorblind floors).
 *
 * That the two inks are one, that the chart family wires each kind to it, and the signal rings, are
 * chart-one-ink.test.js (a flat parse of the stylesheet sees only the last `--chart-solid-ink`, so the inks are read as
 * the base tokens here). If a test fails, a theme's seed fell short: re-run `node tools/curate-chart-solids.js`, or
 * move the seed's lightness away from its ink (keep its hue).
 * Do not lower the bar.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast } = require('../../helpers/chart-color');

const THEMES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const TEXT = 7;
const MARK = 3;
const DARK = 4.5;
const INK_TEXT = 4.5;
/**
 * Each INTENSITY of `chart-finish:` names its own fills (base.tokens.css § STATUS, IN TWO JOBS), so the status rows
 * read the base tokens directly rather than the chart family's `--state-*` (which the `vivid` rule remaps on a slide,
 * and which a flat parse of the stylesheet would see as already remapped). `--mute-solid` has no vivid.
 */
const STATUS = ['pass', 'warn', 'fail', 'info', 'mute'];
const INTENSITIES = {
  muted: (s) => ({ t: `${s}-solid`, ink: 'on-solid' }),
  vivid: (s) => ({ t: s === 'mute' ? 'mute-solid' : `${s}-solid-vivid`, ink: 'on-solid' }),
};
const SOLIDS = (intensity) => [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ t: `chart-cat-${n}-hue`, ink: 'on-solid' })),
  ...STATUS.map(INTENSITIES[intensity]),
  { t: 'chart-neutral-hue', ink: 'on-solid' },
];

describe('chart solids: text on every solid clears its bar, and every solid has a 3:1 boundary on the slide', () => {
  for (const theme of THEMES) {
    for (const [mode, intensity] of ['light', 'dark'].flatMap((m) => Object.keys(INTENSITIES).map((i) => [m, i]))) {
      test(`${theme} ${mode} ${intensity}`, () => {
        const vars = loadThemeChain(theme);
        const bg = resolve('var(--bg)', vars, mode);
        assert.ok(bg, 'the canvas resolves');
        const bad = [];
        for (const { t, ink: inkTok } of SOLIDS(intensity)) {
          const c = resolve(`var(--${t})`, vars, mode);
          const ink = resolve(`var(--${inkTok})`, vars, mode);
          if (!c || !ink) { bad.push(`--${t} or its ink --${inkTok} did not resolve`); continue; }
          const text = contrast(c, ink);
          const bar = mode === 'dark' ? DARK : TEXT;
          if (text < bar) bad.push(`--${t}: text ${text.toFixed(2)}:1 (bar ${bar})`);
          const mark = contrast(c, bg);
          if (mark < MARK) bad.push(`--${t}: against the slide ${mark.toFixed(2)}:1`);
        }
        for (const s of STATUS) {
          const ink = resolve(`var(--${s})`, vars, mode);
          if (!ink) bad.push(`--${s} did not resolve`);
          else if (contrast(ink, bg) < INK_TEXT) bad.push(`--${s}: as text ${contrast(ink, bg).toFixed(2)}:1 (bar ${INK_TEXT})`);
        }
        assert.deepEqual(bad, []);
      });
    }
  }
});
