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
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');

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
