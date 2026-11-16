/**
 * Unit: the chart SOLIDS — one flat color per chart concept, and the ink that reads on it.
 *
 * ONE INK (engineering/chart-styling.md §3). Every solid, a category (`--chart-cat-N-hue`), the neutral
 * (`--chart-neutral-hue`) or a status (the base's `--X-mark`, `--X-vivid-mark`), is a DEEP fill under white (`--on-mark`,
 * the one ink). Each theme curates the seeds (tools/curate-chart-solids.js seeded them; a theme may
 * hand-tune any of them), and this holds every palette, in both modes and both intensities, to the bar:
 *
 *   1. text on a solid      >= 7:1 on the light face; >= 4.5:1 on the dark face, where a solid is a mid-tone white
 *                           still clears, so it can stand off the dark slide (an `a11y-*` palette's dark face is
 *                           bright under a near-black ink, at 7:1, chart-one-ink.test.js).
 *   2. a solid on the slide >= 3:1 against `--bg` (WCAG 1.4.11, a graphical object), by itself: no rim rescues it.
 *
 * THE STATUS TRIPLET (engineering/decisions/2026-11-16-status-triplets.md) changes the STATUS rows on a brand palette:
 * its text is that status's own ink (`--X-on-mark`, the slide's paper on the light face and its night on the dark
 * one), held to AA 4.5:1 on both faces, and the solid itself clears 4.5:1 against the slide (the DISTANCE floor), not
 * 3:1, so it still reads from the back of a lit hall (`npm run check:glance`). An `a11y-*` palette curates no triplet,
 * so its status rows keep the one ink and the bars above, exactly as before.
 *   3. a status as ink      a status LINE or TEXT paints the slide ink `--pass` … `--mute`, so it clears 4.5:1 off the
 *                           slide on both faces (cvd-trio-floor.test.js holds the trio apart for the colorblind floors).
 *
 * That the two inks are one, that the chart family wires each kind to it, and the signal rings, are
 * chart-one-ink.test.js (a flat parse of the stylesheet sees only the last `--chart-on-mark`, so the inks are read as
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
const TRIPLET_TEXT = 4.5;
const DISTANCE = 4.5;
/** A theme curates the triplet when its status EDGE is its fill (the option-A design), read from its own tokens, not
 * its name: a brand theme that curated none would keep the slide-ink border and so the one-ink bars above. */
const curatesTriplet = (theme) => {
  const vars = loadThemeChain(theme);
  return ['light', 'dark'].every((m) => {
    const fill = resolve('var(--pass-mark)', vars, m), edge = resolve('var(--pass-edge-mark, var(--pass))', vars, m);
    return fill && edge && JSON.stringify(fill) === JSON.stringify(edge);
  });
};
/**
 * Each INTENSITY of `marks:` names its own fills (base.tokens.css § STATUS, IN TWO JOBS), so the status rows
 * read the base tokens directly rather than the chart family's `--state-*` (which the `vivid` rule remaps on a slide,
 * and which a flat parse of the stylesheet would see as already remapped). `--mute-mark` has no vivid.
 */
const STATUS = ['pass', 'warn', 'fail', 'info', 'mute'];
const INTENSITIES = {
  muted: (s) => ({ t: `${s}-mark`, ink: `${s}-on-mark`, status: true }),
  vivid: (s) => ({ t: s === 'mute' ? 'mute-mark' : `${s}-vivid-mark`, ink: `${s}-on-mark`, status: true }),
};
const SOLIDS = (intensity) => [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ t: `chart-cat-${n}-hue`, ink: 'on-mark' })),
  ...STATUS.map(INTENSITIES[intensity]),
  { t: 'chart-neutral-hue', ink: 'on-mark' },
];

describe('chart solids: text on every solid clears its bar, and every solid has a 3:1 boundary on the slide', () => {
  for (const theme of THEMES) {
    for (const [mode, intensity] of ['light', 'dark'].flatMap((m) => Object.keys(INTENSITIES).map((i) => [m, i]))) {
      test(`${theme} ${mode} ${intensity}`, () => {
        const vars = loadThemeChain(theme);
        const bg = resolve('var(--bg)', vars, mode);
        assert.ok(bg, 'the canvas resolves');
        const bad = [];
        const triplet = curatesTriplet(theme);
        for (const { t, ink: inkTok, status } of SOLIDS(intensity)) {
          const c = resolve(`var(--${t})`, vars, mode);
          const ink = resolve(`var(--${inkTok}, var(--on-mark))`, vars, mode);
          if (!c || !ink) { bad.push(`--${t} or its ink --${inkTok} did not resolve`); continue; }
          const text = contrast(c, ink);
          const bar = status && triplet ? TRIPLET_TEXT : mode === 'dark' ? DARK : TEXT;
          if (text < bar) bad.push(`--${t}: text ${text.toFixed(2)}:1 on --${inkTok} (bar ${bar})`);
          const mark = contrast(c, bg);
          const floor = status && triplet ? DISTANCE : MARK;
          if (mark < floor) bad.push(`--${t}: against the slide ${mark.toFixed(2)}:1 (floor ${floor})`);
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
