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
const bash = (command) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

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
