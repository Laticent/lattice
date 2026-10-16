/**
 * What a zip inline kind is handed as `fields` (spec/LPM.md §3.3.1, followups.d/2687-p5): the value the record
 * reader reads a span to, through the JSON round trip both doors make (lib/packages/code-door.js and
 * docs/src/lib/code-packages/door-run.ts `inlineFields`). Each span reads through BOTH readers those doors use, the
 * CLI's CommonJS build and the Studio's ESM one, so a reader change that moves a span's `fields` fails here before it
 * reaches a plugin. From the freeze on (LPM §3.3.1), a span that reads keeps its `fields`; a change may only make a span
 * that did not read, read. Changing a row that reads is a `**Breaking:**` LPM §12 entry. #2686's reader is planned to
 * move the rows marked #2686 below.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compileSlot } = require('../../../lib/core/segno-spec.js');
const { specCompiler } = require('../../../lib/core/segno-spec-core.js');

// One slot with every field type the spec compiler takes (lib/core/segno-spec-core.js).
const SLOT = {
  positional: [
    { name: 'label', type: 'text' },
    { name: 'value', type: 'number' },
  ],
  params: {
    tags: { type: 'list', of: 'text' },
    when: 'time',
    tone: { type: 'oneOf', values: ['hot', 'cold'], aliases: { hot: ['warm'] } },
    done: { type: 'flag', word: 'done' },
    who: { type: 'id' },
    color: { type: 'indexed', prefix: 'c', max: 8 },
    span: { type: 'range', of: 'time' },
    at: { type: 'record', positional: [{ name: 'x', type: 'number' }] },
  },
};
const N = (value, signed = false, unit = '') => ({ value, signed, unit });

// [record as the author typed it, the `fields` it is handed (null: it does not read, so the span is not drawn)]
const ROWS = [
  ['{Q3}', { label: 'Q3' }],
  ['{Q3 , 12K}', { label: 'Q3', value: { value: 12000, signed: false, unit: '' } }],
  // Text keeps its inner spacing; only the ends are trimmed.
  ['{Big  deal , 3}', { label: 'Big  deal', value: { value: 3, signed: false, unit: '' } }],
  // A record opens directly on its first value.
  ['{ Q3, 12K}', null],
  ['{Q3, -4.5}', { label: 'Q3', value: { value: -4.5, signed: true, unit: '' } }],
  ['{Q3, +3}', { label: 'Q3', value: { value: 3, signed: true, unit: '' } }],
  ['{Q3, 42%}', { label: 'Q3', value: { value: 42, signed: false, unit: '%' } }],
  ['{Q3, $1.2M}', { label: 'Q3', value: { value: 1200000, signed: false, unit: '' } }],
  ['{Q3, 1 234 567}', { label: 'Q3', value: { value: 1234567, signed: false, unit: '' } }],
  ['{Q3, 3, when=2026-03-15}', { label: 'Q3', value: { value: 3, signed: false, unit: '' }, when: { kind: 'date', day: 20527 } }],
  [
    '{Q3, 12K, tags=[a, b], when=2026 Q1, tone=warm, done, who=#ana}',
    { label: 'Q3', value: { value: 12000, signed: false, unit: '' }, tags: ['a', 'b'], when: { kind: 'q', year: 2026, idx: 0 }, tone: 'hot', done: true, who: 'ana' },
  ],
  ['{Q3, (5)}', { label: 'Q3', value: N(-5, true) }],
  ['{Q3, 5kg}', { label: 'Q3', value: N(5, false, 'kg') }],
  ['{Q3, 5‰}', { label: 'Q3', value: N(5, false, '‰') }],
  ['{Q3, 3, when=Q3}', { label: 'Q3', value: N(3), when: { kind: 'q', year: null, idx: 2 } }],
  ['{Q3, 3, when=Jan}', { label: 'Q3', value: N(3), when: { kind: 'm', year: null, idx: 0 } }],
  ['{Q3, 3, when=2026 Jan}', { label: 'Q3', value: N(3), when: { kind: 'm', year: 2026, idx: 0 } }],
  ['{Q3, 3, color=c3}', { label: 'Q3', value: N(3), color: 3 }],
  ['{Q3, 3, span=2026 Q1..2026 Q3}', { label: 'Q3', value: N(3), span: { from: { kind: 'q', year: 2026, idx: 0 }, to: { kind: 'q', year: 2026, idx: 2 } } }],
  ['{Q3, 3, at={4}}', { label: 'Q3', value: N(3), at: { x: N(4) } }],
  // #2686: a record that opens with `>` becomes a description (uniform-model §9); today it is text.
  ['{>a}', { label: '>a' }],
  ['{> a note}', { label: '> a note' }],
  // #2686: phase 4 retires the old spellings; a dot-grouped number reads today.
  ['{Q3, 1.234.567}', { label: 'Q3', value: N(1234567) }],
  // Inside a record a comma is the separator, never part of a number: these do not read, today and after #2686.
  ['{Q3, 12,000}', null],
  ['{Q3, 1,25M}', null],
  // `>` after the first item is not a number, so this does not read today.
  ['{Q3, > a note}', null],
  ['{Q3, 7, tone=lukewarm}', null],
];

// What each door does with a read: `fields` is the value as plain data, or null.
const fieldsOf = (slot, record) => {
  const read = slot.read(record);
  return read.ok && read.value && typeof read.value === 'object' ? JSON.parse(JSON.stringify(read.value)) : null;
};

test('a zip kind is handed the same `fields` by the CLI reader as LPM §3.3.1 documents', () => {
  const slot = compileSlot(SLOT, 'contract');
  for (const [record, want] of ROWS) assert.deepEqual(fieldsOf(slot, record), want, record);
});

test("the Studio's ESM reader hands the same `fields` as the CLI's", async () => {
  const S = await import('@laticent/segno/read');
  const esm = specCompiler(S).compileSlot(SLOT, 'contract');
  const cjs = compileSlot(SLOT, 'contract');
  for (const [record] of ROWS) assert.deepEqual(fieldsOf(esm, record), fieldsOf(cjs, record), record);
});

test('an optional field left out is absent, never null', () => {
  const got = fieldsOf(compileSlot(SLOT, 'contract'), '{Q3}');
  for (const k of ['value', 'tags', 'when', 'tone', 'done', 'who', 'color', 'span', 'at']) assert.equal(k in got, false, k);
});
