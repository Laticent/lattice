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
 * modifier names inside `vocabularies.modifierUsage` are data, and so are slot and family names.
 * MAPS below names the objects whose keys are data; `{}` in a path stands for "any key of that map".
 *
 * A FIELD MAY LEAVE WITH ITS DATA. Many fields are written only for the components that carry them
 * (`hosts` on two, `capacity.withCompact` on one). When the last such component is retired, the field
 * leaves the file but the builder still writes it for the next one, so that is no removal. A
 * `components[]` path is therefore excused when the manifest schema defines it
 * (lib/components/manifest.schema.json) and no manifest carries it any more. It is reported when a
 * manifest still carries it and the built file does not, which is the builder dropping or renaming
 * it. A field the builder derives (`galleryHref`, `surfaces`) is not in the schema, so it is never
 * excused.
 * Test 4 retires the components that carry the rarest fields and proves nothing is reported.
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
  'vocabularies.modifierGroups[].follows',
  'vocabularies.modifierGroups[].surface',
  'components[].adapt.capacity',
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

const { loadAll } = require('../../../lib/components');
const MANIFEST_SCHEMA = require('../../../lib/components/manifest.schema.json');

/**
 * Every field path the manifest schema defines, in this file's notation, under `components[]`.
 * `$ref`, `oneOf` and `anyOf` are followed; `items` is `[]`; a map's value schema is `{}`.
 */
function schemaPaths(node = MANIFEST_SCHEMA, prefix = 'components[]', out = new Set(), seen = new Set()) {
  if (!node || typeof node !== 'object' || OPAQUE.has(prefix)) return out;
  if (node.$ref) {
    const key = `${prefix} ${node.$ref}`;
    if (seen.has(key)) return out;
    seen.add(key);
    const target = node.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], MANIFEST_SCHEMA);
    schemaPaths(target, prefix, out, seen);
  }
  for (const alt of [...(node.oneOf || []), ...(node.anyOf || [])]) schemaPaths(alt, prefix, out, seen);
  if (node.items) schemaPaths(node.items, `${prefix}[]`, out, seen);
  if (MAPS.has(prefix)) {
    const values = [node.additionalProperties, ...Object.values(node.patternProperties || {})];
    for (const v of values) if (v && typeof v === 'object') schemaPaths(v, `${prefix}{}`, out, seen);
    return out;
  }
  for (const [k, v] of Object.entries(node.properties || {})) {
    out.add(`${prefix}.${k}`);
    schemaPaths(v, `${prefix}.${k}`, out, seen);
  }
  return out;
}

/**
 * The field paths in `fixture` that `doc` no longer has, less the manifest fields no manifest in
 * `manifests` carries any more (a field that left with its data, see the header).
 */
function missingFields(doc, fixture, manifests = loadAll()) {
  const now = fieldPaths(doc);
  const carried = fieldPaths({ components: manifests });
  const defined = schemaPaths();
  const leftWithItsData = (f) => defined.has(f) && !carried.has(f);
  return fixture.fields.filter((f) => !now.has(f) && !leftWithItsData(f));
}

const built = (manifests) => JSON.parse(manifests ? portal.renderPortalJson(manifests) : portal.build().json);

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

test('data keys are not fields: retiring components or a modifier reports nothing', () => {
  // The components that carry the rarest fields (checker, round 1): kpi (adapt.capacity),
  // q-and-a (capacity.withCompact), columns and rows (hosts, label), video, compare-code and
  // diagram (slot match fields only they use).
  const RETIRED = new Set(['kpi', 'q-and-a', 'columns', 'rows', 'video', 'compare-code', 'diagram']);
  const all = loadAll();
  for (const name of RETIRED) assert.ok(all.some((m) => m.name === name), `${name} is still a component; pick another`);
  const kept = all.filter((m) => !RETIRED.has(m.name));
  const doc = built(kept);
  // A modifier renamed or dropped inside its group, and one gone from the usage counts.
  for (const g of doc.vocabularies.modifierGroups) {
    if (g.surface) for (const k of Object.keys(g.surface)) delete g.surface[k];
    if (g.follows) for (const k of Object.keys(g.follows)) delete g.follows[k];
  }
  const [first] = Object.keys(doc.vocabularies.modifierUsage);
  delete doc.vocabularies.modifierUsage[first];
  assert.deepEqual(missingFields(doc, fixture, kept), []);
});

test('the builder dropping a rare field is still caught while a manifest carries it', () => {
  const doc = built();
  for (const c of doc.components) delete c.hosts;
  assert.ok(missingFields(doc, fixture).includes('components[].hosts'));
});
