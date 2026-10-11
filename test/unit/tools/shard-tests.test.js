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

describe('shard-tests CLI guards', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const tool = path.resolve(__dirname, '../../../tools/shard-tests.js');
  // NODE_TEST_CONTEXT marks a process as a child of an outer `node --test`; inherited, it would make
  // the inner run report to the parent instead of exiting non-zero on a red test.
  const cleanEnv = () => { const e = { ...process.env, SHARD: '' }; delete e.NODE_TEST_CONTEXT; return e; };
  const run = (cwd, args, env = {}) =>
    spawnSync(process.execPath, [tool, '--weights', 'w.json', ...args], { cwd, encoding: 'utf8', env: { ...cleanEnv(), ...env } });
  const withDir = (fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shard-cli-'));
    try {
      fs.writeFileSync(path.join(dir, 'x.test.js'), "require('node:test')('x', () => {});\n");
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it('an empty leg runs nothing instead of letting node discover every test under the cwd', () => {
    withDir((dir) => {
      const r = run(dir, ['x.test.js'], { SHARD: '2/2' });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /nothing to run/);
      assert.doesNotMatch(r.stdout, /# tests/);
    });
  });

  it('a malformed SHARD fails loudly instead of silently running everything', () => {
    withDir((dir) => {
      const r = run(dir, ['x.test.js'], { SHARD: 'abc' });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /not K\/N/);
    });
  });

  it('a red test makes the leg exit non-zero', () => {
    withDir((dir) => {
      fs.writeFileSync(path.join(dir, 'bad.test.js'), "require('node:test')('bad', () => { throw new Error('x'); });\n");
      assert.notEqual(run(dir, ['bad.test.js']).status, 0);
    });
  });
});
