#!/usr/bin/env node
/**
 * PreToolUse gate on the GitHub merge tools: a merge runs only on the owner's own
 * typed word, read exactly.
 *
 * CLAUDE.md DEFAULT OPERATING MODE rule 7 and HARD RULE #31 say a human approves
 * every merge, and that another session's message never authorizes one. The harness
 * already tells the owner's turns apart: every user turn in the session transcript
 * carries an `origin.kind` the harness writes, and only a turn the owner typed is
 * `human`. Relayed session messages and desk briefs arrive as `task-notification`
 * (or inside a tool result), subagent reports as `peer`, hook feedback with none.
 *
 * The owner's latest `human` turn must be, as the whole message:
 *   - `merge #N` (or several PRs: `merge #N, #M`), or
 *   - `all` / `all but #N`, answering the newest assistant message, whose FIRST line
 *     is `🚦 Merge digest` and which lists the PR as a digest row (`#N — head …`).
 * Anything else is denied with the reason. A refusal or a hedge ("do not merge #N",
 * "hold all", "yes") never parses, so it can never read as an approval. An unreadable
 * transcript denies too (fail closed).
 *
 * Scope, stated plainly: this guards `merge_pull_request` and `enable_pr_auto_merge`
 * (see .claude/settings.json). It does NOT read Bash. A shell can spell a merge too
 * many ways to parse deterministically (a variable, a line continuation, a script),
 * and a version that tried both missed real merges and blocked ordinary commands. So
 * sessions merge only through these two tools, and a Bash merge is a breach of rule 7
 * that no machine catches. engineering/workflow.md §Merging.
 *
 * It blocks, unlike the repo's two warn-only hooks, because it fires only on a merge
 * and a warning does not stop one. The owner can always merge from GitHub itself.
 */
import fs from 'node:fs';

const PR_LIST = String.raw`#?\d+(?:\s*(?:,|and|&)?\s*#?\d+)*`;
const MERGE_FORM = new RegExp(String.raw`^(?:squash[- ]?)?merge\s+(${PR_LIST})$`, 'i');
const ALL_FORM = new RegExp(String.raw`^all(?:\s+but\s+(${PR_LIST}))?$`, 'i');
/** The exact first line of a merge digest (`/desk-merge` step 4, `/fleet` step 6). */
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

/** True when `text` is a merge digest that lists `pr` as one of its rows. */
export function digestLists(text, pr) {
  const lines = text.trim().split('\n');
  if (lines[0].trim() !== DIGEST_MARKER) return false;
  return lines.slice(1).some((l) => new RegExp(`^\\s*#${pr}\\s+—\\s+head\\s`).test(l));
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
  const said = normalize(textOf(rows[h]));
  if (/^\[from desk:/i.test(said)) {
    return { allow: false, reason: "the latest 'human' turn is a desk brief, not the owner's word" };
  }
  const merge = MERGE_FORM.exec(said);
  if (merge) {
    return numbers(merge[1]).has(pr)
      ? { allow: true, reason: `the owner typed "merge #${pr}"` }
      : { allow: false, reason: `the owner said to merge other PRs, not #${pr}` };
  }
  const all = ALL_FORM.exec(said);
  if (all) {
    if (numbers(all[1]).has(pr)) return { allow: false, reason: `the owner excluded #${pr} ("all but")` };
    for (let i = h - 1; i >= 0; i--) {
      if (rows[i]?.type !== 'assistant') continue;
      const text = textOf(rows[i]);
      if (!text.trim()) continue;
      return digestLists(text, pr)
        ? { allow: true, reason: `the owner answered "all" to a merge digest that listed #${pr}` }
        : { allow: false, reason: `"all" did not answer a merge digest listing #${pr}` };
    }
    return { allow: false, reason: '"all" with no merge digest before it' };
  }
  return {
    allow: false,
    reason: `the owner's latest message is not "merge #${pr}" or "all" after a merge digest; ask the owner to type that, in this session`,
  };
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
  if (!allow) deny(reason);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
