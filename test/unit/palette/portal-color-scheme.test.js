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
const { contrastRatio } = require('../../../lib/core/color.js');

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
    // carbone USED TO BE the always-dark example here — `{ light: 'dark', dark: 'dark' }`,
    // because its canvas did not follow color-scheme. It was curated a real light face and
    // now flips like any other base palette, so it is asserted with the normal case below.
    // The edge the test is named for is still covered, by the a11y-* set: this gate reads
    // the CANVAS, and it would still catch a palette whose scheme and --bg disagree.
    // a11y-* stay white in both modes → light native widgets even in "dark".
    for (const name of Object.keys(scheme).filter((n) => n.startsWith('a11y-'))) {
      assert.deepEqual(scheme[name], { light: 'light', dark: 'light' }, `${name} should be light in both modes`);
    }
    // Normal light↔dark palettes flip per mode — carbone among them now.
    assert.deepEqual(scheme.indaco, { light: 'light', dark: 'dark' });
    assert.deepEqual(scheme.carbone, { light: 'light', dark: 'dark' });
  });
});

/**
 * Unit: the site derives no status fill of its own. A `--{pass,warn,fail}-fill` tier (the status hue
 * darkened under white text) was retired for the theme's own curated pill, `--X-mark` under
 * `--X-on-mark` (engineering/decisions/2026-11-28-site-token-fidelity.md). That pair's AA floor on
 * every palette and mode is held by tools/check-shadcn-bridge-contrast.js.
 */
describe('status pills are the theme\'s own', () => {
  test('no palette/mode block emits a site-derived -fill tier', () => {
    assert.doesNotMatch(paletteCss(), /--(pass|warn|fail)-fill:/);
  });
  test('every block emits each status mark and the ink drawn on it', () => {
    const css = paletteCss();
    const re = /html\[data-palette="([^"]+)"\]\[data-mode="([^"]+)"\]\{([^}]*)\}/g;
    for (let m; (m = re.exec(css)); ) {
      for (const s of ['pass', 'warn', 'fail', 'info', 'mute']) {
        const mark = new RegExp(`--${s}-mark:([^;]+);`).exec(m[3])?.[1];
        const on = new RegExp(`--${s}-on-mark:([^;]+);`).exec(m[3])?.[1];
        assert.ok(mark && on, `${m[1]}/${m[2]}: missing --${s}-mark or --${s}-on-mark`);
        assert.ok(contrastRatio(on, mark) >= 4.5, `${m[1]}/${m[2]}: --${s}-on-mark on --${s}-mark is ${contrastRatio(on, mark).toFixed(3)}:1`);
      }
    }
  });
});

/**
 * Unit: foreground status ink (--pass/--warn/--fail) clears AA on its OWN chrome
 * --bg, in every palette/mode block.
 *
 * Guards the carbone class of bug: carbone's --bg is a FLAT dark #1A1A1C but its
 * status tokens are light-dark(), and the portal flattens light-dark per mode —
 * so before the scheme-based fix the [data-mode="light"] block paired the
 * light-side --fail (#A02323) against the dark canvas at 2.28:1. resolvePalettes
 * now resolves each block's tokens to the arg matching THAT block's canvas scheme,
 * so a dark-in-both palette takes the dark args in both. This locks it: a
 * regression that reverts to per-toggle (not per-canvas) resolution fails here.
 */
describe('foreground status ink clears AA on its own chrome bg', () => {
  test('every block: --pass/--warn/--fail >= 4.5:1 on --bg', () => {
    const css = paletteCss();
    const re = /html\[data-palette="([^"]+)"\]\[data-mode="([^"]+)"\]\{([^}]*)\}/g;
    let checks = 0;
    for (let m; (m = re.exec(css)); ) {
      const [, palette, mode, body] = m;
      const bg = /--bg:([^;]+);/.exec(body)?.[1]?.trim();
      assert.ok(bg, `${palette}/${mode}: block is missing --bg`);
      assert.match(bg, /^#[0-9a-f]{6}$/i, `${palette}/${mode}: --bg ${bg} is not a 6-digit hex`);
      for (const t of ['pass', 'warn', 'fail']) {
        const match = new RegExp(`--${t}:([^;]+);`).exec(body);
        assert.ok(match, `${palette}/${mode}: missing --${t}`);
        const v = match[1].trim();
        assert.match(v, /^#[0-9a-f]{6}$/i, `${palette}/${mode}: --${t} ${v} is not a 6-digit hex`);
        const ratio = contrastRatio(v, bg);
        assert.ok(ratio >= 4.5, `${palette}/${mode}: --${t} ${v} on --bg ${bg} = ${ratio.toFixed(2)}:1 (< 4.5)`);
        checks++;
      }
    }
    assert.ok(checks >= 3 * 2 * resolvePalettes().length, `expected 3 status tokens × 2 modes per palette, saw ${checks}`);
  });
});
