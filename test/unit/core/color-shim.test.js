/**
 * Unit: the old-browser colour shim (lib/core/color-shim.js).
 *
 * Locks the two halves of 2026-07-13-old-browser-color-shim.md:
 *   1. CORE — `resolveFlatPalette` flattens exactly the FRAGILE tokens (those that would black out
 *      on an old engine) to correct per-scheme literals, leaves old-safe tokens alone, and never
 *      ships a half-resolved value. Run against the REAL shipped theme so the resolver + parser are
 *      exercised end to end, both schemes.
 *   2. WIRING — `installColorShim` is a no-op on a modern engine and injects the flat palette on an
 *      old one, with every environment touch stubbed (no DOM needed).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  chainHasModernFn, resolveFlatPalette, flatPaletteCss, installColorShim,
} = require('../../../lib/core/color-shim');
const { resolveDeclarationValue } = require('../../../lib/core/resolve-token-expr');
const { parseRootVars } = require('../../../lib/core/parse-root-vars');

const ROOT = path.resolve(__dirname, '../../..');
const readTheme = (t) => fs.readFileSync(path.join(ROOT, 'dist', 'themes', `${t}.min.css`), 'utf8');

describe('color-shim core', () => {
  test('flattens every fragile core token to a clean per-scheme literal (real theme, both schemes)', () => {
    const css = readTheme('indaco');
    for (const isDark of [false, true]) {
      const flat = resolveFlatPalette(css, isDark);
      // The load-bearing core colours must all be present AND flat (hex / rgb / named).
      for (const t of ['bg', 'bg-alt', 'text-heading', 'text-body', 'text-muted', 'accent', 'border', 'pass', 'warn', 'fail']) {
        assert.ok(t in flat, `${isDark ? 'dark' : 'light'}: --${t} missing from the flat palette`);
        assert.match(flat[t], /^(#|rgb|hsl|black$|white$)/i, `--${t} not a flat literal: ${flat[t]}`);
      }
      // NOTHING half-resolved may ship — no residual modern function or var().
      for (const [name, v] of Object.entries(flat)) {
        assert.doesNotMatch(v, /light-dark\(|color-mix\(|okl?ch\(|oklab\(|lab\(|lch\(|hwb\(|var\(/i,
          `--${name} shipped unflattened: ${v}`);
      }
    }
  });

  test('matches resolveDeclarationValue exactly — the shim is the resolver, no drift', () => {
    const css = readTheme('indaco');
    const vars = parseRootVars(css);
    const flat = resolveFlatPalette(css, true);
    for (const t of ['bg', 'text-heading', 'accent', 'border', 'pass']) {
      assert.equal(flat[t], resolveDeclarationValue(`var(--${t})`, vars, true));
    }
  });

  test('a *-dark theme resolves to its dark literals (bg goes dark)', () => {
    const light = resolveFlatPalette(readTheme('indaco'), false);
    const dark = resolveFlatPalette(readTheme('indaco'), true);
    assert.notEqual(light.bg, dark.bg, 'the two schemes must differ');
    assert.match(light.bg, /#f|#F|white/i);
  });

  test('leaves old-safe tokens OUT (only fragile ones ship)', () => {
    // A flat literal or a plain var()-to-flat chain is old-safe; a light-dark()/color-mix() is not.
    assert.equal(chainHasModernFn('#1a2b3c', {}), false);
    assert.equal(chainHasModernFn('var(--x)', { x: '#000' }), false);
    assert.equal(chainHasModernFn('light-dark(#000,#fff)', {}), true);
    assert.equal(chainHasModernFn('var(--x)', { x: 'color-mix(in oklab, red, blue)' }), true);
    const flat = resolveFlatPalette('  :root { --flatc: #123456; --dyn: light-dark(#000, #fff); }', false);
    assert.ok(!('flatc' in flat), 'an already-flat literal must not be re-declared');
    assert.equal(flat.dyn, '#000');
  });

  test('flatPaletteCss serializes an injectable :root rule', () => {
    const css = flatPaletteCss({ bg: '#fff', 'text-heading': '#000' });
    assert.match(css, /^:root \{ --bg: #fff; --text-heading: #000 \}$/);
    assert.equal(flatPaletteCss({}), '', 'empty palette → no rule');
  });
});

describe('color-shim wiring (seamed, no DOM)', () => {
  const THEME = '  :root { --bg: light-dark(#FFFFFF, #001D33); --n: 4px; }';

  test('MODERN engine → no-op (nothing injected)', () => {
    let injected = null;
    const ran = installColorShim({
      supportsModernColor: () => true,
      readRootCss: () => THEME,
      isDark: () => false,
      inject: (css) => { injected = css; },
    });
    assert.equal(ran, false);
    assert.equal(injected, null, 'a modern engine must never inject');
  });

  test('OLD engine → injects the flat palette for the active scheme', () => {
    let injected = null;
    const ran = installColorShim({
      supportsModernColor: () => false,
      readRootCss: () => THEME,
      isDark: () => true,
      inject: (css) => { injected = css; },
    });
    assert.equal(ran, true);
    assert.match(injected, /--bg: #001D33/, 'dark scheme → dark literal injected');
    assert.doesNotMatch(injected, /light-dark|var\(/, 'injected palette must be fully flat');
  });

  test('OLD engine but empty/unreadable :root → no-op, no throw', () => {
    const ran = installColorShim({
      supportsModernColor: () => false,
      readRootCss: () => '',
      isDark: () => false,
      inject: () => { throw new Error('must not inject on empty input'); },
    });
    assert.equal(ran, false);
  });
});
