/**
 * Unit: the PreToolUse nudge against a needless catch-up with main
 * (.claude/hooks/warn-needless-catchup.sh), HARD RULE #16.
 *
 * Why a warning and not a block: two blocking designs were built for PR #2561 and
 * the adversarial trio refuted both (decisions/2026-10-06-conflict-reduction.md
 * §2.2). Git hooks that refuse mid-operation stranded autostashed edits and
 * half-done merges, and lefthook's `{0}` handed ref names to a shell. This hook runs
 * before git starts and only ever prints, so the properties pinned here are:
 *
 *   1. It NEVER blocks: exit 0 on every input, including garbage.
 *   2. It warns only when the catch-up is really needless, as judged by the same
 *      tools/queue-precheck.sh the Stop hook runs, against a real repo.
 *   3. It stays quiet on everything else: a real conflict, a branch already level
 *      with main, history cleanup on the branch's own base, unrelated commands.
 *   4. It is registered: a hook that is written but not wired is a no-op nothing
 *      else would notice.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];

const REPO = path.join(__dirname, '..', '..', '..');
const HOOK = path.join(REPO, '.claude', 'hooks', 'warn-needless-catchup.sh');
const bash = (command, extra = {}) => JSON.stringify({ tool_name: 'Bash', tool_input: { command, ...extra.input }, ...extra.top });

/** A scratch repo with tools/queue-precheck.sh, feat one commit ahead, main one ahead. */
function repo({ conflict = false, level = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(path.join(REPO, 'tools', 'queue-precheck.sh'), path.join(dir, 'tools', 'queue-precheck.sh'));
  const git = (...a) => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  };
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  write('a.txt', 'one\ntwo\nthree\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feat');
  write(conflict ? 'a.txt' : 'f.txt', conflict ? 'one\nFEAT\nthree\n' : 'f\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feature');
  if (!level) {
    git('checkout', '-q', 'main');
    write(conflict ? 'a.txt' : 'm.txt', conflict ? 'one\nMAIN\nthree\n' : 'm\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'main moves');
    git('checkout', '-q', 'feat');
  }
  git('update-ref', 'refs/remotes/origin/main', 'main');
  return dir;
}

/** Point feat's upstream at `ref` (a local ref stands in for a remote one). */
function track(dir, remoteRef) {
  const run = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  run('config', 'branch.feat.remote', 'origin');
  run('config', 'branch.feat.merge', `refs/heads/${remoteRef}`);
  run('config', 'remote.origin.url', dir);
  run('config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  if (remoteRef !== 'main') run('update-ref', `refs/remotes/origin/${remoteRef}`, 'feat');
}

const fire = (payload, dir = REPO) => {
  const r = spawnSync(HOOK, {
    input: payload,
    encoding: 'utf8',
    cwd: dir,
    timeout: 20_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  return { code: r.status, out: (r.stdout || '').trim() };
};

describe('warn-needless-catchup — warns on a needless catch-up', () => {
  const needless = {
    'a rebase onto origin/main': 'git rebase origin/main',
    'a fetch-then-rebase': 'git fetch origin main && git rebase origin/main',
    'a merge of origin/main': 'git merge --no-edit origin/main',
    'a pull of main': 'git pull origin main',
    'a pull --rebase of main': 'git pull --rebase origin main',
    'a git -C form': 'git -C /some/dir rebase origin/main',
  };
  for (const [label, command] of Object.entries(needless)) {
    test(`flags ${label}`, () => {
      const { code, out } = fire(bash(command), repo());
      assert.equal(code, 0, 'a warning hook must exit 0');
      assert.match(out, /HARD RULE #16/);
      const msg = JSON.parse(out);
      assert.match(msg.systemMessage, /not needed/);
      assert.match(msg.hookSpecificOutput.additionalContext, /Update branch/, 'it names the GitHub route too');
    });
  }
});

describe('warn-needless-catchup — stays quiet when the catch-up is fine or unrelated', () => {
  test('a real conflict: the rebase is needed', () => {
    const { code, out } = fire(bash('git rebase origin/main'), repo({ conflict: true }));
    assert.equal(code, 0);
    assert.equal(out, '');
  });
  test('a branch already level with main', () => {
    const { code, out } = fire(bash('git rebase origin/main'), repo({ level: true }));
    assert.equal(code, 0);
    assert.equal(out, '');
  });
  const quiet = {
    'history cleanup on the branch base': 'git rebase -i "$(git merge-base HEAD origin/main)"',
    'history cleanup, spaced form': 'git rebase -i $( git merge-base HEAD origin/main )',
    'a merge-base query': 'git merge-base HEAD origin/main',
    'a status': 'git status',
    'a log of main': 'git log --oneline origin/main',
    'a rebase onto another branch': 'git rebase feature-x',
    'two separate commands': 'git rebase --continue; echo main',
  };
  for (const [label, command] of Object.entries(quiet)) {
    test(label, () => {
      const { code, out } = fire(bash(command), repo());
      assert.equal(code, 0);
      assert.equal(out, '', `should not warn on: ${command}`);
    });
  }
});

describe('warn-needless-catchup — gaps the final checker found on PR #2561', () => {
  test('a bare `git pull` warns when the branch tracks origin/main', () => {
    const dir = repo();
    track(dir, 'main');
    for (const command of ['git pull', 'git pull --rebase']) {
      const { out } = fire(bash(command), dir);
      assert.match(out, /HARD RULE #16/, command);
    }
  });
  test('a bare `git pull` stays quiet when the branch tracks its own remote', () => {
    const dir = repo();
    track(dir, 'feat');
    assert.equal(fire(bash('git pull --rebase'), dir).out, '');
  });
  test('only the command is read: a description that mentions merge and main does not warn', () => {
    const { out } = fire(bash('git log --oneline', { input: { description: 'Show merge commits on main' } }), repo());
    assert.equal(out, '');
  });
  test('merge-base in one segment does not silence a rebase in the next', () => {
    const { out } = fire(bash('git merge-base --is-ancestor HEAD origin/main && git rebase origin/main'), repo());
    assert.match(out, /HARD RULE #16/);
  });
  test('it judges the directory the command runs in (the payload cwd)', () => {
    const level = repo({ level: true });
    const behind = repo();
    // The project is level (would stay quiet); the command runs in a behind clone.
    const r = spawnSync(HOOK, {
      input: bash('git rebase origin/main', { top: { cwd: behind } }),
      encoding: 'utf8',
      cwd: level,
      env: { ...process.env, CLAUDE_PROJECT_DIR: level },
    });
    assert.match(r.stdout, /HARD RULE #16/);
  });
});

describe('warn-needless-catchup — gaps the checker found on fbf74cb', () => {
  test('a bare `git pull` on its own line of a multi-line command warns', () => {
    const dir = repo();
    track(dir, 'main');
    assert.match(fire(bash('git pull\nnpm test'), dir).out, /HARD RULE #16/);
  });
  test('lines are separate commands: `git status` then `npm run pull` does not warn', () => {
    const dir = repo();
    track(dir, 'main');
    assert.equal(fire(bash('git status\nnpm run pull'), dir).out, '');
  });
  for (const ref of ["'origin/main'", 'origin/main~0', 'origin/main^']) {
    test(`a quoted or suffixed ref warns: ${ref}`, () => {
      assert.match(fire(bash(`git rebase ${ref}`), repo()).out, /HARD RULE #16/);
    });
  }
  test('`origin/maint` is not main', () => {
    assert.equal(fire(bash('git rebase origin/maint'), repo()).out, '');
  });
});

describe('warn-needless-catchup — never blocks', () => {
  for (const [label, payload] of Object.entries({
    'empty input': '',
    'not JSON': 'git rebase origin/main {{{',
    'outside a git repo': bash('git rebase origin/main'),
  })) {
    test(label, () => {
      const dir = label === 'outside a git repo' ? fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-')) : REPO;
      assert.equal(fire(payload, dir).code, 0);
    });
  }
});

test('it is registered as a PreToolUse(Bash) hook', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
  const cmds = (settings.hooks?.PreToolUse || [])
    .filter((m) => m.matcher === 'Bash')
    .flatMap((m) => m.hooks.map((h) => h.command));
  assert.ok(cmds.some((c) => c.endsWith('/.claude/hooks/warn-needless-catchup.sh')), cmds.join(', '));
});
