const { test } = require('node:test');
const assert = require('node:assert');

const {
  EXCLUSIVE_AXES,
  UNIVERSAL_VARIANTS,
  SEMI_UNIVERSAL_VARIANTS,
} = require('../../../lib/components');

// EXCLUSIVE_AXES is the single source of per-slide mutual-exclusivity, consumed by
// BOTH the conflicting-variants lint rule and the Studio drawer. It must never drift
// from the real vocabulary: every token it names has to be a genuine universal or
// semi-universal, else the drawer would offer (and the linter would key on) a token
// the engine doesn't accept. This test is that drift gate.
test('every EXCLUSIVE_AXES token is a real universal or semi-universal variant', () => {
  const known = new Set([
    ...UNIVERSAL_VARIANTS.flatMap((v) => v.split(/\s+/)),
    ...SEMI_UNIVERSAL_VARIANTS,
  ]);
  for (const [axis, tokens] of Object.entries(EXCLUSIVE_AXES)) {
    assert.ok(tokens.length >= 2, `axis '${axis}' needs at least two members to be exclusive`);
    for (const t of tokens) {
      assert.ok(known.has(t), `EXCLUSIVE_AXES.${axis} names '${t}', which is not a known universal/semi-universal`);
    }
  }
});

// The axes must be disjoint — a token can belong to only one exclusive axis, or the
// drawer's single-select semantics would be ambiguous.
test('EXCLUSIVE_AXES axes are mutually disjoint', () => {
  const seen = new Map();
  for (const [axis, tokens] of Object.entries(EXCLUSIVE_AXES)) {
    for (const t of tokens) {
      assert.ok(!seen.has(t), `'${t}' appears in both '${seen.get(t)}' and '${axis}'`);
      seen.set(t, axis);
    }
  }
});
