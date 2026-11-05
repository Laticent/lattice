/**
 * Unit: tools/check-ownership.js `checkRunnerPins` — no workflow runs on a `-latest` image, and no platform suite names one
 * (owner call on #3034, 2026-11-05; engineering/decisions/2026-11-04-ci-flake-audit.md §6).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkRunnerPins } = require('../../../tools/check-ownership');

function fixture(workflow, suites) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-pins-'));
  fs.mkdirSync(path.join(dir, 'workflows'));
  fs.writeFileSync(path.join(dir, 'workflows', 'x.yml'), workflow);
  fs.writeFileSync(path.join(dir, 'suites.json'), JSON.stringify({ suites }));
  const errors = [];
  checkRunnerPins(errors, path.join(dir, 'workflows'), path.join(dir, 'suites.json'));
  fs.rmSync(dir, { recursive: true, force: true });
  return errors;
}

test('the tree as committed pins every runner', () => {
  const errors = [];
  checkRunnerPins(errors);
  assert.deepEqual(errors, []);
});

test('a runs-on that floats on -latest fails, for each OS', () => {
  for (const label of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    const errors = fixture(`jobs:\n  a:\n    runs-on: ${label}\n`, []);
    assert.equal(errors.length, 1, label);
    assert.match(errors[0], /x\.yml:3/);
  }
});

test('a named image passes, and a -latest in a comment is not a runner', () => {
  assert.deepEqual(fixture('jobs:\n  a:\n    runs-on: ubuntu-24.04 # was ubuntu-latest\n    # runs-on: ubuntu-latest\n', []), []);
});

test('a platform suite on a -latest image fails', () => {
  const errors = fixture('jobs: {}\n', [{ name: 's', os: ['macos-latest'] }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /suite "s"/);
});
