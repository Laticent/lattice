/**
 * Unit: the chart SOLIDS — one flat color per chart concept, and the ink that reads on it.
 *
 * TEXT COLOR CARRIES THE KIND (engineering/chart-styling.md §3). A category (`--chart-cat-N-hue`) or the neutral
 * (`--chart-neutral-hue`) is a DEEP fill under white `--on-solid`; a status (the base's `--X-solid`, `--X-solid-vivid`)
 * is a BRIGHT fill under near-black `--on-status`. Each theme curates the seeds (tools/curate-chart-solids.js seeded
 * them; a theme may hand-tune any of them), and this holds every palette, in both modes and both intensities, to the
 * bar:
 *
 *   1. text on a solid      a status: >= 7:1 on both faces (the curation aims 9:1 on the dark face).
 *                           a category or the neutral: >= 7:1 on the light face, >= 4.5:1 on the dark face, where it
 *                           is the lightest mid-tone white still clears so it can stand off the dark slide.
 *   2. a solid on the slide >= 3:1 against `--bg` (WCAG 1.4.11, a graphical object), or, for a status fill on the
 *                           light face, its EDGE (`--X-solid-edge`) does: a bright fill sits under 3:1 there, and the
 *                           chart family rims it with the edge.
 *   3. the edge as ink      a status edge is also the status's LINE and TEXT, so on the light face it clears 4.5:1.
 *
 * Which ink is which, and that the chart family wires each kind to its own, is chart-polarity.test.js (a flat parse
 * of the stylesheet sees only the last `--chart-solid-ink`, so the inks are read as the base tokens here). If a test fails, a theme's seed fell
 * short: re-run `node tools/curate-chart-solids.js`, or move the seed's lightness away from its ink (keep its hue).
 * Do not lower the bar.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast } = require('../../helpers/chart-color');

const THEMES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const TEXT = 7;
const MARK = 3;
const CAT_DARK = 4.5;
const EDGE_TEXT = 4.5;
/**
 * Each INTENSITY of `chart-finish:` names its own fills (base.tokens.css § STATUS, IN TWO JOBS), so the status rows
 * read the base tokens directly rather than the chart family's `--state-*` (which the `vivid` rule remaps on a slide,
 * and which a flat parse of the stylesheet would see as already remapped). `--mute-solid` has no vivid.
 */
const STATUS = ['pass', 'warn', 'fail', 'info', 'mute'];
const INTENSITIES = {
  muted: (s) => ({ t: `${s}-solid`, ink: 'on-status', edge: `${s}-solid-edge`, status: true }),
  vivid: (s) => ({ t: s === 'mute' ? 'mute-solid' : `${s}-solid-vivid`, ink: 'on-status', edge: `${s}-solid-edge`, status: true }),
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
        for (const { t, ink: inkTok, edge, status } of SOLIDS(intensity)) {
          const c = resolve(`var(--${t})`, vars, mode);
          const ink = resolve(`var(--${inkTok})`, vars, mode);
          if (!c || !ink) { bad.push(`--${t} or its ink --${inkTok} did not resolve`); continue; }
          const text = contrast(c, ink);
          const bar = !status && mode === 'dark' ? CAT_DARK : TEXT;
          if (text < bar) bad.push(`--${t}: text ${text.toFixed(2)}:1 (bar ${bar})`);
          const e = edge && resolve(`var(--${edge})`, vars, mode);
          if (edge && !e) { bad.push(`--${edge} did not resolve`); continue; }
          const mark = Math.max(contrast(c, bg), status && mode === 'light' ? contrast(e, bg) : 0);
          if (mark < MARK) bad.push(`--${t}: against the slide ${mark.toFixed(2)}:1`);
          if (status && mode === 'light' && contrast(e, bg) < EDGE_TEXT) bad.push(`--${edge}: as ink ${contrast(e, bg).toFixed(2)}:1 (bar ${EDGE_TEXT})`);
        }
        assert.deepEqual(bad, []);
      });
    }
  }
});
