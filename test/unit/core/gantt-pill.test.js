// lib/core/gantt-pill.js is the one reader the gantt transform, its narrator and lint share
// for what a task pill means (row 10 of the Segno note's grammar table).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readGanttPill } = require('../../../lib/core/gantt-pill.js');

test('a dependency is a named Segno item, one name or a list', () => {
  assert.deepEqual(readGanttPill('after=Design'), { kind: 'after', deps: ['Design'] });
  assert.deepEqual(readGanttPill('after=[Design, Build]'), { kind: 'after', deps: ['Design', 'Build'] });
  assert.deepEqual(readGanttPill('after="Plan, phase 2"'), { kind: 'after', deps: ['Plan, phase 2'] });
});

test('the retired `after:` spelling is no dependency — it reads as an unparseable span', () => {
  assert.deepEqual(readGanttPill('after: Design'), { kind: 'span', text: 'after: Design' });
});

test('flags and status words fold case; a quoted word is text, not a keyword', () => {
  assert.deepEqual(readGanttPill('Milestone'), { kind: 'milestone' });
  assert.deepEqual(readGanttPill('AT-RISK'), { kind: 'status', status: 'at-risk' });
  assert.deepEqual(readGanttPill('"done"'), { kind: 'span', text: '"done"' });
});

test('anything else is left to the span reader, and a broken or foreign item is null', () => {
  assert.deepEqual(readGanttPill('Q1..Q3'), { kind: 'span', text: 'Q1..Q3' });
  for (const t of ['', 'after=', 'before=Design', 'after=A, B', '~{1 2}']) assert.equal(readGanttPill(t), null, t);
});
