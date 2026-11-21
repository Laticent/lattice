#!/usr/bin/env node
/**
 * PreToolUse gate: a merge runs only on the owner's own typed word.
 *
 * CLAUDE.md DEFAULT OPERATING MODE rule 7 and HARD RULE #31 say a human approves
 * every merge, and that another session's message never authorizes one. Before
 * this hook, that rested on the model telling the owner's turn from a relayed one.
 * The harness already tells them apart: every user turn in the session transcript
 * carries an `origin.kind` the harness writes, and only a turn the owner typed is
 * `human`. Relayed session messages arrive as `task-notification` (or inside a tool
 * result), subagent reports as `peer`, hook feedback with no origin.
 *
 * So the rule is mechanical. A merge tool call is allowed only when the most recent
 * `human` turn names the PR (`#3359`, or the bare number) or answers a merge digest
 * with "all" / "all but #N" and the assistant message just before that turn listed
 * the PR. Everything else is denied with the reason, and the owner can still merge
 * from GitHub's own UI. The gate fails closed: an unreadable transcript denies.
 *
 * It fires only on the merge tools (see .claude/settings.json), so it costs nothing
 * on any other call. It blocks, unlike the repo's two warn-only hooks, because a
 * merge is the one irreversible step the owner reserved, and a warning does not
 * stop one. Contract: engineering/workflow.md §Merging.
 */
import fs from 'node:fs';

// The owner's word is read by an exact, whole-message grammar, never by word-spotting:
// a loose match let "do not merge #3359" and "hold all" through (card grader, #3359).
// Extra words, a negation or a hedge make a message fail to parse, so it is denied.
const PR_LIST = String.raw`#?\d+(?:\s*(?:,|and|&)?\s*#?\d+)*`;
const MERGE_FORM = new RegExp(String.raw`^(?:squash[- ]?)?merge\s+(${PR_LIST})$`, 'i');
const ALL_FORM = new RegExp(String.raw`^all(?:\s+but\s+(${PR_LIST}))?$`, 'i');
/** The fixed header a merge digest starts with (`/desk-merge` step 4, `/fleet` step 6). */
export const DIGEST_MARKER = '🚦 Merge digest';

const numbers = (list) => new Set((list || '').match(/\d+/g)?.map(Number) || []);
const normalize = (text) => text.trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');

function textOf(row) {
  const c = row?.message?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c
    .filter((x) => x && typeof x === 'object' && x.type === 'text')
    .map((x) => x.text)
    .join('\n');
}

const isToolResult = (row) =>
  Array.isArray(row?.message?.content) && row.message.content.some((x) => x?.type === 'tool_result');

/**
 * The text of a Bash command that would RUN: heredoc bodies are removed, because
 * they are data written to a file or fed to a program (a test that mentions a merge
 * route is not a merge). The first version of this gate blocked its own test file.
 */
export function runnableText(command) {
  const lines = command.split('\n');
  const out = [];
  let tag = null;
  for (const line of lines) {
    if (tag !== null) {
      if (line.trim() === tag) tag = null;
      continue;
    }
    out.push(line);
    const m = /<<-?\s*(['"]?)([A-Za-z_][\w]*)\1/.exec(line);
    if (m) tag = m[2];
  }
  return out.join('\n');
}

/**
 * The merge routes a Bash command can take, and the PR each names. A REST route
 * counts only on a line that calls `gh api` or `curl`; `gh pr merge` only where a
 * command starts. A merge with no readable PR number (a GraphQL merge mutation, or
 * `gh pr merge` with none) returns pr NaN, which is denied.
 */
export function bashMergeRoute(command) {
  for (const line of runnableText(command).split('\n')) {
    if (/\b(?:gh\s+api|curl)\b/.test(line)) {
      const rest = /pulls\/(\d+)\/(?:merge|(?:ccr\/)?auto_merge)\b/.exec(line);
      if (rest) return { pr: Number(rest[1]) };
      if (/\b(?:mergePullRequest|enablePullRequestAutoMerge)\b/.test(line)) return { pr: Number.NaN };
    }
    const cli = /(?:^|[;&|(]|\$\()\s*gh\s+pr\s+merge\b(?:\s+(?:--?\S+\s+)*#?(\d+))?/.exec(line);
    if (cli) return { pr: Number(cli[1]) };
  }
  return null;
}

/** Decide one call. Returns { allow, reason }. Pure, so the test drives it directly. */
export function decide(rows, pr) {
  if (!Number.isInteger(pr) || pr < 1) return { allow: false, reason: 'the merge call names no PR number' };
  let h = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r?.type === 'user' && !isToolResult(r) && r.origin?.kind === 'human') {
      h = i;
      break;
    }
  }
  if (h < 0) return { allow: false, reason: 'no message typed by the owner in this session' };
  const said = textOf(rows[h]);
  if (/^\s*\[from desk:/i.test(said)) {
    return { allow: false, reason: "the latest 'human' turn is a desk brief, not the owner's word" };
  }
  const said2 = normalize(said);
  const merge = MERGE_FORM.exec(said2);
  if (merge) {
    return numbers(merge[1]).has(pr)
      ? { allow: true, reason: `the owner typed "merge #${pr}"` }
      : { allow: false, reason: `the owner said to merge other PRs, not #${pr}` };
  }
  const all = ALL_FORM.exec(said2);
  if (all) {
    if (numbers(all[1]).has(pr)) return { allow: false, reason: `the owner excluded #${pr} ("all but")` };
    // The digest is the newest assistant message with text before the owner's turn.
    for (let i = h - 1; i >= 0; i--) {
      if (rows[i]?.type !== 'assistant') continue;
      const text = textOf(rows[i]);
      if (!text.trim()) continue;
      if (!text.includes(DIGEST_MARKER)) return { allow: false, reason: `"all" answered a message that is not a merge digest` };
      return new RegExp(`#${pr}(?!\\d)`).test(text)
        ? { allow: true, reason: `the owner answered "all" to a merge digest that listed #${pr}` }
        : { allow: false, reason: `the merge digest the owner answered did not list #${pr}` };
    }
    return { allow: false, reason: '"all" with no merge digest before it' };
  }
  return {
    allow: false,
    reason: `the owner's latest message is not "merge #${pr}" or "all" after a merge digest; ask the owner to type that, in this session`,
  };
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return deny('the hook could not read its input');
  }
  const ti = input.tool_input || {};
  let pr;
  if (input.tool_name === 'Bash') {
    const route = bashMergeRoute(String(ti.command || ''));
    if (!route) return; // not a merge: the Bash prefilter's false alarm, allow silently
    pr = route.pr;
  } else {
    pr = Number(ti.pullNumber ?? ti.pull_number ?? ti.number);
  }
  let rows;
  try {
    rows = fs
      .readFileSync(input.transcript_path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return deny('the session transcript could not be read');
  }
  const { allow, reason } = decide(rows, pr);
  if (!allow) return deny(reason);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `owner-merge-gate: ${reason} (engineering/workflow.md §Merging).`,
      },
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
