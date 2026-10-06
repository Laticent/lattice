/**
 * tools/rebase-guard.sh refuses a rebase onto, or a merge of, a newer main that the
 * branch merges cleanly with on GitHub's terms — HARD RULE #16, checked at the
 * moment of the catch-up through git's `pre-rebase` and `pre-merge-commit` hooks.
 *
 * It must NEVER refuse a catch-up that was needed, and a refusal must change nothing.
 * So every case builds a throwaway repo and drives REAL git through the REAL lefthook
 * binary, with the two hook sections copied out of this repo's own lefthook.yml: the
 * way lefthook passes git's arguments (`{0}`) is part of the contract (HARD RULE #23).
 *
 * The first version ran at pre-push. The adversarial trio on PR #2561 showed that a
 * push-time check judged the remote head instead of the local one (refusing a needed
 * merge when an unpushed commit was what conflicted, with undo advice that deleted
 * that commit), refused rewords, and let "rebase, then commit" through. Cases 3, 4
 * and the stacked-branch case below pin those.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

// A git hook exports GIT_DIR / GIT_INDEX_FILE; inherited, the scratch repos below
// would act on the REAL repo (see staged-pdf-glob.test.js). Clear them for this file.
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];

const ROOT = path.join(__dirname, '..', '..', '..');
const LEFTHOOK = path.join(ROOT, 'node_modules', '.bin', 'lefthook');
const CONFIG = YAML.parse(fs.readFileSync(path.join(ROOT, 'lefthook.yml'), 'utf8'));
const HOOKS = { 'pre-rebase': CONFIG['pre-rebase'], 'pre-merge-commit': CONFIG['pre-merge-commit'] };

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebase-guard-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  for (const f of ['rebase-guard.sh', 'queue-precheck.sh']) {
    fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(dir, 'tools', f));
  }
  fs.writeFileSync(path.join(dir, 'lefthook.yml'), YAML.stringify(HOOKS));
  const run = (cmd, args, env = {}) =>
    spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  const git = (...args) => {
    const r = run('git', args);
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  const commit = (f, s, msg) => {
    fs.writeFileSync(path.join(dir, f), s);
    git('add', f);
    git('commit', '-q', '-m', msg);
    return git('rev-parse', 'HEAD');
  };
  // tools/ and lefthook.yml are committed on main, so every branch carries them.
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const inst = run(LEFTHOOK, ['install']);
  if (inst.status !== 0) throw new Error(`lefthook install: ${inst.stderr}${inst.stdout}`);
  return { dir, run, git, commit };
}

/** feat changes `featFile`; main then changes `mainFile`; origin/main = main. */
function scenario({ featFile = 'feat.txt', featBody = 'x\n', mainFile = 'other.txt', mainBody = 'y\n' } = {}) {
  const r = repo();
  r.git('checkout', '-q', '-b', 'feat');
  r.commit(featFile, featBody, 'feature work');
  r.git('checkout', '-q', 'main');
  r.commit(mainFile, mainBody, 'main moves');
  r.git('update-ref', 'refs/remotes/origin/main', 'main');
  r.git('checkout', '-q', 'feat');
  return r;
}

const refused = (res) => /refusing the/.test(`${res.stdout}${res.stderr}`);

