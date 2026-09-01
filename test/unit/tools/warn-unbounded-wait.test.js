/**
 * Unit: the PreToolUse nudge toward tools/wait-for.sh
 * (.claude/hooks/warn-unbounded-wait.sh).
 *
 * A `check-ownership.js` gate cannot police this. That gate walks the repo
 * filesystem, and the waits that caused the incident were never files — they
 * were ad-hoc Bash tool calls. A PreToolUse hook is the only thing in reach that
 * sees one, which is why this lives in .claude/hooks rather than in the build.
 *
 * Two properties carry the whole design, and they pull against each other:
 *
 *   1. It NEVER blocks. Not on a match, not on malformed input, not on its own
 *      bug. The repo has settled this twice the same way — check-commit-msg.sh
 *      warns and never blocks because HARD RULE #14 bars `--no-verify` as the
 *      escape, and #29's deck policy is "we warn, we coach". A blocking matcher
 *      tuned on one example is a permanent tax on every future session.
 *   2. It stays QUIET on ordinary commands. A warning that cries wolf is one
 *      somebody switches off, so the false-positive cases below are as
 *      load-bearing as the true-positive ones — arguably more.
 *
 * The wiring case matters too: a hook that is written but not registered is an
 * elaborate no-op, and nothing else in the tree would notice.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const HOOK = path.join(REPO, '.claude', 'hooks', 'warn-unbounded-wait.sh');

/** Drive the hook exactly as the harness does: JSON on stdin. */
const fire = (payload) => {
  const r = spawnSync(HOOK, { input: payload, encoding: 'utf8', cwd: REPO, timeout: 10_000 });
  return { code: r.status, out: (r.stdout || '').trim() };
};
const bash = (command) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

describe('warn-unbounded-wait — it warns on a hand-rolled wait', () => {
  const flagged = {
    'the shape that caused the incident': 'until grep -q done build.log; do sleep 5; done',
    'a while-true poller': 'while true; do sleep 30; check_ci; done',
    'a multi-line loop': 'until [ -f .ready ]\ndo\n  sleep 2\ndone',
  };

  for (const [label, command] of Object.entries(flagged)) {
    test(`flags ${label}`, () => {
      const { code, out } = fire(bash(command));
      assert.equal(code, 0, 'a warning hook must still exit 0');
      assert.match(out, /wait-for\.sh/, 'the nudge has to name the fix');
      assert.doesNotThrow(() => JSON.parse(out), 'output must be the JSON the harness expects');
    });
  }
});

describe('warn-unbounded-wait — it stays quiet otherwise', () => {
  // These protect the warning's credibility. One that fires on `npm run build`
  // gets ignored, and then it protects nothing.
  const quiet = {
    'an ordinary build': 'npm run build',
    'a bare sleep': 'sleep 2 && echo done',
    'a grep FOR the pattern': 'grep -rn "until.*sleep" engineering/',
    'a read loop with no sleep': 'cat f | while read x; do echo $x; done',
    'a command already using the helper': "tools/wait-for.sh --job x --until 'sleep 1' -- do done",
  };

  for (const [label, command] of Object.entries(quiet)) {
    test(`ignores ${label}`, () => {
      const { code, out } = fire(bash(command));
      assert.equal(code, 0);
      assert.equal(out, '', `should not have fired on ${label}`);
    });
  }
});

describe('warn-unbounded-wait — it can never break a tool call', () => {
  // Whatever reaches it, the answer is exit 0. A hook that fails a command it
  // was only meant to comment on is worse than no hook.
  for (const [label, payload] of Object.entries({
    'empty input': '',
    'malformed JSON': '{"tool_input":',
    'JSON with no command': '{"tool_name":"Bash"}',
    'a non-Bash payload': JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } }),
    'a payload that is just noise': 'sleep while do done not json at all',
  })) {
    test(`exits 0 on ${label}`, () => {
      assert.equal(fire(payload).code, 0);
    });
  }
});

describe('warn-unbounded-wait — it is actually wired up', () => {
  // A hook that exists but is not registered is an elaborate no-op.
  test('is registered as a PreToolUse hook for Bash', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
    const entries = cfg.hooks?.PreToolUse ?? [];
    const wired = entries.some((e) =>
      e.matcher === 'Bash' && (e.hooks ?? []).some((h) => String(h.command).includes('warn-unbounded-wait.sh')));
    assert.ok(wired, 'the hook is not registered in .claude/settings.json');
  });

  test('is executable', () => {
    assert.doesNotThrow(() => fs.accessSync(HOOK, fs.constants.X_OK));
  });
});
