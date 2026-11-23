/**
 * The Changesets release, end to end on a fixture workspace, with the REAL `changeset version`.
 *
 * Holds the three constraints the 1.0.0 brief set (issue #3449, decision
 * 2026-10-07-first-npm-release §11):
 *   1. A PR that carries a `changelog.d/` fragment needs no change: the release converts it.
 *   2. The first release ships the engine at 1.0.0 and each library at 0.1.0, not 2.0.0.
 *   3. Nothing reaches npm while the August `v1.0.0` tag still exists.
 *
 * No network (HARD RULE #32): the npm lookup is a stub, and `npm install --package-lock-only`
 * is switched off (`lock: false`). Each test builds its own folder and git repository.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const release = require('../../../tools/release.js');
const { PUBLISH_SET, IGNORED, ENGINE, publishSetProblems } = require('../../../tools/release-packages.js');
const { changesetProblems } = require('../../../tools/changesets.js');
const { fragmentProblems } = require('../../../tools/changelog.js');

const short = (name) => name.replace('@laticent/', '');
const dirOf = (name) => (name === ENGINE ? 'packages/lattice' : `libs/${short(name)}`);

/**
 * A workspace shaped like this repository: all thirteen publish-set packages and the six held
 * back, the real `.changeset/config.json` (its formatter path made absolute), `changelog.d/` and
 * `.changeset/` with their READMEs, the archive, and the curated 1.0.0 notes.
 */
