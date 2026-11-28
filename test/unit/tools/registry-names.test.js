// EXTENDING §3: a registry entry is retired (deprecated) in a minor and removed only in a major. This holds the built
// registries to every name 1.0 listed (spec/conformance/registry/1.0.json), so an entry cannot disappear silently, and
// checks that each registry states its version and each entry its `since`.
// Failing arm: delete a row from lib/core/deck-settings.js (or a component) and its name is reported as removed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSchema } = require('../../../tools/build-front-matter-schema');

const ROOT = path.join(__dirname, '../../..');
const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/conformance/registry/1.0.json'), 'utf8'));
const schema = buildSchema();
const grammarFile = path.join(ROOT, 'dist/docs/grammar.json');
const skip = !fs.existsSync(grammarFile) && 'dist/ not built';

test('every front-matter key and record field 1.0 listed is still in the registry', () => {
  const gone = [
    ...v1.frontMatterKeys.filter((k) => !Object.hasOwn(schema.properties, k)).map((k) => `front-matter key ${k}`),
    ...v1.recordFields.filter((k) => !Object.hasOwn(schema['x-lattice-record-fields'], k)).map((k) => `record field ${k}`),
  ];
  assert.deepEqual(gone, [], 'Removing a registry entry is a major version (EXTENDING §3): retire it with `deprecated` instead.');
});

test('every component 1.0 listed is still in grammar.json', { skip }, () => {
  const grammar = JSON.parse(fs.readFileSync(grammarFile, 'utf8'));
  const names = new Set(grammar.components.map((c) => c.name));
  assert.deepEqual(v1.components.filter((n) => !names.has(n)), [], 'Removing a component is a major version (EXTENDING §3).');
  assert.equal(grammar.version, '1.0');
  // LFM §4.1 cites the modifier prefix families from the component registry, not from lint-core's source.
  const components = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/docs/components.json'), 'utf8'));
  assert.ok(components.vocabularies.modifierPrefixes.includes('tint-'));
  for (const c of grammar.components) assert.match(c.since, /^\d+\.\d+$/, `${c.name} has no since`);
});

test('the settings registry states its version, and each entry its since; a retired one when it was retired', () => {
  assert.equal(schema['x-lattice-version'], '1.0');
  for (const [k, p] of Object.entries(schema.properties)) {
    assert.match(p['x-lattice-since'] || '', /^\d+\.\d+$/, `${k} has no since`);
    if (p.deprecated) assert.match(p['x-lattice-deprecated'] || '', /^\d+\.\d+$/, `${k} is retired with no version`);
  }
  for (const [k, p] of Object.entries(schema['x-lattice-record-fields'])) assert.match(p['x-lattice-since'], /^\d+\.\d+$/, k);
});

// RECORD_ONLY_FIELDS is a hand list in tools/build-front-matter-schema.js; this keeps it whole. Every field the meta
// plugin declares, and every class field the record door reads, is a front-matter key or a listed record field.
test('every record field the engine reads is in the registry', async () => {
  const { META_FIELDS } = await import('../../../lib/plugins/meta.generated.mjs');
  const { CLASS_FIELDS } = await import('../../../lib/core/meta-door.mjs');
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const listed = (k) => Object.hasOwn(schema.properties, k) || Object.hasOwn(schema['x-lattice-record-fields'], kebab(k));
  assert.deepEqual([...Object.keys(META_FIELDS), ...CLASS_FIELDS, 'carry', 'pane', 'panes'].filter((k) => !listed(k)), []);
});
