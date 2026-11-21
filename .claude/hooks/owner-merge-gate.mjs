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

const MERGE_WORDS = /\b(merge|merged|ship|squash|go|yes|approve|approved|lgtm)\b/i;
const ALL_WORDS = /\ball\b/i;

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
  const named = new RegExp(`(^|[^\\d])#?${pr}(?!\\d)`).test(said);
  const excluded = new RegExp(`\\bbut\\b[^\\n]*#?${pr}(?!\\d)`, 'i').test(said);
  if (named && !excluded && MERGE_WORDS.test(said)) return { allow: true, reason: `the owner said to merge #${pr}` };
  if (ALL_WORDS.test(said) && !excluded) {
    for (let i = h - 1; i >= 0; i--) {
      const r = rows[i];
      if (r?.type !== 'assistant') continue;
      if (new RegExp(`#${pr}(?!\\d)`).test(textOf(r))) {
        return { allow: true, reason: `the owner answered "all" to a digest that listed #${pr}` };
      }
      break;
    }
  }
  return {
    allow: false,
    reason: `the owner's latest message does not authorize merging #${pr}; ask the owner, in this session, to merge it`,
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
  const pr = Number(ti.pullNumber ?? ti.pull_number ?? ti.number);
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
