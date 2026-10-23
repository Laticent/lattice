/**
 * Unit: the chart SOLIDS — one flat color per chart concept, and one ink for text on all of them.
 *
 * Every chart mark is painted with its concept's solid: `--chart-cat-N-hue` for a category, `--state-X-hue` for a
 * status, `--chart-neutral-hue` for a mark with neither. Text on any of them is `--chart-solid-ink`. Each theme
 * curates the seeds (tools/curate-chart-solids.js seeded them; a theme may hand-tune any of them), and this holds
 * every palette, in both modes, to the bar:
 *
 *   1. text on a solid      `--chart-solid-ink` on every solid >= 7:1 (WCAG AAA)
 *   2. a solid on the slide every solid against `--bg` >= 3:1 (WCAG 1.4.11, a graphical object)
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
const SOLIDS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-cat-${n}-hue`),
  ...['pass', 'warn', 'fail', 'info', 'mute'].map((s) => `state-${s}-hue`),
  'chart-neutral-hue',
];

describe('chart solids: text on every solid clears 7:1, and every solid clears 3:1 off the slide', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      test(`${theme} ${mode}`, () => {
        const vars = loadThemeChain(theme);
        const ink = resolve('var(--chart-solid-ink)', vars, mode);
        const bg = resolve('var(--bg)', vars, mode);
        assert.ok(ink && bg, 'the ink and the canvas resolve');
        const bad = [];
        for (const t of SOLIDS) {
          const c = resolve(`var(--${t})`, vars, mode);
          if (!c) { bad.push(`--${t} did not resolve`); continue; }
          const text = contrast(c, ink);
          const mark = contrast(c, bg);
          if (text < TEXT) bad.push(`--${t}: text ${text.toFixed(2)}:1`);
          if (mark < MARK) bad.push(`--${t}: against the slide ${mark.toFixed(2)}:1`);
        }
        assert.deepEqual(bad, []);
      });
    }
  }
});
