/**
 * Unit: TEXT COLOR CARRIES THE KIND — a category and a status may share a hue, and the text on the fill tells them
 * apart (engineering/chart-styling.md §3, "Polarity").
 *
 * Apple's HIG asks a chart not to use the same color to mean different things. Holding categories off every status
 * hue was tried first (a gate that banned green, amber and red categories outright); it cost every palette its brand
 * hues and the owner rejected the result on sight. The rule that replaced it keeps the brand categories and separates
 * the two kinds by POLARITY instead:
 *
 *   - a category or the neutral is a DEEP fill under white text (`--on-solid`);
 *   - a status is a BRIGHT fill under near-black text (`--on-status`).
 *
 * So, for every palette, in both modes and both `chart-finish:` intensities:
 *
 *   1. the inks point the right way: white is lighter than every category and the neutral, near-black is darker
 *      than every status fill, and the chart family hands each kind its own ink;
 *   2. the two kinds stay apart in LIGHTNESS: every status fill is at least POLARITY_GAP brighter (WCAG contrast
 *      ratio) than every category fill, so a reader who sees no hue at all still tells a status bar from a category
 *      bar. The bar is what the polarity buys by construction (a deep fill under white at 7:1 and a bright one under
 *      black at 7:1 sit about 2.5x apart on the light face, and the dark face's 4.6:1 / 9:1 pair keeps it).
 *
 * The contrast of each ink on its own fill is chart-solids.test.js. If this fails, a category was brightened toward
 * the status band, or a status deepened toward the category band: re-run `node tools/curate-chart-solids.js`.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast } = require('../../helpers/chart-color');
const { hexToOklch } = require('../../../lib/theme/color.js');
const fs = require('node:fs');
const path = require('node:path');
const FAMILY = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'plugins', 'chart-family', 'chart-family.styles.css'), 'utf8');

const THEMES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const POLARITY_GAP = 2;
const hex = (o) => (typeof o === 'string' ? o : `#${[o.r, o.g, o.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
const L = (c) => hexToOklch(hex(c)).L;
const CATEGORIES = [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-cat-${n}-hue`), 'chart-neutral-hue'];
const STATUS_FILLS = {
  muted: ['pass-solid', 'warn-solid', 'fail-solid', 'info-solid', 'mute-solid'],
  vivid: ['pass-solid-vivid', 'warn-solid-vivid', 'fail-solid-vivid', 'info-solid-vivid', 'mute-solid'],
};

describe('chart polarity: the chart family hands each kind its own ink', () => {
  // Read from the source, not a flat parse: the frame's `--chart-solid-ink` is overridden per status by a later rule,
  // so a flattened stylesheet sees only the last declaration.
  test('a category or the neutral reads --on-solid; a status mark re-points it at its --state-X-on', () => {
    assert.match(FAMILY, /--chart-solid-ink: var\(--on-solid\);/);
    for (const s of ['pass', 'warn', 'fail', 'info', 'mute']) {
      assert.match(FAMILY, new RegExp(`--state-${s}-on: var\\(--on-status\\);`));
      assert.match(FAMILY, new RegExp(`\\{ --chart-solid-ink: var\\(--state-${s}-on\\); \\}`));
    }
  });
});

describe('chart polarity: white on a category, near-black on a status, and the two kinds apart in lightness', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      for (const [intensity, fills] of Object.entries(STATUS_FILLS)) {
        test(`${theme} ${mode} ${intensity}`, () => {
          const vars = loadThemeChain(theme);
          const c = (t) => resolve(`var(--${t})`, vars, mode);
          const onSolid = c('on-solid');
          const onStatus = c('on-status');
          const bad = [];
          for (const cat of CATEGORIES) if (L(c(cat)) >= L(onSolid)) bad.push(`--${cat} is lighter than its white ink`);
          for (const s of fills) if (L(c(s)) <= L(onStatus)) bad.push(`--${s} is darker than its near-black ink`);
          for (const cat of CATEGORIES) {
            for (const s of fills) {
              const gap = contrast(c(s), c(cat));
              if (L(c(s)) <= L(c(cat)) || gap < POLARITY_GAP) bad.push(`--${s} vs --${cat}: ${gap.toFixed(2)}:1 (gap ${POLARITY_GAP})`);
            }
          }
          assert.deepEqual(bad, []);
        });
      }
    }
  }
});
