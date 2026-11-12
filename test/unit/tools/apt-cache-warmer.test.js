/**
 * Unit: tools/check-ownership.js `checkAptCacheWarmer` — apt-cache-warm.yml has one matrix row for every apt-cached and
 * playwright-browsers call in the other workflows, and no row without a call (followups.d 3139-p1, 2026-11-12). GitHub
 * scopes caches by branch, so a call no run on `main` warms misses on every new PR and reads Ubuntu's mirror
 * (engineering/gotchas/ci.md, the 2026-11-11 outage).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkAptCacheWarmer } = require('../../../tools/check-ownership');

const WARMER = `
jobs:
  apt:
    runs-on: \${{ matrix.runs-on }}
    strategy:
      matrix:
        include:
          - runs-on: ubuntu-24.04
            packages: poppler-utils imagemagick
  apt-container:
    container:
      image: \${{ matrix.container }}
    strategy:
      matrix:
        include:
          - runs-on: ubuntu-24.04
            container: img:1
            packages: gh
  browsers:
    strategy:
      matrix:
        include:
          - runs-on: ubuntu-24.04
            lockfile: docs
            browsers: chromium webkit
`;

const CALLS = `
jobs:
  a:
    runs-on: ubuntu-24.04
    steps:
      - uses: ./.github/actions/apt-cached
        with:
          packages: imagemagick poppler-utils
      - uses: ./.github/actions/playwright-browsers
        with:
          browsers: webkit chromium
  b:
    runs-on: ubuntu-24.04
    container:
      image: img:1
    steps:
      - uses: ./.github/actions/apt-cached
        with:
          packages: gh
`;

function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apt-warmer-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  const errors = [];
  checkAptCacheWarmer(errors, dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return errors;
}

test('the tree as committed warms every cached call, and nothing else', () => {
  const errors = [];
  checkAptCacheWarmer(errors);
  assert.deepEqual(errors, []);
});

test('rows match calls whatever the order of the list', () => {
  assert.deepEqual(run({ 'apt-cache-warm.yml': WARMER, 'ci.yml': CALLS }), []);
});

test('a call with no row fails, naming the file and job', () => {
  const extra = CALLS.replace('packages: gh', 'packages: gh git');
  const errors = run({ 'apt-cache-warm.yml': WARMER, 'ci.yml': extra });
  assert.ok(errors.some((e) => e.startsWith('.github/workflows/ci.yml job b: no row') && e.includes('gh git')), errors.join('\n'));
  // ...and the row for the old list is now stale.
  assert.ok(errors.some((e) => e.startsWith('stale row') && e.includes('| gh |')), errors.join('\n'));
});

test('the runner, the container and the Playwright folder are part of the match', () => {
  for (const [from, to] of [
    ['runs-on: ubuntu-24.04\n    steps', 'runs-on: ubuntu-22.04\n    steps'],
    ['image: img:1', 'image: img:2'],
    ['browsers: webkit chromium', 'browsers: webkit chromium\n          working-directory: .'],
  ]) {
    const errors = run({ 'apt-cache-warm.yml': WARMER, 'ci.yml': CALLS.replace(from, to) });
    assert.ok(errors.some((e) => e.includes('no row')), `${from} → ${to}: ${errors.join('\n')}`);
  }
});

test('a call spelled as an expression fails: its entry cannot be warmed', () => {
  const errors = run({ 'apt-cache-warm.yml': WARMER, 'ci.yml': `${CALLS}  c:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: ./.github/actions/apt-cached\n        with:\n          packages: \${{ matrix.p }}\n` });
  assert.ok(errors.some((e) => e.includes('job c') && e.includes('expression')), errors.join('\n'));
});

test('a missing warmer fails', () => {
  const errors = run({ 'ci.yml': CALLS });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /apt-cache-warm\.yml is missing/);
});

test('a duplicate row, or a container row in a host job, fails', () => {
  const dup = WARMER.replace('            packages: poppler-utils imagemagick\n', '            packages: poppler-utils imagemagick\n          - runs-on: ubuntu-24.04\n            packages: imagemagick poppler-utils\n');
  assert.ok(run({ 'apt-cache-warm.yml': dup, 'ci.yml': CALLS }).some((e) => e.startsWith('duplicate row')));
  const misplaced = WARMER.replace('            packages: poppler-utils imagemagick\n', '            packages: poppler-utils imagemagick\n          - runs-on: ubuntu-24.04\n            container: img:1\n            packages: gh\n');
  assert.ok(run({ 'apt-cache-warm.yml': misplaced, 'ci.yml': CALLS }).some((e) => e.includes('names a container but the job runs on the host')));
});

test('a trailing slash on the action path still counts as a call', () => {
  const errors = run({ 'apt-cache-warm.yml': WARMER, 'ci.yml': CALLS.replace('uses: ./.github/actions/apt-cached\n        with:\n          packages: gh', 'uses: ./.github/actions/apt-cached/\n        with:\n          packages: gh git') });
  assert.ok(errors.some((e) => e.includes('no row') && e.includes('gh git')), errors.join('\n'));
});
