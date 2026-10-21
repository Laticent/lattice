/**
 * Unit: tools/branch-owner.sh — the check behind HARD RULE #31 (one session, one branch).
 *
 * The dangerous direction is a false "safe" (exit 0) while another session's commits are on the
 * branch, so most cases here are ways the script could wrongly pass. Each runs against a throwaway
 * bare "origin" in a temp directory; nothing touches this repo or the network.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '../../../tools/branch-owner.sh');
const ME = 'session_BBBB';
const THEM = 'session_AAAA';
const trailer = (id) => `Claude-Session: https://claude.ai/code/${id}`;

let root;
let work;
const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const commit = (msg) => git('commit', '-q', '--allow-empty', '-m', msg);
const run = (...args) => {
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: work, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-owner-'));
  execFileSync('git', ['init', '-q', '--bare', 'origin.git'], { cwd: root });
  execFileSync('git', ['clone', '-q', 'origin.git', 'w'], { cwd: root, stdio: 'ignore' });
  work = path.join(root, 'w');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  commit('base');
  git('branch', '-M', 'main');
  git('push', '-q', 'origin', 'main');
  const branch = (name, ...msgs) => {
    git('switch', '-q', '-c', name, 'main');
    for (const m of msgs) commit(m);
    git('push', '-q', 'origin', name);
  };
  branch('claude/theirs.v2', `A work\n\n${trailer(THEM)}`);
  branch('claude/mine', `B work\n\n${trailer(ME)}`);
  branch('claude/malformed', 'x\n\nClaude-session: https://claude.ai/code/');
  branch('claude/person', 'a person committed this');
  branch('claude/quoted', `B work, mentions ${THEM} in the body\n\n${trailer(ME)}`);
  branch('claude/empty');
  // B's branch, then main moves, then A merges main in with a trailer: the merge is authorship.
  git('switch', '-q', '-c', 'claude/merged', 'main');
  commit(`B work\n\n${trailer(ME)}`);
  git('switch', '-q', 'main');
  commit('main moves');
  git('push', '-q', 'origin', 'main');
  git('switch', '-q', 'claude/merged');
  git('merge', '-q', '--no-ff', '-m', `merge main\n\n${trailer(THEM)}`, 'main');
  git('push', '-q', 'origin', 'claude/merged');
  // A trailer-less merge that is NOT the newest commit (the awk record split once counted it).
  git('switch', '-q', '-c', 'claude/midmerge', 'main~1');
  commit(`B work\n\n${trailer(ME)}`);
  git('merge', '-q', '--no-ff', '-m', 'Merge main', 'main');
  commit(`B more\n\n${trailer(ME)}`);
  git('push', '-q', 'origin', 'claude/midmerge');
  git('switch', '-q', 'main');
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

describe('branch-owner.sh', () => {
  test("another session's commits: exit 1, and the message says not to push or branch from it", () => {
    const r = run('claude/theirs.v2', '--me', ME);
    assert.equal(r.code, 1);
    assert.match(r.out, new RegExp(THEM));
    assert.match(r.out, /Do not push/);
  });

  test('your own commits only: exit 0; without --me nothing is yours', () => {
    assert.equal(run('claude/mine', '--me', ME).code, 0);
    assert.equal(run('claude/mine').code, 1);
  });

  test('--allow lets a takeover share the branch with the session it came from', () => {
    assert.equal(run('claude/theirs.v2', '--me', ME, '--allow', THEM).code, 0);
    assert.equal(run('claude/theirs.v2', '--me', ME, '--allow', 'session_CCCC').code, 1);
  });

  test('a branch that is not on the remote is new: exit 0', () => {
    const r = run('claude/never-pushed', '--me', ME);
    assert.equal(r.code, 0);
    assert.match(r.out, /new branch/);
  });

  test('a branch with no commits beyond main: exit 0', () => {
    assert.equal(run('claude/empty', '--me', ME).code, 0);
  });

  test('origin/<branch> and refs/heads/<branch> name the same branch, never a missing one', () => {
    assert.equal(run('origin/claude/theirs.v2', '--me', ME, '--no-fetch').code, 1);
    assert.equal(run('refs/heads/claude/theirs.v2', '--me', ME, '--no-fetch').code, 1);
  });

  test("a merge commit that carries another session's trailer counts", () => {
    const r = run('claude/merged', '--me', ME);
    assert.equal(r.code, 1);
    assert.match(r.out, new RegExp(THEM));
  });

  test('a session id quoted in a commit body does not count as its author', () => {
    assert.equal(run('claude/quoted', '--me', ME).code, 0);
  });

  test('a malformed trailer fails the check', () => {
    assert.equal(run('claude/malformed', '--me', ME).code, 1);
  });

  test('a commit with no trailer only warns', () => {
    const r = run('claude/person', '--me', ME);
    assert.equal(r.code, 0);
    assert.match(r.out, /Warning/);
  });

  test('a trailer-less merge in the middle of the branch is ignored, not "unattributed"', () => {
    const r = run('claude/midmerge', '--me', ME);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.out, /unattributed|Warning/);
  });

  test('remote-tracking spellings name the same branch; an invalid name is a usage error', () => {
    assert.equal(run('remotes/origin/claude/theirs.v2', '--me', ME, '--no-fetch').code, 1);
    assert.equal(run('refs/remotes/origin/claude/theirs.v2', '--me', ME, '--no-fetch').code, 1);
    assert.equal(run('bad..name', '--me', ME).code, 64);
    assert.equal(run('claude/theirs.v2/', '--me', ME).code, 64);
  });

  test('a git log failure is "cannot tell" (3), never "nothing to collide with"', () => {
    git('update-ref', 'refs/remotes/origin/claude/ghost', 'HEAD');
    fs.writeFileSync(path.join(work, '.git/refs/remotes/origin/claude/ghost'), `${'0'.repeat(39)}1\n`);
    try {
      assert.equal(run('claude/ghost', '--me', ME, '--no-fetch').code, 3);
    } finally {
      fs.rmSync(path.join(work, '.git/refs/remotes/origin/claude/ghost'), { force: true });
    }
  });

  test('--me or --allow with no value is a usage error, not a hang', () => {
    for (const args of [['--me'], ['claude/mine', '--me'], ['claude/mine', '--allow'], ['claude/mine', '--me', '--no-fetch']]) {
      const r = spawnSync('bash', [SCRIPT, ...args], { cwd: work, encoding: 'utf8', timeout: 10000 });
      assert.equal(r.status, 64, `args ${args.join(' ')}`);
    }
  });

  test('an unreachable remote is "cannot tell" (3), never "new branch"', () => {
    git('remote', 'set-url', 'origin', path.join(root, 'does-not-exist.git'));
    try {
      const r = run('claude/theirs.v2', '--me', ME);
      assert.equal(r.code, 3);
      assert.doesNotMatch(r.out, /new branch/);
    } finally {
      git('remote', 'set-url', 'origin', path.join(root, 'origin.git'));
    }
  });

  test('--no-fetch with no local ref is "cannot tell" (3)', () => {
    const r = run('claude/never-fetched', '--me', ME, '--no-fetch');
    assert.equal(r.code, 3);
  });
});
