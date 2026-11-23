/**
 * The engine's publish folder (engineering/decisions/2026-10-07-first-npm-release.md §8, option A).
 *
 * The root `package.json` is a private workspace root; `packages/lattice/package.json` holds the
 * fields `@laticent/lattice` publishes, and `tools/stage-engine-package.js` (its `prepack`) puts the
 * shipped files beside it. These tests hold the split in place:
 *
 * - each published field lives in exactly one manifest, the engine's;
 * - the root's `$puppeteer` override still names the range the engine ships;
 * - the stager places every `files` entry (and the README npm adds from a packed folder), and
 *   cleans them all away again;
 * - .gitignore hides every staged entry and never the manifest;
 * - the CLI reads its version from the engine manifest in the repository.
 *
 * That the staged folder packs the SAME file set the root used to is the integration test
 * test/integration/export/installed-package.test.js, which installs from it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const stager = require('../../../tools/stage-engine-package.js');
const { engineManifestPath } = require('../../../lib/core/pkg-root.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const rootPkg = read('package.json');
const engine = read('packages/lattice/package.json');

const PUBLISHED = ['version', 'description', 'bin', 'main', 'exports', 'files', 'dependencies', 'optionalDependencies', 'engines', 'license', 'repository', 'homepage', 'bugs', 'keywords', 'author'];

test('the root is a private workspace root and the engine manifest carries every published field', () => {
  assert.equal(rootPkg.private, true, 'the root package.json must stay private: npm publish runs from packages/lattice/');
  assert.notEqual(rootPkg.name, '@laticent/lattice', 'two packages named @laticent/lattice in one workspace');
  assert.equal(engine.name, '@laticent/lattice');
  assert.ok(rootPkg.workspaces.includes('packages/lattice'), 'packages/lattice is not a workspace, so Changesets cannot see it');
  for (const field of PUBLISHED) {
    assert.ok(field in engine, `packages/lattice/package.json has no "${field}"`);
    // The root keeps a description of its own (what the repository root is), never the engine's.
    if (field === 'description') assert.notEqual(rootPkg.description, engine.description, 'the root carries the engine description');
    else assert.ok(!(field in rootPkg), `the root package.json still declares "${field}"; it belongs in packages/lattice/package.json only`);
  }
  for (const field of ['devDependencies', 'workspaces', 'overrides']) {
    assert.ok(!(field in engine), `packages/lattice/package.json declares "${field}", which stays at the root`);
  }
  assert.deepEqual(Object.keys(engine.scripts).sort(), ['postpack', 'prepack', 'prepublishOnly'], 'the publish folder carries only its pack lifecycle');
});

test("the root's $puppeteer override names the puppeteer range the engine ships", () => {
  // npm resolves `$puppeteer` against the ROOT's own dependencies, so the root keeps a devDependency
  // that must match the engine's dependency, or mermaid-cli gets a puppeteer the engine does not.
  assert.equal(rootPkg.overrides['@mermaid-js/mermaid-cli'].puppeteer, '$puppeteer');
  assert.equal(rootPkg.devDependencies.puppeteer, engine.dependencies.puppeteer, 'bump puppeteer in package.json and packages/lattice/package.json together');
});

test('stagedEntries reads the positive files entries and refuses one it cannot stage safely', () => {
  const entries = stager.stagedEntries();
  for (const e of ['lattice.js', 'lib', 'dist', 'themes', 'design/skill.md', 'README.md', 'LICENSE']) assert.ok(entries.includes(e), e);
  assert.ok(entries.every((e) => !e.startsWith('!')));
  assert.deepEqual(stager.stagedEntries({ files: ['./lib/', 'themes//'] }), ['lib', 'themes'], 'a ./ prefix or a doubled slash normalizes');
  for (const bad of ['lib/*.js', '../outside', '/abs', '/', './', '.', 'package.json', 'packages/', 'node_modules/x', 'lib/../..']) {
    assert.throws(() => stager.stagedEntries({ files: [bad] }), /cannot stage/, bad);
  }
});

test('stage places every shipped entry plus the README npm adds from a packed folder, and clean removes them', (t) => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-engine-'));
  t.after(() => fs.rmSync(dest, { recursive: true, force: true }));
  fs.copyFileSync(stager.MANIFEST, path.join(dest, 'package.json'));
  const entries = stager.stagedEntries();
  stager.stage(entries, dest);
  for (const e of entries) assert.ok(fs.existsSync(path.join(dest, e)), `${e} was not staged`);
  // design/skill.md is in `files`; npm also packs design/README.md from the folder it walks.
  assert.ok(fs.existsSync(path.join(dest, 'design', 'README.md')), 'design/README.md was not staged');
  assert.ok(!fs.existsSync(path.join(dest, 'design', 'concepts.md')), 'the stager copied a design/ file npm does not ship');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'core', 'pkg-root.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'lib', 'core', 'pkg-root.js'), 'utf8'));
  stager.clean(entries, dest);
  assert.deepEqual(fs.readdirSync(dest), ['package.json']);
});

test('.gitignore hides every staged entry and never the manifest', () => {
  const tops = [...new Set(stager.stagedEntries().map((e) => e.split('/')[0]))];
  const probe = tops.map((e) => `packages/lattice/${e}${fs.statSync(path.join(ROOT, e)).isDirectory() ? '/x' : ''}`);
  const ignored = execFileSync('git', ['check-ignore', '--no-index', ...probe], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(ignored.sort(), probe.sort(), 'a staged entry is not gitignored: add it to the packages/lattice block in .gitignore');
  assert.throws(() => execFileSync('git', ['check-ignore', '--no-index', 'packages/lattice/package.json'], { cwd: ROOT, stdio: 'ignore' }), 'packages/lattice/package.json is gitignored');
});

test('the version comes from the engine manifest in the repository, and from its own manifest installed', (t) => {
  assert.equal(engineManifestPath(ROOT), path.join(ROOT, 'packages', 'lattice', 'package.json'));
  const installed = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-manifest-'));
  t.after(() => fs.rmSync(installed, { recursive: true, force: true }));
  fs.writeFileSync(path.join(installed, 'package.json'), '{}');
  assert.equal(engineManifestPath(installed), path.join(installed, 'package.json'));
  const out = execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), '--version'], { encoding: 'utf8' }).trim();
  assert.equal(out, `lattice ${engine.version}`);
});
