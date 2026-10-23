/**
 * Unit: the chart SOLIDS — one flat color per chart concept, and one ink for text on all of them.
 *
 * Every chart mark is painted with its concept's solid: `--chart-cat-N-hue` for a category, `--state-X-hue` for a
 * status (the base's `--X-solid`), `--chart-neutral-hue` for a mark with neither. Text on a solid is
 * `--chart-solid-ink`, except on a status fill, where it is that status's `--state-X-on` (amber carries `--on-warn`).
 * Each theme curates the seeds (tools/curate-chart-solids.js seeded them; a theme may hand-tune any of them), and this
 * holds every palette, in both modes, to the bar:
 *
 *   1. text on a solid      >= 7:1 (WCAG AAA). The one exception the owner set: on the DARK face a pass/warn/fail
 *                           fill is the theme's own status ink, and text on it clears 4.5:1 (AA), because a fill
 *                           there cannot clear 7:1, the colorblind floor and its hue at once (base.tokens.css).
 *   2. a solid on the slide every solid against `--bg` >= 3:1 (WCAG 1.4.11, a graphical object), or, for a status
 *                           fill, its ink edge (`--state-X-ink`) does: a light-face amber under dark text is too
 *                           light to clear 3:1 itself, and its edge is the boundary.
 *
 * If a test fails, a theme's seed fell short: move the seed's lightness away from the ink (keep its hue), or re-run
 * `node tools/curate-chart-solids.js`. Do not lower the bar. engineering/chart-styling.md §3.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast } = require('../../helpers/chart-color');

const THEMES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const TEXT = 7;
const MARK = 3;
const TEXT_DARK_TRIO = 4.5;
const TRIO = ['pass', 'warn', 'fail'];
/**
 * Each INTENSITY of `chart-finish:` names its own fills and inks (base.tokens.css § STATUS, IN TWO JOBS), so the
 * status rows read the base tokens directly rather than the chart family's `--state-*` (which the `vivid` rule
 * remaps on a slide, and which a flat parse of the stylesheet would see as already remapped). A status fill's EDGE is
 * the fill itself, except vivid amber's light face, which takes the theme's status ink `--warn`.
 */
const STATUS = ['pass', 'warn', 'fail', 'info', 'mute'];
const INTENSITIES = {
  muted: (s) => ({ t: `${s}-solid`, ink: s === 'warn' ? 'on-warn' : 'on-solid', edge: s === 'warn' ? 'warn-solid-edge' : null, s }),
  vivid: (s) => (TRIO.includes(s)
    ? { t: `${s}-solid-vivid`, ink: s === 'warn' ? 'on-warn-vivid' : 'on-solid', edge: s === 'warn' ? 'warn' : null, s }
    : { t: `${s}-solid`, ink: 'on-solid', s }),
};
const SOLIDS = (intensity) => [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ t: `chart-cat-${n}-hue`, ink: 'chart-solid-ink' })),
  ...STATUS.map(INTENSITIES[intensity]),
  { t: 'chart-neutral-hue', ink: 'chart-solid-ink' },
];

describe('chart solids: text on every solid clears its bar, and every solid has a 3:1 boundary on the slide', () => {
  for (const theme of THEMES) {
    for (const [mode, intensity] of ['light', 'dark'].flatMap((m) => Object.keys(INTENSITIES).map((i) => [m, i]))) {
      test(`${theme} ${mode} ${intensity}`, () => {
        const vars = loadThemeChain(theme);
        const bg = resolve('var(--bg)', vars, mode);
        assert.ok(bg, 'the canvas resolves');
        const bad = [];
        for (const { t, ink: inkTok, edge, s } of SOLIDS(intensity)) {
          const c = resolve(`var(--${t})`, vars, mode);
          const ink = resolve(`var(--${inkTok})`, vars, mode);
          if (!c || !ink) { bad.push(`--${t} or its ink --${inkTok} did not resolve`); continue; }
          const text = contrast(c, ink);
          const bar = mode === 'dark' && TRIO.includes(s) ? TEXT_DARK_TRIO : TEXT;
          if (text < bar) bad.push(`--${t}: text ${text.toFixed(2)}:1 (bar ${bar})`);
          const mark = Math.max(contrast(c, bg), edge && mode === 'light' ? contrast(resolve(`var(--${edge})`, vars, mode), bg) : 0);
          if (mark < MARK) bad.push(`--${t}: against the slide ${mark.toFixed(2)}:1`);
        }
        assert.deepEqual(bad, []);
      });
    }
  }
});
