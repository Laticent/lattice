
// Segno phase 2's plumbing: JSON slot specs compile to Segno slots (lib/core/segno-spec.js),
// and the core slots (lib/core/segno-slots.js) read the spellings the notation promises.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { compileSlot, compileType } = require('../../../lib/core/segno-spec.js');
const { coreSlot, componentSlot, CORE } = require('../../../lib/core/segno-slots.js');

const value = (slot, text) => {
  const r = slot.read(text);
  assert.ok(r.ok, `${text}: ${r.ok ? '' : r.diagnostics.map((d) => d.message).join('; ')}`);
  return r.value;
};
const code = (slot, text) => {
  const r = slot.read(text);
  return r.ok ? 'ok' : r.diagnostics[0].code;
};

describe('segno-spec: JSON → Segno slot', () => {
  test('every type compiles', () => {
    const slot = compileSlot({
      label: 'a test record',
      positional: [{ name: 'name', type: 'text' }],
      params: {
        stage: { type: 'oneOf', values: ['off', 'on'], aliases: { on: ['live'] } },
        color: { type: 'indexed', prefix: 'c', max: 8, label: 'a color' },
        when: { type: 'range', of: 'time' },
        id: 'id',
        hot: { type: 'flag', word: 'hot' },
        count: { type: 'number', named: true },
        tags: { type: 'list', of: 'text' },
      },
    });
    const v = value(slot, '{rollout, live, c3, Q1..Q3, #api, hot, count=4, [a, b]}');
    assert.equal(v.name, 'rollout');
    assert.equal(v.stage, 'on', 'an alias reads as its value');
    assert.equal(v.color, 3);
    assert.ok(v.when?.from && v.when.to, 'a time range has both ends');
    assert.equal(v.id, 'api');
    assert.equal(v.hot, true);
    assert.equal(v.count.value, 4);
    assert.deepEqual(v.tags, ['a', 'b']);
    assert.notEqual(code(slot, '{rollout, 4}'), 'ok', 'a named-only number takes no bare word');
  });
  test('a nested record type compiles', () => {
    const t = compileType({ type: 'record', positional: [{ name: 'x', type: 'number' }] }, 't');
    assert.equal(t.kind, 'record');
  });
  test('an unknown type names where it is', () => {
    assert.throws(() => compileSlot({ params: { a: { type: 'colour' } } }, 'gantt.segno.task'), /gantt\.segno\.task\.params\.a: unknown type "colour"/);
    assert.throws(() => compileSlot({ params: { a: 'colour' } }, 's'), /unknown type "colour"/);
  });
  test('a schema Segno refuses fails with the slot named', () => {
    assert.throws(
      () => compileSlot({ params: { a: 'number', b: 'number' } }, 'quadrant.segno.point'),
      /quadrant\.segno\.point: .*ambiguous/,
    );
  });
});

describe('core slots', () => {
  test('state marks are the six shortcuts and their words', () => {
    const state = coreSlot('state');
    const pairs = { '[x]': 'done', '[-]': 'partial', '[!]': 'fail', '[?]': 'unknown', '[ ]': 'todo', '[/]': 'skip' };
    for (const [token, word] of Object.entries(pairs)) {
      assert.equal(value(state, token).state, word, token);
      assert.equal(value(state, `{${word}}`).state, word, word);
    }
  });
  test('a pill reads its words in any order', () => {
    const pill = coreSlot('pill');
    const want = { value: 'BETA', shape: 'tag', color: 4 };
    assert.deepEqual(value(pill, '{BETA, tag, c4}'), want);
    assert.deepEqual(value(pill, '{BETA, c4, tag}'), want);
    assert.deepEqual(value(pill, '{BETA, shape=tag, color=c4}'), want);
  });
  test('a pill takes twelve colors and no more', () => {
    assert.equal(value(coreSlot('pill'), '{A, c12}').color, 12);
    assert.notEqual(code(coreSlot('pill'), '{A, c13}'), 'ok');
  });
  test('a spark needs its tag; a pill refuses one', () => {
    assert.equal(code(coreSlot('spark'), '{1 2 3}'), 'missing-tag');
    assert.equal(code(coreSlot('pill'), '~{BETA}'), 'unexpected-tag');
    assert.deepEqual(value(coreSlot('spark'), '~{3 5 -2 4, bar, c3, lg}'), { data: '3 5 -2 4', type: 'bar', color: 3, size: 'lg' });
  });
  test('slots are compiled once', () => {
    assert.equal(coreSlot('pill'), coreSlot('pill'));
  });
  test('an unknown core slot throws; an undeclared component slot is null', () => {
    assert.throws(() => coreSlot('nope'), /no core slot "nope"/);
    assert.equal(componentSlot('no-such-component', 'x'), null);
  });
  test('every core spec compiles', () => {
    for (const name of Object.keys(CORE)) assert.ok(coreSlot(name));
  });
});
