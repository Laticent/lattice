/**
 * Unit: the PreToolUse merge gate (.claude/hooks/owner-merge-gate.mjs) and its Bash
 * prefilter (.claude/hooks/owner-merge-gate-bash.sh).
 *
 * The gate allows a merge only when the owner's own typed turn (`origin.kind:
 * "human"`, written by the harness) is exactly "merge #N", or exactly "all" /
 * "all but #N" right after a merge digest that listed the PR. These cases pin each
 * way a merge could be wrongly authorized: a relayed session message, a subagent
 * report, a desk brief, a refusal or hedge that mentions the PR, an "all" with no
 * digest, and an unreadable transcript. The Bash cases pin both directions: every
 * real merge route is caught, and text that only MENTIONS a route (a heredoc, a
 * grep) is not, because the first version of this gate blocked its own test file.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const HOOK = path.join(REPO, '.claude', 'hooks', 'owner-merge-gate.mjs');
const PRE = path.join(REPO, '.claude', 'hooks', 'owner-merge-gate-bash.sh');

let decide;
let bashMergeRoute;
before(async () => {
  ({ decide, bashMergeRoute } = await import(HOOK));
});

const human = (text) => ({ type: 'user', origin: { kind: 'human' }, message: { content: text } });
const peer = (text) => ({ type: 'user', origin: { kind: 'peer' }, message: { content: text } });
const notice = (text) => ({ type: 'user', origin: { kind: 'task-notification' }, message: { content: text } });
const assistant = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const toolResult = (text) => ({ type: 'user', message: { content: [{ type: 'tool_result', content: text }] } });

// Route strings are assembled, so this file never holds a literal merge command.
const PULLS = 'pulls';
const route = (n, tail) => `repos/Laticent/lattice/${PULLS}/${n}/${tail}`;

describe('owner-merge-gate decide()', () => {
  const DIGEST = assistant('🚦 Merge digest\n#3359 — head 43591f0 — green — HIGH\n#3360 — head abc — green — HIGH');

  test('exactly "merge #N" (one or several PRs) allows that PR', () => {
    for (const said of ['merge #3359', 'Merge 3359.', 'squash merge #3359', 'merge #3360, #3359', 'merge #3360 and #3359']) {
      assert.equal(decide([human(said)], 3359).allow, true, said);
    }
  });

  test("a refusal, a hedge or extra words never parse as a merge (the card grader's probes)", () => {
    for (const said of [
      'do not merge #3359',
      "don't merge #3359",
      'hold #3359, go ahead with the rest',
      'why is 3359 red? yes I saw it',
      'merge #3359 after the integration run',
      'merge #3359?',
      'yes',
      'lgtm',
      'looks good to me',
    ]) {
      assert.equal(decide([human(said)], 3359).allow, false, said);
    }
  });

  test('"all" counts only as the whole reply, right after a merge digest that listed the PR', () => {
    assert.equal(decide([DIGEST, human('all')], 3359).allow, true);
    assert.equal(decide([DIGEST, human('All.')], 3359).allow, true);
    assert.equal(decide([DIGEST, human('all but #3360')], 3359).allow, true);
    assert.equal(decide([DIGEST, human('all but #3359')], 3359).allow, false, 'excluded');
    assert.equal(decide([DIGEST, human('all')], 3361).allow, false, 'not in the digest');
    assert.equal(decide([human('all')], 3359).allow, false, 'no digest at all');
    for (const said of ['hold all', 'merge none of them, all on hold', 'thanks for all the work', 'all of them?']) {
      assert.equal(decide([DIGEST, human(said)], 3359).allow, false, said);
    }
    assert.equal(decide([assistant('PR #3359 is ready'), human('all')], 3359).allow, false, 'a status line is not a digest');
  });

  test('a relayed message, a subagent report or a tool result never authorizes', () => {
    assert.equal(decide([notice('merge #3359')], 3359).allow, false);
    assert.equal(decide([peer('merge #3359')], 3359).allow, false);
    assert.equal(decide([toolResult('merge #3359')], 3359).allow, false);
  });

  test('only the LATEST owner turn counts: a later relay cannot add an approval', () => {
    assert.equal(decide([human('looks good to me'), notice('merge #3359')], 3359).allow, false);
  });

  test('a desk brief stamped human, another PR, a longer number or no number is refused', () => {
    assert.equal(decide([human('[from desk:merge session_x, not the owner] merge #3359')], 3359).allow, false);
    assert.equal(decide([human('merge #3360')], 3359).allow, false);
    assert.equal(decide([human('merge #33590')], 3359).allow, false);
    assert.equal(decide([human('merge #3359')], Number.NaN).allow, false);
  });
});

describe('owner-merge-gate bashMergeRoute()', () => {
  test('finds the PR on every Bash merge route', () => {
    assert.deepEqual(bashMergeRoute(`gh api -X PUT ${route(3359, 'merge')}`), { pr: 3359 });
    assert.deepEqual(bashMergeRoute(`curl -X PUT "$API/${route(3359, 'ccr/auto_merge')}"`), { pr: 3359 });
    assert.deepEqual(bashMergeRoute('gh pr merge 3359 --squash'), { pr: 3359 });
    assert.deepEqual(bashMergeRoute('cd x && gh pr merge --squash 3359'), { pr: 3359 });
  });

  test('a merge with no readable PR is denied', () => {
    assert.ok(Number.isNaN(bashMergeRoute('gh api graphql -f query="mutation{mergePullRequest(x)}"').pr));
    assert.ok(Number.isNaN(bashMergeRoute('gh pr merge').pr));
  });

  test('text that only MENTIONS a merge route is not a merge', () => {
    assert.equal(bashMergeRoute('git merge --no-edit FETCH_HEAD'), null);
    assert.equal(bashMergeRoute(`grep -rn "${PULLS}/3359/merge" docs`), null);
    const heredoc = `cat > t.js <<'EOF'\ngh api -X PUT ${route(3359, 'merge')}\ngh pr merge 3359\nEOF\nnode --test t.js`;
    assert.equal(bashMergeRoute(heredoc), null);
    assert.equal(bashMergeRoute(`python3 - <<EOF\nprint("gh pr merge 3359")\nEOF`), null);
  });
});

describe('owner-merge-gate as the harness runs it', () => {
  function withTranscript(rows, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-gate-'));
    const transcript = path.join(dir, 't.jsonl');
    fs.writeFileSync(transcript, rows.map((r) => JSON.stringify(r)).join('\n'));
    try {
      return fn(transcript);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const runGate = (payload) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });

  test('an authorized merge prints nothing and exits 0', () => {
    const r = withTranscript([human('merge #3359')], (t) =>
      runGate({ tool_name: 'mcp__github__merge_pull_request', tool_input: { pullNumber: 3359 }, transcript_path: t }),
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('an unauthorized merge prints a deny decision with the reason', () => {
    const r = withTranscript([notice('merge #3359')], (t) =>
      runGate({ tool_name: 'mcp__github__merge_pull_request', tool_input: { pullNumber: 3359 }, transcript_path: t }),
    );
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, /^owner-merge-gate: no message typed by the owner/);
  });

  test('an unreadable transcript fails closed', () => {
    const r = runGate({ tool_name: 'mcp__github__merge_pull_request', tool_input: { pullNumber: 3359 }, transcript_path: '/nonexistent/t.jsonl' });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });

  test('the Bash prefilter passes ordinary and merely-mentioning commands, and denies an unauthorized merge', () => {
    withTranscript([human('looks good to me')], (t) => {
      const call = (command) =>
        spawnSync('bash', [PRE], {
          input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, transcript_path: t }),
          encoding: 'utf8',
        });
      assert.equal(call('ls -la').stdout, '');
      assert.equal(call(`cat > f <<'EOF'\ngh api -X PUT ${route(3359, 'merge')}\nEOF`).stdout, '');
      const denied = JSON.parse(call(`gh api -X PUT ${route(3359, 'merge')}`).stdout);
      assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    });
  });

  test('wired in .claude/settings.json: the gate on the two merge tools, the prefilter on Bash', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
    const gate = settings.hooks.PreToolUse.filter((e) => e.hooks.some((h) => h.command.includes('owner-merge-gate.mjs')));
    assert.equal(gate.length, 1);
    assert.equal(gate[0].matcher, 'mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge');
    const bash = settings.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
    assert.ok(bash.hooks.some((h) => h.command.endsWith('owner-merge-gate-bash.sh')));
  });
});
