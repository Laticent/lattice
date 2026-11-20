/**
 * resolveTokenExpr reads a color-mix() stop as a color and an optional percentage. The percentage can be a var() that
 * resolves to one: the risk matrix's dark critical band is
 * `color-mix(in oklab, var(--fail-vivid-mark) var(--risk-critical-keep, 82%), var(--bg))`. The old reader took the
 * first `%` anywhere in the stop, found the one inside the var()'s fallback, cut it out of the color and returned the
 * expression unresolved.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr.js');

const CRITICAL_DARK = 'color-mix(in oklab, var(--fail-vivid-mark) var(--risk-critical-keep, 82%), var(--bg))';

describe('resolveTokenExpr: color-mix stops', () => {
  test('a literal percentage still weights its stop', () => {
    assert.equal(resolveTokenExpr('color-mix(in srgb, #ff0000, #0000ff 25%)', {}, false), '#bf0040');
    assert.equal(resolveTokenExpr('color-mix(in srgb, #ff0000 75%, #0000ff)', {}, false), '#bf0040');
  });

  test('a var() percentage resolves through the token map', () => {
    const vars = { 'fail-vivid-mark': '#ff0000', bg: '#000000', 'risk-critical-keep': '50%' };
    const viaVar = resolveTokenExpr(CRITICAL_DARK, vars, true);
    assert.match(viaVar, /^#[0-9a-f]{6}$/i, `resolves to a hex, got ${viaVar}`);
    assert.equal(viaVar, resolveTokenExpr('color-mix(in oklab, #ff0000 50%, #000000)', {}, true));
  });

  test('an undeclared var() percentage takes its fallback', () => {
    const vars = { 'fail-vivid-mark': '#ff0000', bg: '#000000' };
    assert.equal(resolveTokenExpr(CRITICAL_DARK, vars, true), resolveTokenExpr('color-mix(in oklab, #ff0000 82%, #000000)', {}, true));
  });

  test('a light-dark() pair of mixes resolves each face', () => {
    const vars = { 'fail-vivid-mark': '#ff0000', bg: '#000000', 'risk-critical-keep': '60%' };
    const expr = `light-dark(color-mix(in oklab, var(--fail-vivid-mark) 82%, #000000), ${CRITICAL_DARK})`;
    assert.equal(resolveTokenExpr(expr, vars, false), resolveTokenExpr('color-mix(in oklab, #ff0000 82%, #000000)', {}, false));
    assert.equal(resolveTokenExpr(expr, vars, true), resolveTokenExpr('color-mix(in oklab, #ff0000 60%, #000000)', {}, true));
  });
});
