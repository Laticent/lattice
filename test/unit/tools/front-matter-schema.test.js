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
