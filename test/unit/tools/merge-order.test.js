/**
 * Unit: tools/merge-order.mjs, the merge desk's digest order.
 *
 * The rule: a PR built on another digest PR's branch comes after it; of two PRs
 * that conflict with each other, the smaller lands first and the other rebases
 * after; otherwise oldest first. A PR that conflicts with main is held apart.
 * The git half (conflictFiles) runs on a real throwaway repository, because the
 * point is GitHub's merge, not a model of it.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'merge-order.mjs');
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
