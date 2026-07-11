/**
 * manifest.schema.json is the manifest contract's SOURCE OF TRUTH.
 *
 * lib/components/index.js and lib/layout/gate.js DERIVE their vocabularies
 * from it, so the derived values cannot drift — but that also means a
 * derived-vs-schema comparison is a tautology. The REAL gates here are the
 * FIXTURE PINS below: literal copies of the schema's load-bearing content,
 * so any schema edit (widen, delete, reorder, un-anchor the name pattern)
 * must change a fixture in the same reviewed diff — a schema change can
 * never again read as "just docs". Three mirrors remain
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
  assert.ok(carousel.CAROUSEL_STRATEGIES, 'CAROUSEL_STRATEGIES export removed — this sync gate would be blinded; restore it');
  assert.deepEqual(
    Object.keys(carousel.CAROUSEL_STRATEGIES).sort(),
    [...schema.properties.split.properties.strategy.enum].sort(),
  );
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

// ── FIXTURE PINS — the anti-rubber-stamp gate ──────────────────────────────
// The schema is load-bearing: these enums drive the validator, the Studio
// gate (browser), and loadAll()'s directory walk. Because code DERIVES from
// the schema, only literal fixtures can catch a widened/deleted/reordered
// enum. If this test fails, you edited the schema: confirm the change is
// intentional, update the fixture IN THE SAME COMMIT, and check every
// consumer named in the failing assertion's message.

test('FIXTURE PIN: the core vocabularies and name pattern', () => {
  assert.deepEqual(schema.properties.function.enum,
    ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery'],
    'function enum changed — validator + Studio gate + docs grouping all follow');
  assert.deepEqual(schema.properties.bucket.enum,
    ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery',
      'chart', 'diagram', 'math', 'code', 'legal', 'connect'],
    'bucket enum changed — loadAll() only walks listed buckets: a deleted entry SILENTLY drops that whole component family from the catalog');
  assert.deepEqual(schema.properties.form.enum,
    ['bookend', 'divider', 'canvas', 'grid', 'stack', 'ledger', 'panel', 'matrix', 'scatter', 'spatial', 'timeline', 'split'],
    'form enum changed');
  assert.deepEqual(schema.properties.substance.enum,
    ['prose', 'structure', 'series', 'graph', 'mixed'],
    'substance enum changed');
  assert.equal(schema.properties.name.pattern, '^[a-z][a-z0-9-]*$',
    'name pattern changed — an un-anchored pattern silently loosens name validation in the validator AND the Studio gate');
  assert.deepEqual(schema.required,
    ['name', 'function', 'form', 'substance', 'tags', 'description', 'skeleton'],
    'required set changed');
});

test('every lib/components/ bucket directory is a schema bucket (deleting an enum entry must not silently orphan a family)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', '..', '..', 'lib', 'components');
  const onDisk = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .filter((name) => fs.readdirSync(path.join(dir, name), { withFileTypes: true })
      .some((e) => e.isDirectory()));
  for (const b of onDisk) {
    assert.ok(components.BUCKETS.includes(b),
      `lib/components/${b}/ holds components but '${b}' is not in the schema bucket enum — loadAll() silently skips it`);
  }
});

test('the five intra-schema axis-enum copies agree (the schema must not drift against itself)', () => {
  const axes = schema.properties.capacity.properties.axis.enum;
  assert.deepEqual(schema.properties.density.properties.axis.enum, axes);
  assert.deepEqual(schema.properties.focusAxes.items.enum, axes);
  assert.deepEqual(schema.properties.split.properties.axis.enum, axes);
  assert.deepEqual(schema.properties.adapt.properties.capacity.properties.axis.enum, axes);
});

test('the emulator\'s WIDTH_REDUCING_STRATEGIES hand-subset stays within the schema strategy enum', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lattice-emulator.js'), 'utf8');
  const m = src.match(/WIDTH_REDUCING_STRATEGIES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'WIDTH_REDUCING_STRATEGIES set not found in lattice-emulator.js — update this extraction');
  const listed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(listed.length >= 1, 'extraction came back empty');
  const strategies = new Set(schema.properties.split.properties.strategy.enum);
  for (const s of listed) {
    assert.ok(strategies.has(s), `WIDTH_REDUCING_STRATEGIES lists '${s}', which is not a schema split strategy — a rename went stale`);
  }
});

test('validate() reports (never throws) on truthy non-string sample/skeleton for form-linted layouts', () => {
  // Regression: card-style/ledger/statement/split form lints assumed string
  // samples and crashed on e.g. sample: 42 (already reported as a type error
  // by the field checkers — the form lint just must not throw).
  const cases = [
    { name: 'cards-grid', sample: 42 },
    { name: 'cards-grid', skeleton: 42, sample: 'ok' },
    { name: 'split-panel', sample: 42, skeleton: {} },
    { name: 'cards-grid', variants: ['x'], variantDocs: { x: { summary: 'c', sample: 42 } } },
    { name: 'agenda', sample: [1, 2] },
  ];
  for (const c of cases) {
    const errors = components.validate(c, 't');
    assert.ok(Array.isArray(errors) && errors.length > 0, JSON.stringify(c));
  }
});
