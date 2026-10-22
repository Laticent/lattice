/**
 * Unit: the SOLID tier's curated ink — every `--state-X-on`, `--chart-cat-N-on` and `--muted-mark-on` clears
 * 4.5:1 on its own body (`--state-X-body`, `--chart-cat-N-body`, the 82% neutral), on every palette, in both modes.
 *
 * The pale tier has `--text-heading` curated for it (chart-contrast.test.js). A solid body under the `pigment`
 * finish has no pale fill under its text, and `--text-heading` fails there (it fell under 4.5:1 on 104 of the
 * 320 gantt bars across the 32 palettes; worst 1.37:1 on concrete). So the family curates a second ink, in
 * lib/plugins/chart-family/chart-family.styles.css. Its default is black or white by the body's relative
 * luminance (Y 0.1791 is where the two tie, at 4.58:1); a palette may set `--chart-state-X-on` /
 * `--chart-catN-on` / `--chart-muted-on` to curate it, and that override is held to the same bar.
 *
 * The resolver cannot evaluate relative color, so the default is checked in two parts: the stylesheet's expression
 * must be exactly the luminance switch over the right body, and that switch is then applied here to the resolved body.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast, relLum } = require('../../helpers/chart-color');

const THEMES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const FLOOR = 4.5;
const CSS = fs.readFileSync(path.join(__dirname, '../../../lib/plugins/chart-family/chart-family.styles.css'), 'utf8');

const K = 'clamp(0, (0.1791 - y) * 1000000, 1)';
const flip = (body) => `color(from ${body} xyz-d65 calc(0.95047 * ${K}) ${K} calc(1.08883 * ${K}))`;
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const luminanceSwitch = (body) => (relLum(body) > 0.1791 ? BLACK : WHITE);

const STATES = ['pass', 'warn', 'fail', 'info', 'mute'];
const CATS = [1, 2, 3, 4, 5, 6, 7, 8];
// [on token, body token, the palette's own override name]
const PAIRS = [
  ...STATES.map((s) => [`state-${s}-on`, `state-${s}-body`, `chart-state-${s}-on`]),
  ...CATS.map((n) => [`chart-cat-${n}-on`, `chart-cat-${n}-body`, `chart-cat${n}-on`]),
  ['muted-mark-on', null, 'chart-muted-on'],
];

describe('solid-tier on-ink: the stylesheet', () => {
  test('every default is the luminance switch over its own body, behind a palette override', () => {
    for (const [on, body, override] of PAIRS) {
      const want = flip(body ? `var(--${body})` : 'color-mix(in oklab, var(--muted-mark) 82%, var(--chart-cat-base))');
      const re = new RegExp(`--${on}:\\s*var\\(--${override},\\s*${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\);`);
      assert.match(CSS, re, `--${on}`);
    }
  });

  test('a status body is the hue at 82% over the family base, like a category body', () => {
    for (const s of STATES) {
      assert.match(CSS, new RegExp(`--state-${s}-body:\\s*color-mix\\(in oklab, var\\(--state-${s}-hue\\) 82%, var\\(--chart-cat-base\\)\\);`), s);
    }
  });
});

describe('solid-tier on-ink: every palette, both modes', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      test(`${theme} ${mode}`, () => {
        const vars = loadThemeChain(theme);
        const failures = [];
        for (const [on, body, override] of PAIRS) {
          const bodyExpr = body ? `var(--${body})` : 'color-mix(in oklab, var(--muted-mark) 82%, var(--chart-cat-base))';
          const b = resolve(bodyExpr, vars, mode);
          if (!b) { failures.push(`${on}: body did not resolve`); continue; }
          const own = vars[override];
          const ink = own != null ? resolve(own, vars, mode) : luminanceSwitch(b);
          if (!ink) { failures.push(`${on}: the palette's ${override} did not resolve`); continue; }
          const c = contrast(ink, b);
          if (c < FLOOR) failures.push(`${on} on ${body || 'neutral body'}: ${c.toFixed(2)}:1`);
        }
        assert.deepEqual(failures, [], `${theme} ${mode}`);
      });
    }
  }
});
