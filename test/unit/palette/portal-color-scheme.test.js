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
const { contrastRatio } = require('../../../lib/theme/color.js');

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

/**
 * Unit: the white-text-safe status FILL trio (`--pass-fill`/`--warn-fill`/
 * `--fail-fill`) the portal derives alongside the foreground status trio.
 *
 * The foreground `--pass`/`--warn`/`--fail` are tuned to READ as text and go
 * BRIGHT in dark mode, so a `bg-[var(--fail)] text-white` chip/button inverts
 * to ~2:1. The derivation darkens the light-side status hue until white text
 * clears AA (4.5:1). This locks that contract: nothing but `ensureContrast`'s
 * own return value guards it today, and the tightest margin (carbone warn-fill)
 * sits at ~4.50 — a hair above the floor — so a theme tweak could cross it
 * unnoticed. If a future palette expressed a status token as a non-hex value,
 * the derivation FAILS LOUD (mirroring isDarkSurface) rather than shipping an
 * un-checked fill; that path is exercised by the resolvePalettes call below
 * simply completing without throwing on today's all-hex palettes.
 */
describe('status fill tokens (white-text-safe)', () => {
  const FILLS = ['pass-fill', 'warn-fill', 'fail-fill'];

  test('every palette/mode block emits all three fills, as 6-digit hex', () => {
    const css = paletteCss();
    const re = /html\[data-palette="([^"]+)"\]\[data-mode="([^"]+)"\]\{([^}]*)\}/g;
    let blocks = 0;
    for (let m; (m = re.exec(css)); ) {
      const [, palette, mode, body] = m;
      for (const t of FILLS) {
        const v = new RegExp(`--${t}:([^;]+);`).exec(body)?.[1];
        assert.ok(v, `${palette}/${mode}: missing --${t}`);
        assert.match(v, /^#[0-9a-f]{6}$/i, `${palette}/${mode}: --${t} "${v}" is not 6-digit hex`);
      }
      blocks++;
    }
    assert.equal(blocks, 2 * resolvePalettes().length, `expected a light+dark block per palette, saw ${blocks}`);
  });

  test('every emitted fill clears AA (4.5:1) against white text', () => {
    const css = paletteCss();
    const re = /html\[data-palette="([^"]+)"\]\[data-mode="([^"]+)"\]\{([^}]*)\}/g;
    for (let m; (m = re.exec(css)); ) {
      const [, palette, mode, body] = m;
      for (const t of FILLS) {
        const match = new RegExp(`--${t}:([^;]+);`).exec(body);
        assert.ok(match, `${palette}/${mode}: missing --${t}`);
        const v = match[1];
        const ratio = contrastRatio(v, '#ffffff');
        assert.ok(ratio >= 4.5, `${palette}/${mode}: white on --${t} ${v} is ${ratio.toFixed(3)}:1 (< 4.5)`);
      }
    }
  });

  test('a fill is identical in light and dark mode (a solid button must not flip color)', () => {
    for (const p of resolvePalettes()) {
      for (const t of FILLS) {
        assert.equal(p.light[t], p.dark[t], `${p.name}: --${t} differs between modes (${p.light[t]} vs ${p.dark[t]})`);
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
