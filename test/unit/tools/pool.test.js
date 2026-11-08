/**
 * Unit: tools/lib/pool.js — the bounded-concurrency helper behind the parallel golden check
 * and the nightly bless's first renders.
 *
 * Each arm pins one promise a caller leans on: results stay in input order whatever order the
 * calls finish in; no more than `jobs` calls are ever in flight; `stop()` stops NEW starts but
 * lets the calls in flight finish, and reports the rest as `left`. Completion order is driven by
 * hand-resolved promises, never by a timer (HARD RULE #32).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pool, defaultJobs } = require('../../../tools/lib/pool');

// A call that finishes only when the test says so.
function gated() {
  const calls = [];
  const fn = (item) => new Promise((resolve) => { calls.push({ item, resolve }); });
  return { calls, fn };
}
const tick = () => new Promise((r) => setImmediate(r));

test('results line up with the input even when calls finish out of order', async () => {
  const { calls, fn } = gated();
  const run = pool(['a', 'b', 'c'], 3, fn);
  await tick();
  assert.deepEqual(calls.map((c) => c.item), ['a', 'b', 'c']);
  calls[2].resolve('C');
  calls[0].resolve('A');
  calls[1].resolve('B');
  assert.deepEqual(await run, { results: ['A', 'B', 'C'], done: ['a', 'b', 'c'], left: [] });
});

test('never more than `jobs` calls in flight, and the next item starts as one finishes', async () => {
  const { calls, fn } = gated();
  const run = pool([1, 2, 3, 4, 5], 2, fn);
  await tick();
  assert.deepEqual(calls.map((c) => c.item), [1, 2]);
  calls[1].resolve();
  await tick();
  assert.deepEqual(calls.map((c) => c.item), [1, 2, 3]);
  for (let k = 0; k < 5; k++) {
    await tick();
    calls[k]?.resolve();
  }
  const r = await run;
  assert.equal(calls.length, 5);
  assert.deepEqual(r.left, []);
});

test('the running maximum in flight never passes `jobs`', async () => {
  let live = 0;
  let peak = 0;
  const { calls, fn } = gated();
  const tracked = (item) => { live++; peak = Math.max(peak, live); return fn(item).then(() => { live--; }); };
  const run = pool([1, 2, 3, 4, 5, 6, 7], 3, tracked);
  for (let k = 0; k < 7; k++) {
    await tick();
    calls[k].resolve();
  }
  await run;
  assert.equal(peak, 3);
});

test('stop() ends new starts; calls in flight finish; the rest come back as left, in order', async () => {
  const { calls, fn } = gated();
  let stopped = false;
  const run = pool(['a', 'b', 'c', 'd'], 2, fn, { stop: () => stopped });
  await tick();
  stopped = true;
  calls[0].resolve('A');
  calls[1].resolve('B');
  const r = await run;
  assert.deepEqual(calls.map((c) => c.item), ['a', 'b']);
  assert.deepEqual(r.done, ['a', 'b']);
  assert.deepEqual(r.left, ['c', 'd']);
  assert.deepEqual(r.results.slice(0, 2), ['A', 'B']);
});

test('a stop that is already true starts nothing', async () => {
  const r = await pool(['a', 'b'], 4, () => { throw new Error('started past the stop'); }, { stop: () => true });
  assert.deepEqual(r, { results: [undefined, undefined], done: [], left: ['a', 'b'] });
});

test('an empty list, a jobs of 0 and a fractional jobs all still behave', async () => {
  assert.deepEqual(await pool([], 4, () => 1), { results: [], done: [], left: [] });
  assert.deepEqual((await pool(['x', 'y'], 0, (v) => v.toUpperCase())).results, ['X', 'Y']);
  assert.deepEqual((await pool(['x', 'y'], 1.7, (v) => v)).results, ['x', 'y']);
});

test('a throw rejects the whole call, like Promise.all', async () => {
  await assert.rejects(pool(['a'], 1, () => { throw new Error('boom'); }), /boom/);
});

test('defaultJobs is a whole number of at least 1', () => {
  const n = defaultJobs();
  assert.ok(Number.isInteger(n) && n >= 1);
});