describe('rebase-guard at pre-rebase', () => {
  test('1. refuses a needless rebase onto main, and changes nothing', () => {
    const r = scenario();
    const before = r.git('rev-parse', 'HEAD');
    const res = r.run('git', ['rebase', 'origin/main']);
    assert.notEqual(res.status, 0);
    assert.ok(refused(res), res.stderr);
    assert.equal(r.git('rev-parse', 'HEAD'), before);
  });

  test('2. allows a rebase that has a real conflict to resolve', () => {
    const r = scenario({ featFile: 'a.txt', featBody: 'one\nFEAT\nthree\n', mainFile: 'a.txt', mainBody: 'one\nMAIN\nthree\n' });
    const res = r.run('git', ['rebase', 'origin/main']);
    assert.ok(!refused(res), res.stderr);
    assert.match(`${res.stdout}${res.stderr}`, /CONFLICT/);
  });

  test('3. judges the LOCAL head: an unpushed commit that conflicts makes the rebase needed', () => {
    const r = scenario();
    r.git('update-ref', 'refs/remotes/origin/feat', 'feat'); // the pushed head merges cleanly...
    r.commit('a.txt', 'one\nLOCAL\nthree\n', 'unpushed work'); // ...this unpushed commit does not
    r.git('checkout', '-q', 'main');
    r.commit('a.txt', 'one\nMAIN\nthree\n', 'main edits a.txt');
    r.git('update-ref', 'refs/remotes/origin/main', 'main');
    r.git('checkout', '-q', 'feat');
    const res = r.run('git', ['rebase', 'origin/main']);
    assert.ok(!refused(res), res.stderr);
  });

  test('4. allows history cleanup on the branch own merge base (reword, squash)', () => {
    const r = scenario();
    r.commit('feat2.txt', 'z\n', 'fixup! feature work');
    const base = r.git('merge-base', 'HEAD', 'origin/main');
    const res = r.run('git', ['rebase', '-i', '--autosquash', base], { GIT_SEQUENCE_EDITOR: 'true' });
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!refused(res));
  });

  test('5. allows a rebase onto the branch own remote (pull --rebase), which brings no main', () => {
    const r = scenario();
    // A local branch stands in for origin/feat (the scratch repo has no remote);
    // the guard resolves @{upstream} the same way for either.
    r.git('branch', '-q', 'pushed', 'feat');
    r.git('branch', '-q', '--set-upstream-to=pushed');
    r.commit('more.txt', 'm\n', 'more work');
    const res = r.run('git', ['rebase']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!refused(res));
  });

  test('6. allows a stacked branch rebased onto its parent when the parent brings no newer main', () => {
    const r = repo();
    r.git('update-ref', 'refs/remotes/origin/main', 'main');
    r.git('checkout', '-q', '-b', 'parent');
    r.commit('p.txt', 'p\n', 'parent work');
    r.git('checkout', '-q', '-b', 'child');
    r.commit('c.txt', 'c\n', 'child work');
    r.git('checkout', '-q', 'parent');
    r.commit('p2.txt', 'p2\n', 'more parent work');
    r.git('checkout', '-q', 'child');
    const res = r.run('git', ['rebase', 'parent']);
    assert.equal(res.status, 0, res.stderr);
  });

  test('7. a clash that only GitHub sees (merge=union) is a real conflict, so the rebase is allowed', () => {
    const r = repo();
    r.commit('.gitattributes', 'index.md merge=union\n', 'attrs');
    r.commit('index.md', 'row a\n', 'index');
    r.git('checkout', '-q', '-b', 'feat');
    r.commit('index.md', 'row a\nrow feat\n', 'add feat row');
    r.git('checkout', '-q', 'main');
    r.commit('index.md', 'row a\nrow main\n', 'add main row');
    r.git('update-ref', 'refs/remotes/origin/main', 'main');
    r.git('checkout', '-q', 'feat');
    const res = r.run('git', ['rebase', 'origin/main']);
    assert.ok(!refused(res), res.stderr);
  });
});

describe('rebase-guard at pre-merge-commit', () => {
  test('8. refuses a needless merge of main, and creates no merge commit', () => {
    const r = scenario();
    const before = r.git('rev-parse', 'HEAD');
    const res = r.run('git', ['merge', '--no-edit', 'origin/main']);
    assert.notEqual(res.status, 0);
    assert.ok(refused(res), res.stderr);
    r.run('git', ['merge', '--abort']);
    assert.equal(r.git('rev-parse', 'HEAD'), before);
  });

  test('9. a conflicting merge is never refused (git stops before the hook)', () => {
    const r = scenario({ featFile: 'a.txt', featBody: 'one\nFEAT\nthree\n', mainFile: 'a.txt', mainBody: 'one\nMAIN\nthree\n' });
    const res = r.run('git', ['merge', '--no-edit', 'origin/main']);
    assert.ok(!refused(res), res.stderr);
    assert.match(`${res.stdout}${res.stderr}`, /CONFLICT/);
  });
});

describe('rebase-guard escape (LATTICE_REBASE_REASON)', () => {
  test('10. "needs <sha>" passes only for a commit in the target that the branch lacks', () => {
    const r = scenario();
    const mainSha = r.git('rev-parse', 'origin/main');
    const featSha = r.git('rev-parse', 'HEAD');
    const ok = r.run('git', ['rebase', 'origin/main'], { LATTICE_REBASE_REASON: `needs ${mainSha.slice(0, 10)}` });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stderr, /allowed — needs/);
    const r2 = scenario();
    const bad = r2.run('git', ['rebase', 'origin/main'], { LATTICE_REBASE_REASON: `needs ${featSha}` });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /not a commit in the target/);
    // A commit already in BOTH (the shared base) is not a need either.
    const r3 = scenario();
    const shared = r3.git('merge-base', 'HEAD', 'origin/main');
    const stale = r3.run('git', ['rebase', 'origin/main'], { LATTICE_REBASE_REASON: `needs ${shared}` });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /not a commit in the target/);
  });

  test('11. "queue ejected: <why>" passes; free text does not', () => {
    const r = scenario();
    const ok = r.run('git', ['rebase', 'origin/main'], { LATTICE_REBASE_REASON: 'queue ejected: unit failed on the group' });
    assert.equal(ok.status, 0, ok.stderr);
    const r2 = scenario();
    const bad = r2.run('git', ['rebase', 'origin/main'], { LATTICE_REBASE_REASON: 'x' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /must be "needs <sha>" or "queue ejected/);
  });
});
