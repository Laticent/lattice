/**
 * Unit: a category color never doubles as a status color.
 *
 * Apple's HIG puts it plainly: "Avoid using the same color to mean different things." A chart category
 * (`--chart-cat-N-hue`) that sits on top of a status fill reads as a status: a green revenue bar reads as
 * "on track", a brick-red share reads as "blocked", and indaco's brand-blue category read as gantt's "live".
 * The measured tree before this gate had 131 category/status pairs closer than 0.06 OKLab, and some were the
 * same color.
 *
 * So, for every brand palette, in both modes and both `chart-finish:` intensities, every category solid stays at
 * least SEPARATION OKLab from every status fill (`--pass-solid` … and `--pass-solid-vivid` …), and the info
 * status (`--info`, which is also its own fill) stays that far from every category too. Where a status and a
 * category collided, the CATEGORY moved (it carries no meaning beyond its slot), except info against a brand
 * blue, where info moved, because the category carries the brand. 0.08 is a difference anyone sees side by side.
 *
 * If this fails: move the category's hue away from the status, and its lightness only as far as 7:1 text on it
 * allows (chart-solids.test.js holds that). Do not lower SEPARATION.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { oklabDistance } = require('../../../lib/theme/color.js');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve } = require('../../helpers/chart-color');

const SEPARATION = 0.08;
const { hexToOklch } = require('../../../lib/theme/color.js');
/**
 * NO STATUS HUE AT ALL. Distance alone left a category in the green, amber or red family that read as a status from
 * across the room, so the owner set the stronger rule: a category is teal, blue, indigo, violet or plum, or it is an
 * earthy neutral (OKLCH chroma at most NEUTRAL_CHROMA). The status families, in OKLCH hue degrees: red and rose
 * 340-40, orange through amber and olive 40-175 (amber shades into the yellow-greens, and both read as a status).
 */
const NEUTRAL_CHROMA = 0.05;
const statusHue = (h) => h >= 340 || h < 40 || (h >= 40 && h <= 175);
const hex = (o) => `#${[o.r, o.g, o.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const STATUS = ['pass-solid', 'warn-solid', 'fail-solid', 'pass-solid-vivid', 'warn-solid-vivid', 'fail-solid-vivid', 'info'];

describe('category colors stay apart from status colors', () => {
  for (const theme of baseThemeNames()) {
    for (const mode of ['light', 'dark']) {
      test(`${theme} ${mode}`, () => {
        const vars = loadThemeChain(theme);
        const near = [];
        for (let n = 1; n <= 8; n++) {
          const cat = hex(resolve(`var(--chart-cat-${n}-hue)`, vars, mode));
          for (const s of STATUS) {
            const d = oklabDistance(cat, hex(resolve(`var(--${s})`, vars, mode)));
            if (d < SEPARATION) near.push(`cat${n}~${s} ${d.toFixed(3)}`);
          }
        }
        assert.deepEqual(near, []);
      });
      test(`${theme} ${mode}: no category wears a status hue`, () => {
        const vars = loadThemeChain(theme);
        const off = [];
        for (let n = 1; n <= 8; n++) {
          const cat = hex(resolve(`var(--chart-cat-${n}-hue)`, vars, mode));
          const { h, C } = hexToOklch(cat);
          if (C > NEUTRAL_CHROMA && statusHue(h)) off.push(`cat${n} ${cat} hue ${h.toFixed(0)} chroma ${C.toFixed(3)}`);
        }
        assert.deepEqual(off, []);
      });
    }
  }
});
