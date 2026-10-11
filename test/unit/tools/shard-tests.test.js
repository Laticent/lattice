/**
 * Unit: tools/shard-tests.js deals test files into time-balanced shards.
 * Pure over (files, weights, n), so no test here runs `node --test` or reads the repo's weights.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { plan, parseShard } = require('../../../tools/shard-tests.js');

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const weights = { a: 100, b: 60, c: 50, d: 40, e: 10, f: 10, g: 5 };

describe('shard-tests plan', () => {
  it('puts every file in exactly one shard', () => {
    const bins = plan(files, weights, 3);
    assert.deepEqual(bins.flatMap((b) => b.files).sort(), [...files].sort());
  });

  it('is deterministic, so every CI leg computes the same plan', () => {
    assert.deepEqual(plan(files, weights, 4), plan([...files].reverse(), weights, 4));
  });

  it('balances by weight, not by count: the heaviest file does not share a shard with the next heaviest', () => {
    const bins = plan(files, weights, 2);
    const heavy = bins.find((b) => b.files.includes('a'));
    assert.ok(!heavy.files.includes('b'));
    assert.ok(Math.max(...bins.map((b) => b.load)) <= 160, JSON.stringify(bins));
  });

  it('never leaves the slowest shard far above the mean on a skewed set', () => {
    const skew = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, i < 4 ? 300 : 20]));
    const bins = plan(Object.keys(skew), skew, 4);
    const mean = bins.reduce((s, b) => s + b.load, 0) / 4;
    assert.ok(Math.max(...bins.map((b) => b.load)) / mean < 1.1);
  });

  it('gives an unweighted file the median weight instead of dropping it', () => {
    const bins = plan(['a', 'new'], { a: 10, b: 30, c: 20 }, 2);
    assert.deepEqual(bins.flatMap((b) => b.files).sort(), ['a', 'new']);
    assert.equal(bins.reduce((s, b) => s + b.load, 0), 10 + 20);
  });

  it('copes with no weights at all', () => {
    assert.deepEqual(plan(['x', 'y'], {}, 2).flatMap((b) => b.files).sort(), ['x', 'y']);
  });
});

describe('shard-tests parseShard', () => {
  it('reads K/N', () => assert.deepEqual(parseShard('2/4'), { k: 2, n: 4 }));
  it('returns null for no spec', () => assert.equal(parseShard(undefined), null));
  it('rejects K outside 1..N', () => {
    assert.throws(() => parseShard('0/4'));
    assert.throws(() => parseShard('5/4'));
  });
});

describe('shard-tests wiring', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { scripts } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
  const globs = (cmd) => [...cmd.matchAll(/'([^']+\*[^']*)'/g)].map((m) => m[1]).sort();

  it('shards exactly the globs test:integration:pr runs, so the two cannot drift', () => {
    const pr = globs(scripts['test:integration:pr']);
    assert.ok(pr.length >= 3);
    assert.deepEqual(globs(scripts['test:integration:shard']), pr);
  });
});
