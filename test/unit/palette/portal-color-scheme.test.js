/**
 * Unit: tools/build-docs-portal.js — the native-widget `color-scheme`
 * derivation emitted into every docs-site palette/mode token block.
 *
 * Locks the keystone of the "own native browser widgets" change: each
 * `html[data-palette][data-mode]` block declares `color-scheme` so the browser
 * paints scrollbars / form controls / spellcheck to match the surface. The
 * scheme is derived from the block's actual `--bg` luminance — NOT the mode
 * toggle — which is what keeps the edge palettes correct:
 *   • carbone   — dark canvas in BOTH modes → `dark` in both
 *   • a11y-*    — white canvas in BOTH modes → `light` in both (dark toggle inert)
 * A regression that reverts to mode-based scheme, or a future non-hex `--bg`
 * that would silently repaint a dark surface's widgets light, fails here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  isDarkSurface,
  paletteCss,
  resolvePalettes,
} = require('../../../tools/build-docs-portal');

describe('portal color-scheme derivation', () => {
  test('isDarkSurface: luminance threshold on hex (3- and 6-digit, case-insensitive)', () => {
    assert.equal(isDarkSurface('#000000'), true);
    assert.equal(isDarkSurface('#FFFFFF'), false);
    assert.equal(isDarkSurface('#000'), true);
    assert.equal(isDarkSurface('#fff'), false);
    assert.equal(isDarkSurface('#1A1A1C'), true); // carbone canvas
    assert.equal(isDarkSurface('#B8B8B5'), false); // concrete — nearest-to-threshold light
    assert.equal(isDarkSurface(' #001d33 '), true); // trimmed + lowercase
  });

  test('isDarkSurface: FAILS LOUD on a non-hex --bg instead of guessing light', () => {
    // A dark surface expressed as a non-hex value must throw, not silently
    // emit color-scheme: light (the exact bug the derivation prevents).
    assert.throws(() => isDarkSurface('color-mix(in oklab, #000, #111)'), /not a hex literal/);
    assert.throws(() => isDarkSurface('oklch(0.2 0 0)'), /not a hex literal/);
    assert.throws(() => isDarkSurface('light-dark(#fff, #000)'), /not a hex literal/);
    assert.throws(() => isDarkSurface('rebeccapurple'), /not a hex literal/);
  });

  test('every emitted block declares a color-scheme matching its --bg', () => {
    const css = paletteCss();
    const re = /html\[data-palette="([^"]+)"\]\[data-mode="([^"]+)"\]\{([^}]*)\}/g;
    let count = 0;
    for (let m; (m = re.exec(css)); ) {
      const [, palette, mode, body] = m;
      const scheme = /color-scheme:(light|dark);/.exec(body)?.[1];
      const bg = /--bg:([^;]+);/.exec(body)?.[1];
      assert.ok(scheme, `${palette}/${mode}: block is missing a color-scheme declaration`);
      assert.ok(bg, `${palette}/${mode}: block is missing --bg`);
      const expected = isDarkSurface(bg) ? 'dark' : 'light';
      assert.equal(scheme, expected, `${palette}/${mode}: color-scheme ${scheme} but --bg ${bg} reads ${expected}`);
      count++;
    }
    assert.ok(count >= 2 * resolvePalettes().length, `expected a light+dark block per palette, saw ${count}`);
  });

  test('edge palettes derive scheme from the CANVAS, not the mode toggle', () => {
    const scheme = {};
    for (const p of resolvePalettes()) {
      scheme[p.name] = { light: isDarkSurface(p.light.bg) ? 'dark' : 'light', dark: isDarkSurface(p.dark.bg) ? 'dark' : 'light' };
    }
    // carbone is an always-dark canvas → dark native widgets in BOTH modes.
    assert.deepEqual(scheme.carbone, { light: 'dark', dark: 'dark' });
    // a11y-* stay white in both modes → light native widgets even in "dark".
    for (const name of Object.keys(scheme).filter((n) => n.startsWith('a11y-'))) {
      assert.deepEqual(scheme[name], { light: 'light', dark: 'light' }, `${name} should be light in both modes`);
    }
    // A normal light↔dark palette still flips per mode.
    assert.deepEqual(scheme.indaco, { light: 'light', dark: 'dark' });
  });
});
