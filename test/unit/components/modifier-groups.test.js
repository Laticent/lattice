// MODIFIER_GROUPS — the one registry behind the linter's universal vocabulary, a
// manifest's `excludes`, and the editor's positional `_class:` completion.
// See engineering/decisions/2026-09-24-positional-class-completion.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MODIFIER_GROUPS,
  UNIVERSAL_MODIFIER_TOKENS,
  UNIVERSAL_GROUPS,
  SEMI_UNIVERSAL_VARIANTS,
  EXCLUSIVE_AXES,
  expandExcludes,
  excludedModifiers,
  surfaceOf,
  effectiveVariants,
  loadAll,
} = require('../../../lib/components');

test('every group token belongs to exactly one group', () => {
  const seen = new Map();
  for (const g of MODIFIER_GROUPS) {
    for (const t of [...g.tokens, ...Object.values(g.follows || {}).flat()]) {
      assert.ok(!seen.has(t), `'${t}' is in both '${seen.get(t)}' and '${g.name}'`);
      seen.set(t, g.name);
    }
  }
});

test('no group name collides with a token, so an excludes entry is never ambiguous', () => {
  const tokens = new Set(UNIVERSAL_MODIFIER_TOKENS);
  for (const g of MODIFIER_GROUPS) {
    // `accent` is the one deliberate overlap: the group holds only the token itself.
    if (g.name === 'accent') { assert.deepEqual(g.tokens, ['accent']); continue; }
    assert.ok(!tokens.has(g.name), `group '${g.name}' is also a token`);
  }
});

test('the registry covers every universal and semi-universal variant', () => {
  const tokens = new Set(UNIVERSAL_MODIFIER_TOKENS);
  for (const group of Object.values(UNIVERSAL_GROUPS)) {
    for (const v of group) for (const t of v.split(/\s+/)) assert.ok(tokens.has(t), `universal '${t}' has no group`);
  }
  for (const v of SEMI_UNIVERSAL_VARIANTS) assert.ok(tokens.has(v), `semi-universal '${v}' has no group`);
});

test("every engine exclusive axis is exclusive in the registry too", () => {
  const axesOf = (g) => (g.exclusive ? [g.tokens] : g.axes || []);
  const registryAxes = MODIFIER_GROUPS.flatMap(axesOf);
  for (const [name, members] of Object.entries(EXCLUSIVE_AXES)) {
    const home = registryAxes.find((a) => members.every((t) => a.includes(t)));
    assert.ok(home, `EXCLUSIVE_AXES.${name} is not one registry axis`);
  }
});

test('axes and follows only name tokens of their own group', () => {
  for (const g of MODIFIER_GROUPS) {
    for (const a of g.axes || []) for (const t of a) assert.ok(g.tokens.includes(t), `${g.name} axis names '${t}'`);
    for (const lead of Object.keys(g.follows || {})) assert.ok(g.tokens.includes(lead), `${g.name} follows '${lead}'`);
  }
});

test('expandExcludes expands a group name and passes a token through', () => {
  const out = expandExcludes(['table', 'dark']);
  for (const t of UNIVERSAL_GROUPS.table) assert.ok(out.has(t));
  assert.ok(out.has('dark'));
  assert.ok(expandExcludes(['decoration']).has('at-tl'), 'a group exclusion takes its dependents with it');
});

test('effectiveVariants honors a group exclusion, including multi-token decorations', () => {
  const base = { name: 'x', variants: [] };
  assert.ok(effectiveVariants(base).includes('table-fill'));
  assert.ok(!effectiveVariants({ ...base, excludes: ['table'] }).includes('table-fill'));
  assert.ok(effectiveVariants(base).includes('tint-corner at-tl'));
  assert.ok(!effectiveVariants({ ...base, excludes: ['tint-corner'] }).includes('tint-corner at-tl'));
});

test('excludedModifiers is the manifest escape hatch, groups expanded', () => {
  assert.deepEqual(excludedModifiers({ name: 'x' }), []);
  const out = excludedModifiers({ name: 'x', excludes: ['cards', 'claim-bleed'] });
  assert.ok(out.includes('cards-center'));
  assert.ok(out.includes('claim-bleed'));
});

test('every group names a known surface (absent = slide)', () => {
  const { SURFACES } = require('../../../lib/components/surfaces');
  for (const g of MODIFIER_GROUPS) {
    for (const t of g.tokens) assert.ok(SURFACES.includes(surfaceOf(g, t)), `${g.name}/${t} acts on unknown surface '${surfaceOf(g, t)}'`);
  }
});

test('every shipped manifest validates its excludes against the registry', () => {
  const groups = new Set(MODIFIER_GROUPS.map((g) => g.name));
  const tokens = new Set(UNIVERSAL_MODIFIER_TOKENS);
  for (const m of loadAll()) {
    for (const e of m.excludes || []) assert.ok(groups.has(e) || tokens.has(e), `${m.name} excludes unknown '${e}'`);
  }
});
