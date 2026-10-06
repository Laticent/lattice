/**
 * tools/rebase-guard.sh refuses a push that rebases (or merges main into) a branch
 * whose remote head would have merged cleanly with that newer main on GitHub's
 * terms — HARD RULE #16's "rebase only on a real conflict", made blocking at
 * pre-push. It must NEVER refuse a catch-up that was needed, so every case here
 * builds a real throwaway repo and feeds the guard the exact stdin git gives a
 * pre-push hook: `<local ref> <local sha> <remote ref> <remote sha>`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// A git hook exports GIT_DIR / GIT_INDEX_FILE; inherited, the scratch repos below
// would act on the REAL repo (see staged-pdf-glob.test.js). Clear them for this file.
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];

const GUARD = path.join(__dirname, '..', '..', '..', 'tools', 'rebase-guard.sh');
const PRECHECK = path.join(__dirname, '..', '..', '..', 'tools', 'queue-precheck.sh');
const ZERO = '0'.repeat(40);

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebase-guard-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(GUARD, path.join(dir, 'tools', 'rebase-guard.sh'));
  fs.copyFileSync(PRECHECK, path.join(dir, 'tools', 'queue-precheck.sh'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  const commit = (f, s, msg) => {
    write(f, s);
    git('add', f);
    git('commit', '-q', '-m', msg);
    return git('rev-parse', 'HEAD');
  };
  commit('a.txt', 'one\ntwo\nthree\n', 'base');
  return { dir, git, commit };
}

function guard(dir, line, env = {}) {
  return spawnSync('bash', ['tools/rebase-guard.sh'], {
    cwd: dir,
    input: `${line}\n`,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/** main moves on with `mainChange`; feature changed `featChange`; then feature is
 *  caught up with main by `how` ('rebase' | 'merge'). Returns the pre-push line. */
function scenario({ featFile, featBody, mainFile, mainBody, how = 'rebase' }) {
  const r = repo();
  const { git, commit } = r;
  git('checkout', '-q', '-b', 'feat');
  const oldHead = commit(featFile, featBody, 'feature work');
  git('checkout', '-q', 'main');
  commit(mainFile, mainBody, 'main moves');
  git('update-ref', 'refs/remotes/origin/main', 'main');
  git('checkout', '-q', 'feat');
  if (how === 'rebase') {
    const rb = spawnSync('git', ['rebase', '-q', 'main'], { cwd: r.dir, encoding: 'utf8' });
    if (rb.status !== 0) {
      // A real conflict: resolve by taking the feature side, as a session would.
      git('checkout', '--theirs', '--', '.');
      git('add', '-A');
      spawnSync('git', ['-c', 'core.editor=true', 'rebase', '--continue'], { cwd: r.dir });
    }
  } else {
    const mg = spawnSync('git', ['merge', '-q', '--no-edit', 'main'], { cwd: r.dir, encoding: 'utf8' });
    if (mg.status !== 0) {
      git('checkout', '--ours', '--', '.');
      git('add', '-A');
      git('commit', '-q', '--no-edit');
    }
  }
  const newHead = git('rev-parse', 'HEAD');
  return { ...r, line: `refs/heads/feat ${newHead} refs/heads/feat ${oldHead}`, oldHead, newHead };
}

describe('rebase-guard', () => {
  test('refuses a rebase the branch did not need (clean on GitHub terms)', () => {
    const s = scenario({ featFile: 'feat.txt', featBody: 'x\n', mainFile: 'other.txt', mainBody: 'y\n' });
    const r = guard(s.dir, s.line);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /refusing to push feat/);
    assert.match(r.stderr, /HARD RULE #16/);
  });

  test('refuses a merge from main the branch did not need', () => {
    const s = scenario({ featFile: 'feat.txt', featBody: 'x\n', mainFile: 'other.txt', mainBody: 'y\n', how: 'merge' });
    assert.equal(guard(s.dir, s.line).status, 1);
  });

  test('allows a rebase that resolved a real conflict', () => {
    const s = scenario({
      featFile: 'a.txt',
      featBody: 'one\nFEATURE\nthree\n',
      mainFile: 'a.txt',
      mainBody: 'one\nMAIN\nthree\n',
    });
    const r = guard(s.dir, s.line);
    assert.equal(r.status, 0, r.stderr);
  });

  test('a conflict GitHub sees but a merge=union driver hides is still a conflict', () => {
    // GitHub ignores .gitattributes merge drivers (decisions/2026-09-28 §4b), so a
    // union-merged file that clashes is a REAL conflict and the rebase was needed.
    const r0 = repo();
    r0.commit('.gitattributes', 'index.md merge=union\n', 'attrs');
    r0.commit('index.md', 'row a\n', 'index');
    r0.git('checkout', '-q', '-b', 'feat');
    const oldHead = r0.commit('index.md', 'row a\nrow feat\n', 'add feat row');
    r0.git('checkout', '-q', 'main');
    r0.commit('index.md', 'row a\nrow main\n', 'add main row');
    r0.git('update-ref', 'refs/remotes/origin/main', 'main');
    r0.git('checkout', '-q', 'feat');
    r0.git('rebase', '-q', 'main'); // the union driver makes this succeed locally
    const newHead = r0.git('rev-parse', 'HEAD');
    const r = guard(r0.dir, `refs/heads/feat ${newHead} refs/heads/feat ${oldHead}`);
    assert.equal(r.status, 0, r.stderr);
  });

  test('LATTICE_REBASE_REASON lets a needed-commit catch-up through and prints it', () => {
    const s = scenario({ featFile: 'feat.txt', featBody: 'x\n', mainFile: 'other.txt', mainBody: 'y\n' });
    const r = guard(s.dir, s.line, { LATTICE_REBASE_REASON: 'needs abc123: the fix' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /allowed: needs abc123: the fix/);
  });

  test('ignores an amend or new work on the same main', () => {
    const r0 = repo();
    r0.git('update-ref', 'refs/remotes/origin/main', 'main');
    r0.git('checkout', '-q', '-b', 'feat');
    const oldHead = r0.commit('f.txt', '1\n', 'work');
    r0.git('commit', '-q', '--amend', '-m', 'work, amended');
    const newHead = r0.git('rev-parse', 'HEAD');
    assert.equal(guard(r0.dir, `refs/heads/feat ${newHead} refs/heads/feat ${oldHead}`).status, 0);
  });

  test('ignores a new branch, a deletion, a push to main, and an unknown old head', () => {
    const s = scenario({ featFile: 'feat.txt', featBody: 'x\n', mainFile: 'other.txt', mainBody: 'y\n' });
    assert.equal(guard(s.dir, `refs/heads/feat ${s.newHead} refs/heads/feat ${ZERO}`).status, 0);
    assert.equal(guard(s.dir, `(delete) ${ZERO} refs/heads/feat ${s.oldHead}`).status, 0);
    assert.equal(guard(s.dir, `refs/heads/main ${s.newHead} refs/heads/main ${s.oldHead}`).status, 0);
    assert.equal(guard(s.dir, `refs/heads/feat ${s.newHead} refs/heads/feat ${'1'.repeat(40)}`).status, 0);
  });
});
