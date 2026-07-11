/**
 * Unit: the offline token-value evaluator (lib/core/resolve-token-expr.js).
 *
 * This is the offline twin of getComputedStyle that the emulator's Mermaid
 * bridge relies on. It is what lets the universal token system alias new→old
 * (var(--cat-1-fill) → var(--c1-light) → light-dark() → hex) without feeding
 * Mermaid an unresolved expression and getting black diagrams. These tests
 * pin the three value forms all three render paths must agree on.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTokenExpr, resolveDeclarationValue } = require('../../../lib/core/resolve-token-expr');

describe('resolve-token-expr', () => {
  test('plain literals pass through verbatim (byte-identical)', () => {
    assert.equal(resolveTokenExpr('#001D33', {}, false), '#001D33');
    assert.equal(resolveTokenExpr('1.875cqi', {}, false), '1.875cqi');
    assert.equal(resolveTokenExpr('rgba(1,2,3,0.5)', {}, false), 'rgba(1,2,3,0.5)');
  });

  test('var() chains resolve to a fixed point, order-independent', () => {
    const vars = { a: 'var(--b)', c: '#123456', b: 'var(--c)' };
    assert.equal(resolveTokenExpr('var(--a)', vars, false), '#123456');
  });

  test('var() fallback is used when the name is undefined', () => {
    assert.equal(resolveTokenExpr('var(--missing, #abcdef)', {}, false), '#abcdef');
  });

  test('light-dark() collapses per scheme', () => {
    assert.equal(resolveTokenExpr('light-dark(#aaaaaa, #bbbbbb)', {}, false), '#aaaaaa');
    assert.equal(resolveTokenExpr('light-dark(#aaaaaa, #bbbbbb)', {}, true), '#bbbbbb');
  });

  test('THE critical case: alias new→old through light-dark resolves to a hex', () => {
    // This is exactly the shape phase-1 introduces in base.tokens.css + themes.
    const vars = {
      'cat-1-fill': 'var(--c1-light)',
      'c1-light': 'light-dark(#BCD5EC, #006398)',
    };
    assert.equal(resolveTokenExpr('var(--cat-1-fill)', vars, false), '#BCD5EC');
    assert.equal(resolveTokenExpr('var(--cat-1-fill)', vars, true), '#006398');
  });

  test('color-mix(in srgb, …) is a gamma midpoint', () => {
    assert.equal(resolveTokenExpr('color-mix(in srgb, #000000 50%, #ffffff)', {}, false), '#808080');
  });

  test('color-mix(in oklab, …) returns a valid hex (nested var resolved)', () => {
    const vars = { hue: '#0a6ce0', bg: '#ffffff' };
    const out = resolveTokenExpr('color-mix(in oklab, var(--hue) 24%, var(--bg))', vars, false);
    assert.match(out, /^#[0-9a-f]{6}$/i, `expected a hex, got ${out}`);
  });

  test('color-mix with a transparent stop yields rgba at the reduced alpha', () => {
    const out = resolveTokenExpr('color-mix(in srgb, #112233 10%, transparent)', {}, false);
    assert.match(out, /^rgba\(17,34,51,0\.10?0?\)$/, `got ${out}`);
  });

  test('alias cycles terminate without throwing or hanging', () => {
    const vars = { a: 'var(--b)', b: 'var(--a)' };
    assert.doesNotThrow(() => resolveTokenExpr('var(--a)', vars, false));
  });

  test('non-resolvable color-mix stops pass through (no crash on currentColor)', () => {
    const out = resolveTokenExpr('color-mix(in srgb, currentColor 10%, transparent)', {}, false);
    assert.ok(typeof out === 'string');
  });
});

// The old-browser CSS-fallback generator (tools/build-chart-compat-css.js)
// flattens WHOLE declaration values — multi-stop gradients whose stops are
// light-dark(color-mix(...)) — not just single-colour token chains. These pin
// that embedded-resolution behaviour: every colour function in the value must
// collapse to a literal, the surrounding gradient syntax must survive intact,
// and a value with no colour function must come out byte-identical.
describe('resolveDeclarationValue (whole-declaration flatten)', () => {
  // A cascade like the real chart-family kernel resolves against.
  const vars = {
    bg: 'light-dark(#ffffff, #0d1b2a)',
    'chart-cat-1-hue': 'var(--chart-cat1, light-dark(#0A6CE0, #2E8BFF))',
    'chart-cat-base': 'light-dark(var(--bg), black)',
    'state-pass-hue': 'var(--chart-state-pass, light-dark(#1E9E48, #34D058))',
  };

  test('a value with no colour function is byte-identical', () => {
    assert.equal(resolveDeclarationValue('180deg', vars, false), '180deg');
    assert.equal(resolveDeclarationValue('1px solid transparent', vars, false), '1px solid transparent');
  });

  test('the pie radial stop (bare color-mix embedded) resolves to a hex', () => {
    const out = resolveDeclarationValue(
      'color-mix(in oklab, var(--chart-cat-1-hue) 42%, var(--chart-cat-base))', vars, false);
    assert.match(out, /^#[0-9a-f]{6}$/i, `expected a hex, got ${out}`);
  });

  test('the gantt bar 4-stop gradient: every stop flattens, offsets + angle survive', () => {
    const grad = 'linear-gradient(180deg, '
      + 'light-dark(color-mix(in oklab, var(--state-pass-hue) 20%, var(--bg)), '
      +            'color-mix(in oklab, var(--state-pass-hue) 48%, black)) 0%, '
      + 'light-dark(color-mix(in oklab, var(--state-pass-hue) 38%, var(--bg)), '
      +            'color-mix(in oklab, var(--state-pass-hue) 64%, black)) 100%)';
    const light = resolveDeclarationValue(grad, vars, false);
    const dark = resolveDeclarationValue(grad, vars, true);
    // No modern colour function may survive — that is the whole point of the fallback.
    for (const [mode, out] of [['light', light], ['dark', dark]]) {
      assert.doesNotMatch(out, /light-dark\(|color-mix\(/, `${mode} still has a modern fn: ${out}`);
      assert.match(out, /^linear-gradient\(180deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/i,
        `${mode} shape wrong: ${out}`);
    }
    // Light and dark must actually differ (the branch was really taken).
    assert.notEqual(light, dark);
  });

  test('radial-gradient with three stops keeps its geometry keywords', () => {
    const grad = 'radial-gradient(circle at 50% 40%, '
      + 'color-mix(in oklab, var(--chart-cat-1-hue) 42%, var(--chart-cat-base)) 0%, '
      + 'color-mix(in oklab, var(--chart-cat-1-hue) 82%, var(--chart-cat-base)) 100%)';
    const out = resolveDeclarationValue(grad, vars, false);
    assert.doesNotMatch(out, /color-mix\(/, out);
    assert.match(out, /^radial-gradient\(circle at 50% 40%, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/i, out);
  });

  test('an ident ending in a colour-func name does not false-match', () => {
    // `my-var(...)` must NOT be treated as `var(...)`.
    assert.equal(resolveDeclarationValue('my-var(--x)', vars, false), 'my-var(--x)');
  });
});
