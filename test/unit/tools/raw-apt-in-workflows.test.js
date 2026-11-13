/**
 * Unit: tools/check-ownership.js `checkRawAptInWorkflows` — no workflow step reads Ubuntu's package mirror itself; packages
 * go through .github/actions/apt-cached and browsers through .github/actions/playwright-browsers (owner call on #3139,
 * 2026-11-11, after a DNS failure on azure.archive.ubuntu.com failed five PRs' integration jobs; engineering/gotchas/ci.md).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkRawAptInWorkflows } = require('../../../tools/check-ownership');

function fixture(files, sanctions = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-apt-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  const errors = [];
  checkRawAptInWorkflows(errors, dir, sanctions);
  fs.rmSync(dir, { recursive: true, force: true });
  return errors;
}

test('the tree as committed reads the mirror only where sanctioned', () => {
  const errors = [];
  checkRawAptInWorkflows(errors);
  assert.deepEqual(errors, []);
});

test('each shape that reads the mirror fails, with its file and line', () => {
  const shapes = [
    'sudo apt-get update && sudo apt-get install -y poppler-utils',
    'sudo apt-get -qq install poppler-utils',
    'sudo apt install -y ghostscript',
    'apt-get download git',
    'npx playwright install --with-deps chromium',
    'npx playwright install chromium --with-deps',
    'npx playwright install-deps webkit',
    'sudo apt-get -o Acquire::Retries=3 install -y foo',
    'sudo -E apt-get -y install foo',
    'sudo aptitude install -y foo',
    'sudo apt-fast install -y foo',
    'sudo nala install foo',
    'echo "step #1" && sudo apt-get install -y foo',
    'npx playwright@1.56.1 install --with-deps chromium',
  ];
  for (const cmd of shapes) {
    const errors = fixture({ 'x.yml': `jobs:\n  a:\n    steps:\n      - run: ${cmd}\n` });
    assert.equal(errors.length, 1, cmd);
    assert.match(errors[0], /x\.yml:4/, cmd);
    assert.match(errors[0], /apt-cached/, cmd);
  }
});

test('the actions, a comment, and a browser-only install pass', () => {
  const body = [
    'jobs:',
    '  a:',
    '    steps:',
    '      - uses: ./.github/actions/apt-cached',
    '        with:',
    '          packages: poppler-utils',
    '      # sudo apt-get install -y poppler-utils',
    '      - run: npx playwright install chromium # not --with-deps: apt-cached has its packages',
    '      - run: echo "apt-cached handles it"',
    '',
  ].join('\n');
  assert.deepEqual(fixture({ 'x.yml': body }), []);
});

test('a command continued across lines with a backslash fails, at its first line', () => {
  const apt = 'jobs:\n  a:\n    steps:\n      - run: |\n          sudo apt-get \\\n            install -y foo\n';
  const pw = 'jobs:\n  a:\n    steps:\n      - run: |\n          npx playwright install chromium \\\n            --with-deps\n';
  for (const body of [apt, pw]) {
    const errors = fixture({ 'x.yml': body });
    assert.equal(errors.length, 1, body);
    assert.match(errors[0], /x\.yml:5/, body);
  }
});

test('prose about apt is not a command: a step name, an echo, a printf', () => {
  const body = [
    'jobs:',
    '  a:',
    '    steps:',
    '      - name: Skip apt-get update when the cache hit',
    '        run: echo "never run apt-get install here"',
    "      - run: printf '%s\\n' 'apt install is what apt-cached replaces'",
    '',
  ].join('\n');
  assert.deepEqual(fixture({ 'x.yml': body }), []);
});

test('a sanctioned file passes at its exact count, and fails above it', () => {
  const two = 'jobs:\n  a:\n    steps:\n      - run: apt-get update\n      - run: apt-get install -y git\n';
  const sanction = [{ file: 'x.yml', count: 2, why: 'test' }];
  assert.deepEqual(fixture({ 'x.yml': two }, sanction), []);
  const three = `${two}      - run: apt-get install -y gh\n`;
  const errors = fixture({ 'x.yml': three }, sanction);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sanctioned for 2 such line\(s\) and has 3/);
});

test('a sanction that outlives its lines, or its file, is stale', () => {
  const sanction = [{ file: 'x.yml', count: 2, why: 'test' }];
  const lower = fixture({ 'x.yml': 'jobs:\n  a:\n    steps:\n      - run: apt-get install -y git\n' }, sanction);
  assert.equal(lower.length, 1);
  assert.match(lower[0], /stale SANCTIONED_RAW_APT.*has 1/);
  const gone = fixture({ 'y.yml': 'jobs: {}\n' }, sanction);
  assert.equal(gone.length, 1);
  assert.match(gone[0], /x\.yml no longer exists/);
});
