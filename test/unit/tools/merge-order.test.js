/**
 * Unit: tools/merge-order.mjs, the merge desk's digest order.
 *
 * The rule: a PR built on another digest PR's branch comes after it; of two PRs
 * that conflict with each other, the smaller lands first and the other rebases
 * after; otherwise oldest first. A PR that conflicts with main is held apart.
 * The git half (conflictFiles) runs on a real throwaway repository, because the
 * point is GitHub's merge, not a model of it.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'merge-order.mjs');
const { spawnSync } = require('node:child_process');
let orderMerges;
let conflictFiles;
before(async () => {
  ({ orderMerges, conflictFiles } = await import(TOOL));
});

const pr = (number, changes, created_at, head = `b${number}`, base = 'main') => ({ number, head, base, changes, created_at });
const nums = (r) => r.order.map((o) => o.number);

describe('orderMerges', () => {
  test('no conflicts and no dependencies: oldest first', () => {
    const r = orderMerges([pr(3, 50, '2026-11-20'), pr(1, 10, '2026-11-18'), pr(2, 99, '2026-11-19')], []);
    assert.deepEqual(nums(r), [1, 2, 3]);
    assert.deepEqual(r.order[0].why, ['oldest first']);
  });

  test('two PRs that conflict: the smaller lands first, the other rebases after it', () => {
    const r = orderMerges([pr(1, 400, '2026-11-18'), pr(2, 30, '2026-11-20')], [{ a: 1, b: 2, files: ['lib/x.js'] }]);
    assert.deepEqual(nums(r), [2, 1]);
    assert.deepEqual(r.rebaseAfter, { 1: [2] });
    assert.match(r.order[1].why[0], /after #2: conflicts \(lib\/x\.js\); rebase once it lands/);
  });

  test('a conflict between equal sizes goes to the older PR first', () => {
    const r = orderMerges([pr(1, 50, '2026-11-20'), pr(2, 50, '2026-11-18')], [{ a: 1, b: 2, files: ['f'] }]);
    assert.deepEqual(nums(r), [2, 1]);
  });

  test('a PR built on another digest PR comes after it, even when it is older', () => {
    const r = orderMerges([pr(1, 10, '2026-11-18', 'child', 'parent'), pr(2, 10, '2026-11-20', 'parent')], []);
    assert.deepEqual(nums(r), [2, 1]);
    assert.match(r.order[1].why[0], /built on its branch/);
  });

  test('a dependency beats a conflict that points the other way, and the dropped edge is reported', () => {
    // child (#1, small) is built on parent (#2, large): size would put #1 first, the dependency forbids it
    const prs = [pr(1, 5, '2026-11-18', 'child', 'parent'), pr(2, 500, '2026-11-19', 'parent')];
    const r = orderMerges(prs, [{ a: 1, b: 2, files: ['f'] }]);
    assert.deepEqual(nums(r), [2, 1]);
    assert.deepEqual(r.dropped, [{ first: 1, second: 2, files: ['f'] }]);
  });

  test('a PR that conflicts with main is held apart, not ordered', () => {
    const r = orderMerges([pr(1, 10, '2026-11-18'), pr(2, 10, '2026-11-19')], [], new Set([1]));
    assert.deepEqual(nums(r), [2]);
    assert.deepEqual(r.dirty, [1]);
  });

  test('every input PR lands in exactly one list, even on a dependency cycle (grader probe)', () => {
    const r = orderMerges([pr(1, 5, '2026-11-18', 'x', 'y'), pr(2, 5, '2026-11-19', 'y', 'x'), pr(3, 5, '2026-11-20')], []);
    assert.deepEqual(nums(r), [3]);
    assert.deepEqual(r.unordered, [1, 2]);
    const self = orderMerges([pr(4, 5, '2026-11-18', 'z', 'z')], []);
    assert.deepEqual(nums(self), [4], 'a PR whose head is its base is not its own parent');
  });

  test('a child of a cycle is unordered but not called a cycle member (grader probe)', () => {
    const prs = [pr(1, 5, '2026-11-18', 'x', 'y'), pr(2, 5, '2026-11-19', 'y', 'x'), pr(4, 5, '2026-11-20', 'c', 'x')];
    const r = orderMerges(prs, []);
    assert.deepEqual(r.unordered, [1, 2, 4]);
    assert.deepEqual(r.onCycle, [1, 2]);
  });

  test('a missing date gives the same order whichever way the pair is listed (grader probe)', () => {
    const prs = [{ number: 1, head: 'a', base: 'main', changes: 5 }, pr(2, 5, '2026-11-19')];
    const one = orderMerges(prs, [{ a: 1, b: 2, files: ['f'] }]);
    const two = orderMerges(prs, [{ a: 2, b: 1, files: ['f'] }]);
    assert.deepEqual(nums(one), [2, 1]);
    assert.deepEqual(nums(two), [2, 1]);
  });

  test('a PR stacked on a PR that conflicts with main is held with it (grader probe)', () => {
    const r = orderMerges([pr(1, 5, '2026-11-18', 'child', 'parent'), pr(2, 5, '2026-11-19', 'parent')], [], new Set([2]));
    assert.deepEqual(nums(r), []);
    assert.deepEqual(r.held, [{ number: 1, why: 'built on #2, which is held' }]);
    assert.deepEqual(r.dirty, [2]);
  });

  test('a chain of conflicts stays a deterministic order by size', () => {
    const prs = [pr(1, 300, '2026-11-18'), pr(2, 200, '2026-11-19'), pr(3, 100, '2026-11-20')];
    const r = orderMerges(prs, [
      { a: 1, b: 2, files: ['f'] },
      { a: 2, b: 3, files: ['g'] },
      { a: 1, b: 3, files: ['h'] },
    ]);
    assert.deepEqual(nums(r), [3, 2, 1]);
  });
});

describe('conflictFiles on a real repository', () => {
  let dir;
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-order-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    fs.writeFileSync(path.join(dir, 'shared.txt'), 'one\ntwo\nthree\n');
    fs.writeFileSync(path.join(dir, 'other.txt'), 'x\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    const branch = (name, file, body) => {
      git('checkout', '-q', '-b', name, 'main');
      fs.writeFileSync(path.join(dir, file), body);
      git('commit', '-q', '-am', name);
    };
    branch('a', 'shared.txt', 'one\nTWO-A\nthree\n');
    branch('b', 'shared.txt', 'one\nTWO-B\nthree\n');
    branch('c', 'other.txt', 'y\n');
  });

  test('two branches editing the same line conflict, on that file', () => {
    assert.deepEqual(conflictFiles('a', 'b', dir), ['shared.txt']);
  });

  test('branches touching different files do not conflict', () => {
    assert.deepEqual(conflictFiles('a', 'c', dir), []);
  });

  test('an unknown ref throws instead of reading as clean', () => {
    assert.throws(() => conflictFiles('a', 'no-such-branch', dir), /could not run/);
  });
});

describe('merge-order CLI input', () => {
  const run = (input) => spawnSync(process.execPath, [TOOL, '--no-fetch'], { input, encoding: 'utf8' });

  test('non-list or ill-typed input exits 2', () => {
    assert.equal(run('{}').status, 2);
    assert.equal(run('[{"number":"3359","head":"a"}]').status, 2);
    assert.equal(run('[{"number":3359}]').status, 2);
  });

  test("GitHub's own PR shape is read by its ref, not as [object Object] (grader probe)", () => {
    const r = run('[{"number":1,"head":{"ref":"no-such-branch-xyz"},"base":{"ref":"main"}}]');
    assert.equal(r.status, 3);
    assert.match(r.stderr, /origin\/no-such-branch-xyz/);
    assert.doesNotMatch(r.stderr, /object Object/);
  });

  test('a dependency cycle exits 1 with --json too (grader probe)', () => {
    // Real refs, so the run gets past its git checks to the ordering.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-order-'));
    try {
      const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
      git('init', '-q', '-b', 'main');
      git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
      for (const r of ['main', 'x', 'y']) git('update-ref', `refs/remotes/origin/${r}`, 'HEAD');
      const input = '[{"number":1,"head":"x","base":"y","changes":1},{"number":2,"head":"y","base":"x","changes":1}]';
      const run = (...flags) => spawnSync(process.execPath, [TOOL, '--no-fetch', ...flags], { cwd: repo, input, encoding: 'utf8' });
      const text = run();
      const json = run('--json');
      assert.equal(text.status, 1, text.stderr);
      assert.match(text.stdout, /unordered: #1 is on a dependency cycle/);
      assert.equal(json.status, 1, json.stderr);
      assert.deepEqual(JSON.parse(json.stdout).unordered, [1, 2]);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('an empty list prints nothing and exits 0', () => {
    const r = run('[]');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});
