const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, chainStats } = require('../../../tools/lib/fit-harness/chains');

// A slide that fits with 25% spare when authored and overflows after one more member.
const facts = { orig: { fits: true, m20: true, m30: false }, add: { fits: false, m20: false, m30: false } };
const chain = ['orig', 'add', 'orig'];

test('h2030 leaves the slide split after the undo (it needs 30% spare to rejoin)', () => {
  assert.deepEqual(run('h2030', chain, facts, 'cold'), [true, false, false]);
});

test('fix C rejoins when the content returns to a size at which it last fit whole', () => {
  assert.deepEqual(run('h2030+C', chain, facts, 'cold'), [true, false, true]);
});

test('stateless decides fresh each step', () => {
  assert.deepEqual(run('stateless', chain, facts, 'cold'), [true, false, true]);
});

test('a slide typed live starts whole while it fits, without the 20% entry margin', () => {
  const tight = { orig: { fits: true, m20: false, m30: false } };
  assert.deepEqual(run('h2030', ['orig'], tight, 'live'), [true]);
  assert.deepEqual(run('h2030', ['orig'], tight, 'cold'), [false]);
});

test('fix C does not rejoin at a size larger than the one that last fit', () => {
  const f = { orig: { fits: true, m20: true, m30: false }, add: { fits: false, m20: false, m30: false }, longer: { fits: true, m20: false, m30: false } };
  assert.deepEqual(run('h2030+C', ['orig', 'add', 'longer'], f, 'cold'), [true, false, false]);
});

test('chainStats counts an undo strand under h2030 and none under fix C', () => {
  const g = (variant, how, m) => ({ arm: 'fit-greedy', src: 's', slide: 1, size: 'story', venue: 'hall', variant, how, margin: m });
  const st = (variant, n) => ({ arm: 'structural', src: 's', slide: 1, size: 'story', venue: 'hall', variant, pages: Array(n).fill({}) });
  const rows = [g('orig', 'fits', { 0.2: true, 0.3: false }), g('add', 'split', {}), st('orig', 5), st('add', 6)];
  const by = Object.fromEntries(chainStats(rows).map((s) => [`${s.policy}|${s.start}`, s]));
  assert.equal(by['h2030|cold'].undoStrands, 1);
  assert.equal(by['h2030+C|cold'].undoStrands, 0);
});