function fixture(t, { engineVersion = '1.0.0', privateLibs = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changesets-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const all = [...PUBLISH_SET, ...IGNORED];
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write('package.json', JSON.stringify({ name: 'fixture-root', private: true, workspaces: all.map(dirOf) }, null, 2));
  // manypkg (Changesets' workspace reader) recognizes an npm workspace by its lockfile.
  write('package-lock.json', JSON.stringify({ name: 'fixture-root', lockfileVersion: 3, requires: true, packages: {} }));
  for (const name of all) {
    const pkg = { name, version: name === ENGINE ? engineVersion : '0.1.0' };
    if (privateLibs.includes(name)) pkg.private = true;
    if (name === '@laticent/cadenza') pkg.dependencies = { '@laticent/ltt': '^0.1.0' };
    if (name === ENGINE) pkg.dependencies = { '@laticent/cadenza': '^0.1.0', '@laticent/ltt': '^0.1.0' };
    write(`${dirOf(name)}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.changeset', 'config.json'), 'utf8'));
  config.changelog = path.join(ROOT, 'tools', 'changeset-changelog.cjs');
  write('.changeset/config.json', JSON.stringify(config, null, 2));
  write('.changeset/README.md', '# fixture\n');
  write('changelog.d/README.md', '# fixture\n');
  write('changelog/pre-release-archive.md', '# Pre-1.0.0 development log\n');
  write('release-notes/1.0.0.md', '# Lattice 1.0.0\n\n- Curated highlight.\n');
  write('packages/lattice/CHANGELOG.md', '# @laticent/lattice\n\nIntro paragraph.\n');
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'fixture');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  const version = (name) => JSON.parse(fs.readFileSync(path.join(dir, dirOf(name), 'package.json'), 'utf8')).version;
  const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
  return { dir, write, git, version, read };
}

/** A fragment exactly as an open PR writes it today (changelog.d/README.md). */
const FIXED_FRAGMENT = '- **Fixed: the roadmap lane no longer clips its last milestone.** The lane\n  measured its width before the fit spine had run. It now measures after.\n';
const ADDED_FRAGMENT = '- A `timeline` slide can now take a `dense` modifier.\n';

describe('constraint 1: a changelog.d fragment releases with no change to the PR that wrote it', () => {
  test('the gate still accepts the fragment, and the release converts it and bumps the engine', (t) => {
    const f = fixture(t);
    // The real order: the first release writes `## 1.0.0`, and a later release stacks above it.
    release.bootstrapPrepare(f.dir, { dry: false, date: '2026-11-27' });
    f.write('changelog.d/3499-roadmap-lane.fixed.md', FIXED_FRAGMENT);
    f.write('changelog.d/3500-timeline-dense.added.md', ADDED_FRAGMENT);
    assert.deepEqual(fragmentProblems(path.join(f.dir, 'changelog.d')), [], 'build:check would reject the fragment');

    release.versionPrepare(f.dir, { dry: false, date: '2026-12-01', engine: { version: '1.0.0' }, lock: false });

    assert.equal(f.version(ENGINE), '1.1.0', 'added (minor) outranks fixed (patch)');
    assert.equal(f.version('@laticent/ltt'), '0.1.0', 'a fragment names only the engine');
    assert.deepEqual(fs.readdirSync(path.join(f.dir, 'changelog.d')), ['README.md'], 'consumed fragments are deleted');
    assert.deepEqual(fs.readdirSync(path.join(f.dir, '.changeset')).sort(), ['README.md', 'config.json'], 'consumed changesets are deleted');
    const log = f.read('packages/lattice/CHANGELOG.md');
    assert.match(log, /^## 1\.1\.0$/m);
    assert.match(log, /^- \*\*Fixed: the roadmap lane no longer clips its last milestone\.\*\* The lane measured its width before the fit spine had run\./m,
      'the wrapped first bullet is one line in the changelog');
    assert.match(log, /^- A `timeline` slide can now take a `dense` modifier\.$/m);
    assert.ok(log.indexOf('Intro paragraph.') < log.indexOf('## 1.1.0'), 'the intro stays on top');
    assert.ok(log.indexOf('## 1.1.0') < log.indexOf('## 1.0.0'), 'the newest section comes first');
    assert.doesNotMatch(log, /^- [0-9a-f]{7}: /m, 'no commit hash before the entry');
  });

  test('a **Breaking:** fragment bumps the engine major, as it always did', (t) => {
    const f = fixture(t);
    f.write('changelog.d/3501-drop-old.changed.md', '- **Breaking:** the `legacy-grid` class is gone.\n');
    const out = release.versionPrepare(f.dir, { dry: false, date: '2026-12-01', engine: { version: '1.0.0' }, lock: false });
    assert.equal(f.version(ENGINE), '2.0.0');
    // A major is a promise to every user: release.yml turns auto-merge off when `majors` is non-empty.
    assert.deepEqual(out.majors, ['@laticent/lattice 1.0.0 → 2.0.0']);
  });

  test('a release with no major crossing auto-merges (majors is empty)', (t) => {
    const f = fixture(t);
    f.write('changelog.d/3504-y.added.md', '- A new modifier.\n');
    const out = release.versionPrepare(f.dir, { dry: false, date: '2026-12-01', engine: { version: '1.0.0' }, lock: false });
    assert.deepEqual(out.majors, []);
  });

  test('fragments and changesets release together; a library bump patches its dependents', (t) => {
    const f = fixture(t);
    f.write('changelog.d/3502-x.fixed.md', '- A fix.\n');
    f.write('.changeset/ltt-schema.md', '---\n"@laticent/ltt": minor\n---\n\nLTT files can now declare a schema version.\n');
    assert.deepEqual(changesetProblems(path.join(f.dir, '.changeset')), []);
    release.versionPrepare(f.dir, { dry: false, date: '2026-12-01', engine: { version: '1.0.0' }, lock: false });
    assert.equal(f.version('@laticent/ltt'), '0.2.0');
    assert.equal(f.version('@laticent/cadenza'), '0.1.1', 'cadenza depends on ltt ^0.1.0, which 0.2.0 leaves');
    assert.equal(f.version(ENGINE), '1.0.1', 'the fragment (patch) plus the dependency update');
    assert.equal(f.version('@laticent/vetrina'), '0.1.0', 'an ignored library never moves');
    assert.match(f.read('libs/ltt/CHANGELOG.md'), /^- LTT files can now declare a schema version\.$/m);
  });

  test('nothing pending is refused, not released empty', (t) => {
    const f = fixture(t);
    assert.throws(() => release.versionPrepare(f.dir, { dry: false, date: '2026-12-01', engine: { version: '1.0.0' }, lock: false }), /nothing to release/);
  });
});

describe('constraint 2: the first release bumps nothing', () => {
  test('engine 1.0.0, not on npm and untagged, is the bootstrap', (t) => {
    const f = fixture(t);
    const mode = release.releaseMode(f.dir, { registry: () => false });
    assert.equal(mode.mode, 'bootstrap');
  });

  test('the bootstrap keeps 1.0.0 and 0.1.0, archives what is pending, and starts every changelog', (t) => {
    const f = fixture(t);
    f.write('changelog.d/3503-late.fixed.md', '- A fix that landed after the cutover.\n');
    f.write('.changeset/late.md', '---\n"@laticent/lattice": major\n---\n\nA changeset that landed before 1.0.0.\n');
    release.bootstrapPrepare(f.dir, { dry: false, date: '2026-11-27' });

    assert.equal(f.version(ENGINE), '1.0.0', 'the engine ships at 1.0.0 (the old tool computed 2.0.0)');
    for (const name of PUBLISH_SET.filter((n) => n !== ENGINE)) assert.equal(f.version(name), '0.1.0', name);
    const archive = f.read('changelog/pre-release-archive.md');
    assert.match(archive, /^## Folded into 1\.0\.0 at release \(2026-11-27\)$/m);
    assert.match(archive, /A fix that landed after the cutover\./);
    assert.match(archive, /A changeset that landed before 1\.0\.0\. \(@laticent\/lattice major\)/);
    assert.deepEqual(fs.readdirSync(path.join(f.dir, 'changelog.d')), ['README.md']);
    assert.deepEqual(fs.readdirSync(path.join(f.dir, '.changeset')).sort(), ['README.md', 'config.json']);
    assert.match(f.read('packages/lattice/CHANGELOG.md'), /Intro paragraph\.\n\n## 1\.0\.0\n\n- First release on npm\. .*release-notes\/1\.0\.0\.md/);
    assert.match(f.read('libs/ltt/CHANGELOG.md'), /^# @laticent\/ltt\n\n## 0\.1\.0\n\n- First release on npm\.\n$/);
    assert.ok(!fs.existsSync(path.join(f.dir, 'libs/vetrina/CHANGELOG.md')), 'an ignored library gets no changelog');
  });

  test('the bootstrap refuses without its curated notes', (t) => {
    const f = fixture(t);
    fs.rmSync(path.join(f.dir, 'release-notes/1.0.0.md'));
    assert.throws(() => release.bootstrapPrepare(f.dir, { dry: false, date: '2026-11-27' }), /release-notes\/1\.0\.0\.md/);
  });

  test('once 1.0.0 is on npm, the next release versions with Changesets', (t) => {
    const f = fixture(t);
    assert.equal(release.releaseMode(f.dir, { registry: () => true }).mode, 'version');
  });

  test('a later version that never reached npm is refused: finish that release, do not stack one on it', (t) => {
    const f = fixture(t, { engineVersion: '1.1.0' });
    assert.throws(() => release.releaseMode(f.dir, { registry: () => false }), /never finished/);
  });

  test('a 1.0.0 already tagged @laticent/lattice@1.0.0 is not a bootstrap, even if npm says otherwise', (t) => {
    const f = fixture(t);
    f.git('tag', '@laticent/lattice@1.0.0');
    assert.throws(() => release.releaseMode(f.dir, { registry: () => false }), /never finished/);
  });
});

describe('constraint 3: the publish phase', () => {
  test('the plan lists every package missing from npm or untagged, and nothing else', (t) => {
    const f = fixture(t);
    f.git('tag', '@laticent/ltt@0.1.0');
    const onNpm = new Set(['@laticent/ltt', '@laticent/calco']);
    const plan = release.publishPlan(f.dir, { registry: (n) => onNpm.has(n) });
    const names = plan.map((p) => p.name);
    assert.ok(!names.includes('@laticent/ltt'), 'on npm and tagged');
    assert.ok(names.includes('@laticent/calco'), 'on npm but untagged: tag only');
    assert.equal(plan.find((p) => p.name === '@laticent/calco').onNpm, true);
    assert.equal(names.length, PUBLISH_SET.length - 1);
    assert.ok(!names.some((n) => IGNORED.includes(n)), 'an ignored library is never planned');
  });

  test('refuses before anything reaches npm while the August v1.0.0 tag exists', (t) => {
    const f = fixture(t);
    f.git('tag', 'v1.0.0');
    let looked = 0;
    assert.throws(
      // dry + a changeset binary that cannot publish: if the guard ever regressed, this test still could not
      // reach a registry (HARD RULE #32).
      () => release.publish({ root: f.dir, dry: true, skipChecks: true, changesetBin: '/bin/false', registry: () => { looked++; return false; } }),
      /retire it first.*Nothing was published/s,
    );
    assert.equal(looked, PUBLISH_SET.length, 'it read the registry once per package and published nothing');
    assert.deepEqual(f.git('tag', '--list').split('\n'), ['v1.0.0'], 'no tag was created');
  });

  test('refuses while a publish-set package is still private (#3451 / the segno rename not merged)', (t) => {
    const f = fixture(t, { privateLibs: ['@laticent/markup'] });
    assert.throws(() => release.publish({ root: f.dir, dry: true, skipChecks: true, changesetBin: '/bin/false', registry: () => false }), /markup is in PUBLISH_SET but "private": true/);
  });

  test('only a release commit can publish: a package with no changelog section for its version is refused', (t) => {
    const f = fixture(t); // no release commit yet: no package has its `## <version>` section
    assert.throws(
      () => release.publish({ root: f.dir, dry: true, skipChecks: true, changesetBin: '/bin/false', registry: () => false }),
      /no `## <version>` section in its CHANGELOG\.md, so this is not a release commit.*Nothing was published/s,
    );
    assert.deepEqual(f.git('tag', '--list'), '', 'no tag was created');
  });

  test('a package npm reports missing right after publishing is asked again before it is called missing', () => {
    let calls = 0;
    const lagging = () => ++calls >= 3; // a 404 twice, then found: a brand-new package's edge cache catching up
    assert.equal(release.settledOnNpm(lagging, '@laticent/ltt', '0.1.0', 0), true);
    assert.equal(calls, 3);
    assert.equal(release.settledOnNpm(() => false, '@laticent/ltt', '0.1.0', 0, 4), false, 'still missing after every try');
  });

  test('crossing a major line, including a 0.x library reaching 1.0.0, is flagged for review', () => {
    assert.equal(release.crossesMajor('1.4.2', '2.0.0'), true);
    assert.equal(release.crossesMajor('0.1.0', '1.0.0'), true);
    assert.equal(release.crossesMajor('0.1.0', '0.2.0'), false);
    assert.equal(release.crossesMajor('1.0.0', '1.1.0'), false);
  });

  test('nothing to do is a quiet no-op', (t) => {
    const f = fixture(t);
    for (const name of PUBLISH_SET) f.git('tag', `${name}@${f.version(name)}`);
    const out = release.publish({ root: f.dir, skipChecks: true, registry: () => true });
    assert.deepEqual(out.published, []);
  });

  test('the GitHub Release notes are the curated file, then one line per package', (t) => {
    const f = fixture(t);
    release.bootstrapPrepare(f.dir, { dry: false, date: '2026-11-27' });
    const plan = release.publishPlan(f.dir, { registry: () => false });
    const notes = release.releaseNotes(f.dir, '1.0.0', plan);
    assert.match(notes, /^# Lattice 1\.0\.0\n\n- Curated highlight\.\n\n## Packages in this release\n\n- `@laticent\/lattice` 1\.0\.0: First release on npm\./);
    assert.match(notes, /^- `@laticent\/ltt` 0\.1\.0: First release on npm\.$/m);
    assert.equal(notes.match(/^- `@laticent\//gm).length, PUBLISH_SET.length);
  });
});

describe('prepare, end to end', () => {
  test('the first release commits exactly the release surface and hands its outputs to the workflow', (t) => {
    const f = fixture(t);
    f.write('changelog.d/3505-late.fixed.md', '- A late fix.\n');
    f.git('add', '-A');
    f.git('commit', '-q', '-m', 'a late fragment');
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gh-output-')), 'github-output');
    const prior = process.env.GITHUB_OUTPUT;
    process.env.GITHUB_OUTPUT = out;
    t.after(() => { if (prior === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = prior; });
    const r = release.prepare({ root: f.dir, skipChecks: true, build: false, registry: () => false });
    assert.equal(r.mode, 'bootstrap');
    assert.equal(f.git('log', '-1', '--format=%s'), 'release: v1.0.0');
    assert.equal(f.git('status', '--porcelain'), '', 'nothing left uncommitted');
    const changed = f.git('show', '--name-only', '--format=', 'HEAD').split('\n').sort();
    assert.equal(changed.filter((p) => p.endsWith('CHANGELOG.md')).length, PUBLISH_SET.length);
    assert.ok(changed.includes('changelog.d/3505-late.fixed.md') && changed.includes('changelog/pre-release-archive.md'));
    assert.ok(!changed.some((p) => p.endsWith('package.json')), 'the first release moves no version');
    assert.match(fs.readFileSync(out, 'utf8'), /^version=1\.0\.0\nname=v1\.0\.0\nbranch=release\/v1\.0\.0\nneeds_review=false\nmajors=\n$/);
  });

  test('a release refuses on a dirty tree', (t) => {
    const f = fixture(t);
    f.write('stray.txt', 'x');
    assert.throws(() => release.prepare({ root: f.dir, skipChecks: true, build: false, registry: () => false }), /working tree is dirty/);
  });
});

describe('the publish set', () => {
  test('the repository classifies every workspace (the default check build:check runs)', () => {
    assert.deepEqual(publishSetProblems(), []);
  });

  test('a public workspace in neither list is caught before it publishes by accident', (t) => {
    const f = fixture(t);
    const rootPkg = JSON.parse(f.read('package.json'));
    rootPkg.workspaces.push('libs/stray');
    f.write('package.json', JSON.stringify(rootPkg));
    f.write('libs/stray/package.json', JSON.stringify({ name: '@laticent/stray', version: '0.1.0' }));
    assert.match(publishSetProblems({ root: f.dir }).join('\n'), /@laticent\/stray .* is public but in neither PUBLISH_SET nor IGNORED/);
  });

  test('the ignore list in .changeset/config.json and IGNORED move together', (t) => {
    const f = fixture(t);
    const config = JSON.parse(f.read('.changeset/config.json'));
    config.ignore = config.ignore.filter((n) => n !== '@laticent/veduta');
    f.write('.changeset/config.json', JSON.stringify(config));
    assert.match(publishSetProblems({ root: f.dir }).join('\n'), /differs from IGNORED/);
  });

  test('a changeset that names a package outside the publish set fails the gate', (t) => {
    const f = fixture(t);
    f.write('.changeset/bad.md', '---\n"@laticent/vetrina": minor\n---\n\nVetrina tours can loop.\n');
    f.write('.changeset/bullet.md', '---\n"@laticent/ltt": patch\n---\n\n- A bullet first line.\n');
    f.write('.changeset/unquoted.md', '---\n@laticent/lattice: minor\n---\n\nUnquoted scope.\n');
    f.write('.changeset/zero-major.md', '---\n"@laticent/ltt": major\n---\n\nLTT drops the packed encoding.\n');
    const problems = changesetProblems(path.join(f.dir, '.changeset')).join('\n');
    assert.match(problems, /zero-major\.md: `major` for @laticent\/ltt \(0\.1\.0\) would release it as 1\.0\.0/);
    assert.match(problems, /bad\.md: names @laticent\/vetrina, which does not publish/);
    assert.match(problems, /unquoted\.md: Changesets cannot read it/, 'the gate reads a changeset the way `changeset version` will');
    assert.match(problems, /bullet\.md: the first line .* is a heading, bullet or quote/);
  });
});
