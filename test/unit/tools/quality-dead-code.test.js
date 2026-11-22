// The dead-code ratchet: tools/quality-assessment.js --only dead-code (owner's D1, 2026-11-20) and the
// knip.jsonc it reads. The knip run itself is exercised by the pre-push job; these pin the parts a
// typo would break without any run noticing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { deadCodeMetrics, parseKnipResult, tallyKnip, foldEngineManifest } = require('../../../tools/quality-assessment');

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'quality-assessment.js');

test('deadCodeMetrics maps each knip total to its baseline row', () => {
  const totals = { files: 1, exports: 2, types: 0, unusedDependencies: 3, unlistedDependencies: 4, binaries: 5, unresolved: 6, other: 7 };
  assert.deepEqual(deadCodeMetrics({ totals }), {
    deadFiles: 1, deadExports: 2, unusedDependencies: 3, unlistedDependencies: 4, unlistedBinaries: 5, unresolvedImports: 6, otherFindings: 7,
  });
});

test('every dead-code row has a committed baseline, so the pre-push check can compare it', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'quality', 'baseline.json'), 'utf8')).metrics;
  const totals = { files: 0, exports: 0, unusedDependencies: 0, unlistedDependencies: 0, binaries: 0, unresolved: 0, other: 0 };
  for (const key of Object.keys(deadCodeMetrics({ totals }))) assert.equal(typeof baseline[key], 'number', key);
});

test('--only takes dead-code and nothing else', () => {
  const r = spawnSync(process.execPath, [TOOL, '--check', '--only', 'coupling'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--only accepts dead-code/);
});

test('knip.jsonc: every entry that names one file points at a file that exists', () => {
  const text = fs.readFileSync(path.join(ROOT, 'knip.jsonc'), 'utf8');
  // Strip // comments outside strings and trailing commas: the JSONC features knip accepts.
  const json = text.split('\n').map((l) => l.replace(/^((?:[^"/]|"(?:\\.|[^"\\])*")*)\/\/.*$/, '$1')).join('\n').replace(/,(\s*[}\]])/g, '$1');
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

test('a knip category no row names (duplicates, a new one) still counts, and exit 1 with nothing counted fails', () => {
  const data = { issues: [{ file: 'a.js', duplicates: [[{ name: 'foo' }, { name: 'default' }]], someFutureCategory: [{ name: 'x' }] }] };
  assert.equal(tallyKnip(data, 1).other, 2);
  assert.throws(() => tallyKnip({ issues: [{ file: 'a.js', duplicates: [] }] }, 1), /exited 1 .* no field this tool counts/);
  assert.equal(tallyKnip({ issues: [] }, 0).other, 0);
});

// The engine's dependencies are declared in packages/lattice/package.json, and the code that imports
// them stays at the root (decision 2026-10-07-first-npm-release §8, option A). The fold credits one to
// the other, and must still leave the two real findings standing.
test('foldEngineManifest: root imports of engine dependencies are listed; undeclared and unloaded ones still count', (t) => {
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knip-fold-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'packages', 'lattice'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages', 'lattice', 'package.json'), JSON.stringify({
    dependencies: { jszip: '1', 'never-loaded': '1', '@laticent/lib': '1', puppeteer: '1' },
    optionalDependencies: { 'css-tree': '1' },
  }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, devDependencies: { puppeteer: '1' } }));
  fs.mkdirSync(path.join(root, 'node_modules', '@laticent'), { recursive: true });
  fs.mkdirSync(path.join(root, 'workspace-lib'));
  fs.symlinkSync(path.join(root, 'workspace-lib'), path.join(root, 'node_modules', '@laticent', 'lib'), 'junction');
  const report = {
    issues: [
      { file: 'lattice.js', unlisted: [{ name: 'jszip' }, { name: 'css-tree' }, { name: 'left-pad' }] },
      { file: 'packages/lattice/package.json', dependencies: [{ name: 'jszip' }, { name: 'never-loaded' }, { name: '@laticent/lib' }, { name: 'puppeteer' }] },
    ],
  };
  const totals = tallyKnip(foldEngineManifest(report, root), 0);
  assert.deepEqual(report.issues[0].unlisted.map((u) => u.name), ['left-pad'], 'an import nobody declares must stay unlisted');
  assert.deepEqual(report.issues[1].dependencies.map((d) => d.name), ['never-loaded'], 'an engine dependency nothing loads must stay unused');
  assert.equal(totals.unlistedDependencies, 1);
  assert.equal(totals.unusedDependencies, 1);
});

test('foldEngineManifest leaves a report alone where there is no publish folder', (t) => {
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knip-nofold-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = { issues: [{ file: 'a.js', unlisted: [{ name: 'jszip' }] }] };
  assert.equal(foldEngineManifest(report, root).issues[0].unlisted.length, 1);
});
