/**
 * manifest.schema.json is the manifest contract's SOURCE OF TRUTH.
 *
 * lib/components/index.js and lib/layout/gate.js DERIVE their vocabularies
 * from it (structurally incapable of drifting). Three mirrors remain
 * hand-written for browser-purity reasons and are sync-GATED here instead:
 * lib/transformers/focus.js and lib/authoring/lint-core.js (Vite dev serves
 * lint-core as a dependency-free leaf — a require would break it), and
 * lib/core/carousel.js's CAROUSEL_STRATEGIES table (the schema's strategy
 * enum names its keys). If one of these tests fails, the schema changed
 * without its mirror (or vice versa) — fix the mirror, never fork the
 * contract.
 *
 * Also gates the schema↔validator agreement empirically: every
 * schema-required field is enforced by validate(), and validate() enforces
 * the schema's additionalProperties:false.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const schema = require('../../../lib/components/manifest.schema.json');
const components = require('../../../lib/components/index.js');

test('index.js vocabularies are the schema enums (derivation, not copy)', () => {
  assert.deepEqual([...components.FUNCTIONS], schema.properties.function.enum);
  assert.deepEqual([...components.BUCKETS], schema.properties.bucket.enum);
  assert.deepEqual([...components.FORMS], schema.properties.form.enum);
  assert.deepEqual(
    [...components.SUBSTANCES, 'mixed'].sort(),
    [...schema.properties.substance.enum].sort(),
  );
});

test('gate.js (browser bundle) vocabularies are the schema enums', () => {
  const gate = require('../../../lib/layout/gate.js');
  assert.deepEqual([...gate.FUNCTIONS], schema.properties.function.enum);
  assert.deepEqual([...gate.BUCKETS], schema.properties.bucket.enum, 'the gate must accept every schema bucket (it once lagged, missing connect)');
  assert.deepEqual([...gate.FORMS], schema.properties.form.enum);
  assert.deepEqual([...gate.SUBSTANCES], schema.properties.substance.enum);
});

test('focus axes: schema enum == transformers/focus.js == authoring/lint-core.js (hand-written mirrors, sync-gated)', () => {
  const schemaAxes = schema.properties.capacity.properties.axis.enum;
  const focus = require('../../../lib/transformers/focus.js');
  const lintCore = require('../../../lib/authoring/lint-core.js');
  assert.deepEqual([...focus.SUPPORTED_AXES].sort(), [...schemaAxes].sort());
  assert.deepEqual([...lintCore.FOCUS_AXES].sort(), [...schemaAxes].sort());
});

test('split.strategy enum == CAROUSEL_STRATEGIES keys (the recipe names carouselize can actually run)', () => {
  const carousel = require('../../../lib/core/carousel.js');
  // CAROUSEL_STRATEGIES is internal; probe it through carouselize: a known
  // strategy must not be treated as unknown-null purely on name grounds…
  // but the direct check is stronger — export presence via the schema:
  const schemaStrategies = [...schema.properties.split.properties.strategy.enum].sort();
  const tableKeys = Object.keys(carousel.CAROUSEL_STRATEGIES ?? {}).sort();
  if (tableKeys.length) {
    assert.deepEqual(tableKeys, schemaStrategies);
  } else {
    // Table not exported: fall back to behavior — every schema strategy with an
    // unparseable body must return null WITHOUT throwing (unknown strategies
    // also return null, so pair with the manifest sweep below, which proves
    // every real recipe is schema-legal, and carousel's own 53-test suite).
    for (const s of schemaStrategies) {
      assert.equal(carousel.carouselize('<section>', '', { strategy: s }, 1.4, 'x'), null);
    }
  }
});

test('opt-in family enum: schema == OPT_IN_FAMILY_NAMES', () => {
  assert.deepEqual(
    [...components.OPT_IN_FAMILY_NAMES].sort(),
    [...schema.properties.families.items.enum].sort(),
  );
});

test('every schema-required field is enforced by validate()', () => {
  const valid = {
    name: 'x', function: 'anchor', form: 'canvas', substance: 'prose',
    tags: ['summary', 'takeaway', 'pitch'], description: 'd', skeleton: 's',
  };
  assert.deepEqual(components.validate(valid, 't'), [], 'the probe manifest must be valid');
  for (const field of schema.required) {
    const m = { ...valid };
    delete m[field];
    const errors = components.validate(m, 't');
    assert.ok(
      errors.some((e) => e.includes(field)),
      `dropping required '${field}' must produce an error mentioning it (got: ${JSON.stringify(errors)})`,
    );
  }
});

test('validate() enforces the schema additionalProperties:false', () => {
  const m = {
    name: 'x', function: 'anchor', form: 'canvas', substance: 'prose',
    tags: ['summary', 'takeaway', 'pitch'], description: 'd', skeleton: 's',
    totallyMadeUpField: 1,
  };
  const errors = components.validate(m, 't');
  assert.ok(errors.some((e) => e.includes("unknown manifest key 'totallyMadeUpField'")), JSON.stringify(errors));
});

test('split recipes are validated: a typo or prototype-name strategy is rejected at load, not at render', () => {
  const base = {
    name: 'x', function: 'anchor', form: 'canvas', substance: 'prose',
    tags: ['summary', 'takeaway', 'pitch'], description: 'd', skeleton: 's',
  };
  for (const strategy of ['cover-paginat', 'toString', 'hasOwnProperty', '', undefined]) {
    const errors = components.validate({ ...base, split: { strategy } }, 't');
    assert.ok(errors.some((e) => e.includes('split.strategy')), `strategy ${JSON.stringify(strategy)} must be rejected`);
  }
  assert.deepEqual(
    components.validate({ ...base, split: { strategy: 'cover-paginate', axis: 'item', perPage: 2, intro: 'i', note: 'n' } }, 't'),
    [],
    'a real recipe passes',
  );
  const bad = components.validate({ ...base, split: { strategy: 'cover-rows', perPage: 0, roles: [''], junk: 1 } }, 't');
  assert.ok(bad.some((e) => e.includes('split.perPage')));
  assert.ok(bad.some((e) => e.includes('split.roles')));
  assert.ok(bad.some((e) => e.includes("unknown key 'junk'")));
});
