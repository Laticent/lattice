// The dead-code ratchet: tools/quality-assessment.js --only dead-code (owner's D1, 2026-11-20) and the
// knip.jsonc it reads. The knip run itself is exercised by the pre-push job; these pin the parts a
// typo would break without any run noticing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { deadCodeMetrics, parseKnipResult } = require('../../../tools/quality-assessment');

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'quality-assessment.js');

test('deadCodeMetrics maps each knip total to its baseline row', () => {
  const totals = { files: 1, exports: 2, types: 0, unusedDependencies: 3, unlistedDependencies: 4, binaries: 5, unresolved: 6 };
  assert.deepEqual(deadCodeMetrics({ totals }), {
    deadFiles: 1, deadExports: 2, unusedDependencies: 3, unlistedDependencies: 4, unlistedBinaries: 5, unresolvedImports: 6,
  });
});

test('every dead-code row has a committed baseline, so the pre-push check can compare it', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'quality', 'baseline.json'), 'utf8')).metrics;
  const totals = { files: 0, exports: 0, unusedDependencies: 0, unlistedDependencies: 0, binaries: 0, unresolved: 0 };
  for (const key of Object.keys(deadCodeMetrics({ totals }))) assert.equal(typeof baseline[key], 'number', key);
});

test('--only takes dead-code and nothing else', () => {
  const r = spawnSync(process.execPath, [TOOL, '--check', '--only', 'coupling'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--only accepts dead-code/);
});

test('knip.jsonc: every entry that names one file points at a file that exists', () => {
  const text = fs.readFileSync(path.join(ROOT, 'knip.jsonc'), 'utf8');
  // Strip // comments outside strings, the only JSONC feature the file uses.
  const json = text.split('\n').map((l) => l.replace(/^((?:[^"/]|"(?:\\.|[^"\\])*")*)\/\/.*$/, '$1')).join('\n');
  const config = JSON.parse(json);
  const plain = config.entry.filter((e) => !/[*{]/.test(e));
  assert.ok(plain.length > 5);
  for (const e of plain) assert.ok(fs.existsSync(path.join(ROOT, e)), `knip.jsonc entry ${e} does not exist`);
});

test('when knip cannot run, the ratchet fails instead of reading silence as zero issues', () => {
  assert.throws(() => parseKnipResult({ status: 2, stdout: '', stderr: 'Error: Cannot find module' }), /knip did not run \(exit 2\)/);
  assert.throws(() => parseKnipResult({ status: null, signal: 'SIGKILL', stdout: '' }), /knip did not run/);
  assert.throws(() => parseKnipResult({ status: 0, stdout: '' }), /no JSON report/);
  assert.throws(() => parseKnipResult({ status: 1, stdout: '{"files":[]}' }), /without an `issues` list/);
  assert.deepEqual(parseKnipResult({ status: 1, stdout: '{"issues":[]}' }), { issues: [] });
});
