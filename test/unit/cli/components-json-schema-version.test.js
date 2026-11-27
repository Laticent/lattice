/**
 * Unit: `dist/docs/components.json` keeps every field it has published, or bumps `schemaVersion`
 * (initiative #3531, E2 #3522).
 *
 * The npm package exports the file (`@laticent/lattice/dist/docs/components.json`), so tools outside
 * this repository read its fields. The policy (design/design-system.md §7): a NEW field keeps
 * `schemaVersion`; REMOVING or RENAMING a field bumps it.
 *
 * The checked-in fixture `test/fixtures/components-json-fields.json` lists the field paths the file
 * published at its `schemaVersion`. This test builds the JSON fresh from the manifests (no `dist/`
 * needed) and asserts:
 *
 *   1. `schemaVersion` is a positive integer and equals the fixture's. A bump without refreshing the
 *      fixture fails here, so the fixture always describes the current version.
 *   2. Every field path in the fixture is still in the file. A field that disappears fails here
 *      unless the version was bumped and the fixture refreshed with it.
 *   3. The failing arm: a copy of the file with one field deleted (top level, per component, and
 *      nested) is reported missing, so a green run means the check can see a removal.
 *
 * A field path is a field NAME, never a data key: `components[].capacity.sweet` is a field, but the
 * modifier names inside `vocabularies.modifierUsage` are data, and so are slot names, so a removed
 * component or modifier never trips this test. MAPS below names the objects whose keys are data;
 * `{}` in a path stands for "any key of that map".
 *
 * Refresh after a bump (or to record new fields, which is optional and never required):
 *   UPDATE_COMPONENTS_JSON_FIELDS=1 node --test test/unit/cli/components-json-schema-version.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'components-json-fields.json');
const portal = require('../../../tools/build-docs-portal.js');

/** Objects whose keys are DATA (names of slots, modifiers, tags…). Their values are walked as `{}`. */
const MAPS = new Set([
  'vocabularies.tags',
  'vocabularies.universalGroups',
  'vocabularies.exclusiveAxes',
  'vocabularies.modifierUsage',
  'vocabularies.familyModifiers',
  'components[].slots',
  'components[].modifierUsage',
  'components[].variantSurfaces',
]);

/**
 * Objects pinned by presence only. `venueCapacity` nests variant names, modifier names and word
 * counts inside each other, so no path can tell its fields from its data; its inner shape is the
 * manifest schema's to hold (lib/components/manifest.schema.json, gated by tools/manifest-schemas.js).
 */
const OPAQUE = new Set(['components[].venueCapacity']);

/**
 * Every field path in `value`, found by walking records and arrays of records. Under a map, only
 * record-shaped values are walked further (`components[].slots{}.selector`); a map of lists or
 * numbers contributes just its own path.
 */
function fieldPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) if (item && typeof item === 'object' && !Array.isArray(item)) fieldPaths(item, `${prefix}[]`, out);
    return out;
  }
  if (!value || typeof value !== 'object' || OPAQUE.has(prefix)) return out;
  if (MAPS.has(prefix)) {
    for (const v of Object.values(value)) if (v && typeof v === 'object' && !Array.isArray(v)) fieldPaths(v, `${prefix}{}`, out);
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p);
    fieldPaths(v, p, out);
  }
  return out;
}

/** The field paths in `fixture` that `doc` no longer has. */
function missingFields(doc, fixture) {
  const now = fieldPaths(doc);
  return fixture.fields.filter((f) => !now.has(f));
}

const built = () => JSON.parse(portal.build().json);

if (process.env.UPDATE_COMPONENTS_JSON_FIELDS === '1') {
  const doc = built();
  const record = { schemaVersion: doc.schemaVersion, fields: [...fieldPaths(doc)].sort() };
  fs.writeFileSync(FIXTURE, `${JSON.stringify(record, null, 2)}\n`);
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

test('schemaVersion is a positive integer and matches the fixture', () => {
  const doc = built();
  assert.ok(Number.isInteger(doc.schemaVersion) && doc.schemaVersion >= 1, `schemaVersion is ${JSON.stringify(doc.schemaVersion)}`);
  assert.equal(doc.schemaVersion, portal.COMPONENTS_JSON_SCHEMA_VERSION);
  assert.equal(
    doc.schemaVersion,
    fixture.schemaVersion,
    'schemaVersion changed: refresh the fixture with UPDATE_COMPONENTS_JSON_FIELDS=1 (see this file\'s header)',
  );
});

test('every field the fixture lists is still published', () => {
  const missing = missingFields(built(), fixture);
  assert.deepEqual(
    missing,
    [],
    `components.json dropped ${missing.length} field(s) without a schemaVersion bump. Removing or renaming a field bumps COMPONENTS_JSON_SCHEMA_VERSION in tools/build-docs-portal.js (design/design-system.md §7).`,
  );
});

test('the failing arm: a deleted field is reported, at every depth', () => {
  /** Delete `key` from every object `pick(component)` yields. */
  const dropEach = (pick, key) => (d) => {
    for (const c of d.components) for (const o of pick(c)) delete o[key];
  };
  const cases = [
    ['schemaVersion', (d) => { delete d.schemaVersion; }],
    ['vocabularies.modifierGroups', (d) => { delete d.vocabularies.modifierGroups; }],
    ['components[].galleryHref', dropEach((c) => [c], 'galleryHref')],
    ['components[].capacity.sweet', dropEach((c) => (c.capacity ? [c.capacity] : []), 'sweet')],
    ['components[].slots{}.selector', dropEach((c) => Object.values(c.slots || {}), 'selector')],
    ['components[].related[].when', dropEach((c) => c.related || [], 'when')],
  ];
  for (const [field, drop] of cases) {
    assert.ok(fixture.fields.includes(field), `the fixture lists ${field}`);
    const doc = built();
    drop(doc);
    assert.ok(missingFields(doc, fixture).includes(field), `deleting ${field} is caught`);
  }
});

test('data keys are not fields: dropping a component or a modifier changes nothing', () => {
  const doc = built();
  doc.components.pop();
  const [first] = Object.keys(doc.vocabularies.modifierUsage);
  delete doc.vocabularies.modifierUsage[first];
  assert.deepEqual(missingFields(doc, fixture), []);
});
