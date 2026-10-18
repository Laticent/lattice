// The planner picks which platform suites a workflow run executes (tools/platform-suites-plan.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan, globToRegExp } = require('../../../tools/platform-suites-plan.js');

const registry = {
  suites: [
    { name: 'export-confine', os: ['macos-latest'], paths: ['lib/export/file-confine.js', 'test/unit/export/*.test.js'], run: 'a', why: 'w1' },
    { name: 'paths-everywhere', os: ['macos-latest', 'windows-latest'], paths: ['lib/**/*.js'], run: 'b', why: 'w2' },
  ],
};
const names = (r) => r.include.map((i) => `${i.suite}@${i.os}`);

test('the nightly runs every suite, one row per OS', () => {
  assert.deepEqual(names(plan(registry, { event: 'schedule' })), ['export-confine@macos-latest', 'paths-everywhere@macos-latest', 'paths-everywhere@windows-latest']);
});

test('a dispatch runs the suites it names, or all of them when it names none', () => {
  assert.deepEqual(names(plan(registry, { event: 'workflow_dispatch', suites: ['export-confine'] })), ['export-confine@macos-latest']);
  assert.equal(plan(registry, { event: 'workflow_dispatch' }).count, 3);
});

test('a pull request runs only the suites whose paths match a changed file', () => {
  assert.deepEqual(names(plan(registry, { event: 'pull_request', changed: ['lib/export/file-confine.js'] })), ['export-confine@macos-latest', 'paths-everywhere@macos-latest', 'paths-everywhere@windows-latest']);
  assert.deepEqual(names(plan(registry, { event: 'pull_request', changed: ['test/unit/export/a.test.js'] })), ['export-confine@macos-latest']);
  assert.equal(plan(registry, { event: 'pull_request', changed: ['README.md', 'docs/x.md'] }).count, 0, 'an unrelated PR selects nothing');
});

test('editing the registry, the planner or the workflow runs every suite on a pull request', () => {
  for (const f of ['.github/platform-suites.json', '.github/workflows/platform-suites.yml', 'tools/platform-suites-plan.js']) {
    assert.equal(plan(registry, { event: 'pull_request', changed: [f] }).count, 3, f);
  }
});

test('globs: * stays inside a segment, ** crosses them, dots are literal', () => {
  assert.ok(globToRegExp('lib/**/*.js').test('lib/a/b/c.js'));
  assert.ok(globToRegExp('lib/**/*.js').test('lib/c.js'));
  assert.ok(!globToRegExp('lib/*.js').test('lib/a/c.js'));
  assert.ok(!globToRegExp('a.js').test('axjs'));
  assert.ok(globToRegExp('a/**/b').test('a/b') && globToRegExp('a/**/b').test('a/x/y/b'));
  assert.ok(!globToRegExp('a/**/b').test('a/xb'), '**/ is whole directories');
  assert.ok(globToRegExp('a/?.js').test('a/x.js') && !globToRegExp('a/?.js').test('a/xy.js') && !globToRegExp('a/?.js').test('a//.js'), '? is one non-slash character');
});
