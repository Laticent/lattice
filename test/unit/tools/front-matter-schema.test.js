// tools/build-front-matter-schema.js derives a JSON Schema from lib/core/deck-settings.js. Both
// arms: the decks we ship validate, and the §3.2 probes do not.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv/dist/2020');
const { buildSchema } = require('../../../tools/build-front-matter-schema.js');

const validate = new Ajv({ allErrors: true, strict: false }).compile(buildSchema());

test('a deck using registers, flags, a map and a plugin register validates', () => {
  const ok = validate({ marp: true, theme: 'cuoio', size: '4K', finish: 'halo', backdrop: 40, tag: 'plain band center', lift: 'on', paginate: true, lexicon: { SQL: 'sequel' }, icon: 'bare', plugins: ['icons'] });
  assert.ok(ok, JSON.stringify(validate.errors));
});

test('each probe is refused', () => {
  for (const bad of [{ finsh: 'halo' }, { themee: 'x' }, { size: 'huge' }, { lift: 'maybe' }, { tag: 'plain sideways' }]) {
    assert.equal(validate(bad), false, JSON.stringify(bad));
  }
});

test('theme: and finish: stay open for installed and saved ones, as the readers are', () => {
  assert.ok(validate({ theme: 'my-brand', finish: 'finish-my-saved' }));
});

// LFM 1.0 §2.1 and spec/EXTENDING-1.0.md §3–§4: the schema is the settings registry. A prefixed key belongs to a
// plugin and validates; an unprefixed unknown key still does not. Each key names its LFM part, and a retired key its
// replacement. Failing arms: drop `patternProperties` and the first test fails; drop `x-lattice-replacement` and the
// second fails.
test('a prefixed plugin key validates; a dotless or uppercase one does not', () => {
  assert.ok(validate({ theme: 'indaco', 'acme.tally': 3, 'acme.notes': { a: 1 } }), JSON.stringify(validate.errors));
  for (const bad of [{ acmetally: 3 }, { 'Acme.tally': 3 }, { 'a.b.c': 1 }]) assert.equal(validate(bad), false, JSON.stringify(bad));
});

test('every key names its LFM part, and every renamed key its replacement', () => {
  const schema = buildSchema();
  const parts = new Set(['core', 'presentation', 'notation', 'lens', 'timing', 'application']);
  for (const [key, prop] of Object.entries(schema.properties)) assert.ok(parts.has(prop['x-lattice-profile']), `${key}: ${prop['x-lattice-profile']}`);
  assert.equal(schema.properties.lfm['x-lattice-profile'], 'core');
  assert.equal(schema.properties.pace['x-lattice-profile'], 'timing');
  assert.equal(schema.properties.paginate['x-lattice-replacement'], 'pagination');
  assert.equal(schema.properties.fonts['x-lattice-replacement'], 'font-embedding');
  assert.equal(schema.properties.marks['x-lattice-replacement'], 'chart-finish color-intensity');
  assert.equal(schema.properties.say['x-lattice-replacement'], '@say');
});

// Lint reads the same pattern the registry publishes (lib/core/deck-settings.js PREFIXED_KEY), so the two cannot
// disagree. Failing arm: drop the dot from lint-core's key pattern and `a.b.c` goes unreported again.
test('lint: a well-formed prefixed key is quiet, a malformed one is unknown-key, and a repeat is duplicate-key', () => {
  const { lintText } = require('../../../lib/authoring/lint');
  const rules = (fm) => lintText(`---\n${fm}\n---\n\n# Hi\n`).filter((f) => f.rule === 'unknown-key' || f.rule === 'duplicate-key').map((f) => `${f.rule}:${f.classToken ?? ''}`);
  assert.deepEqual(rules('acme.tally: 3'), []);
  for (const bad of ['Acme.Tally', 'a.b.c', 'acme_x.y']) assert.deepEqual(rules(`${bad}: 3`), [`unknown-key:${bad}`]);
  assert.equal(rules('acme.tally: 1\nacme.tally: 2').filter((r) => r.startsWith('duplicate-key')).length, 1);
});
