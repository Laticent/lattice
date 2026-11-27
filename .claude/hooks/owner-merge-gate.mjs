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
 * The owner's latest word decides. It is either a `human` turn that is, as the whole message:
 *   - `merge #N` (or several PRs: `merge #N, #M`), or
 *   - `all` / `all but #N`, answering the NEWEST `🚦 Merge digest` before it, however much
 *     text came between (the marker is a line of its own, fenced or not), when that digest
 *     lists the PR as a row (`#N — head …`);
 * or the owner's answer to a question about merging (a real `AskUserQuestion` call, recorded
 * as `user_temporary`) whose chosen option starts with `#N`, or is "All …" over `#N` options
 * (owner's decision, 2026-11-27). Anything else is denied with the reason. A refusal or a
 * hedge ("do not merge #N", "hold all", "yes", an option that says hold) never parses, so it
 * can never read as an approval. A subagent's call, and an unreadable transcript, deny too.
 *
 * Scope, stated plainly: this guards `merge_pull_request` and `enable_pr_auto_merge`
 * (see .claude/settings.json). It does NOT read Bash. A shell can spell a merge too
 * many ways to parse deterministically (a variable, a line continuation, a script),
 * and a version that tried both missed real merges and blocked ordinary commands. So
 * sessions merge only through these two tools, and a Bash merge is a breach of rule 7
 * that no machine catches. engineering/workflow.md §Merging.
 *
 * Night mode (the owner's decision, 2026-11-21): when the owner's latest typed turn is
 * exactly "good night" or "afk", in a session the owner opened with a typed `/desk-night`,
 * less than NIGHT_HOURS ago, and the call is not a subagent's, the gate allows a merge only
 * of a PR that tools/night-eligible.mjs finds eligible on GitHub. The gate runs that tool
 * as it is on `origin/main`, not the working tree, so editing the file does not loosen it
 * (a session that repoints its local `origin/main` ref, or edits this hook, still can: the
 * same class as a forged transcript, which no hook can stop). The authority ends with the owner's next typed turn in that session,
 * or after NIGHT_HOURS. engineering/workflow.md §Desks, "Night mode".
 *
 * It blocks, unlike the repo's two warn-only hooks, because it fires only on a merge
 * and a warning does not stop one. The owner can always merge from GitHub itself.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PR_LIST = String.raw`#?\d+(?:\s*(?:,|and|&)?\s*#?\d+)*`;
const MERGE_FORM = new RegExp(String.raw`^(?:squash[- ]?)?merge\s+(${PR_LIST})$`, 'i');
const ALL_FORM = new RegExp(String.raw`^all(?:\s+but\s+(${PR_LIST}))?$`, 'i');
/** The owner's word that hands the night desk merge authority until their next turn. */
const NIGHT_FORM = /^(?:good ?night|afk)$/i;
/** How long a "good night" lasts if the owner never comes back to the session. */
export const NIGHT_HOURS = 12;
const DESK_NIGHT = '<command-name>/desk-night</command-name>';
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

/**
 * True when `text` holds a merge digest that lists `pr` as one of its rows. The marker is a
 * line of its own (it may sit inside a fenced block, after other text); the rows are the
 * lines after it. A marker inside a sentence is not a digest.
 */
export function digestLists(text, pr) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === DIGEST_MARKER);
  if (at < 0) return false;
  return lines.slice(at + 1).some((l) => new RegExp(`^\\s*#${pr}\\s+—\\s+head\\s`).test(l));
}

const hasDigest = (text) => text.split('\n').some((l) => l.trim() === DIGEST_MARKER);

/** The ids of the session's `AskUserQuestion` calls, so an answer can be tied to a real one. */
function askIds(rows) {
  const ids = new Set();
  for (const r of rows) {
    if (r?.type !== 'assistant' || !Array.isArray(r.message?.content)) continue;
    for (const c of r.message.content) if (c?.type === 'tool_use' && c.name === 'AskUserQuestion' && c.id) ids.add(c.id);
  }
  return ids;
}

/**
 * True when `row` is the owner's own answer to a question (owner's decision, 2026-11-27): the
 * result of a real `AskUserQuestion` call, carrying its answers, that the harness records as a
 * permission the owner gave in person (`user_temporary`). A permission prompt the owner approved
 * for any other tool carries `user_temporary` too, so all three must hold.
 */
export function isOwnerAnswer(row, asks) {
  const res = row?.toolUseResult;
  return (
    row?.type === 'user' &&
    isToolResult(row) &&
    row.permissionDecision?.source === 'user_temporary' &&
    Boolean(res) &&
    typeof res.answers === 'object' &&
    res.answers !== null &&
    Array.isArray(res.questions) &&
    row.message.content.some((x) => x?.type === 'tool_result' && asks.has(x.tool_use_id))
  );
}

/** A label that holds a PR back approves nothing. */
const NEGATION = /\b(hold|held|don'?t|do not|not|skip|wait|leave|never|stop|close|later|no)\b/i;
/** The PR a label is about: a `#N` at its very start ("#3442 vault, VERY HIGH"). */
const labelPr = (label) => Number(/^\s*#(\d+)\b/.exec(label)?.[1]) || 0;

/**
 * The PRs one question-tool answer approves. Only a question about merging counts. A chosen
 * option that starts with `#N` approves #N; a chosen option that starts with "All" approves
 * every `#N` option of that question; a label with a holding word approves nothing; free text
 * typed as "Other" matches no option and approves nothing.
 */
export function answerApproves(result) {
  const prs = new Set();
  for (const q of result?.questions || []) {
    if (!/\bmerg(e|es|ed|ing)\b/i.test(q?.question || '')) continue;
    const answer = String(result.answers?.[q.question] ?? '');
    const labels = (q.options || []).map((o) => String(o?.label || '')).filter(Boolean);
    for (const label of labels.filter((l) => answer.includes(l))) {
      if (NEGATION.test(label)) continue;
      if (/^\s*all\b/i.test(label)) {
        for (const o of labels) if (labelPr(o) && !NEGATION.test(o)) prs.add(labelPr(o));
      } else if (labelPr(label)) prs.add(labelPr(label));
    }
  }
  return prs;
}

/**
 * Decide one call. Returns { allow, reason }. Pure, so the test drives it directly.
 * `night(pr)` answers whether night mode may merge the PR: { eligible, reasons }.
 */
export function decide(rows, pr, night = () => ({ eligible: false, reasons: ['night mode was not checked'] }), now = Date.now()) {
  if (!Number.isInteger(pr) || pr < 1) return { allow: false, reason: 'the merge call names no PR number' };
  const asks = askIds(rows);
  let h = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (isOwnerAnswer(r, asks)) {
      const prs = answerApproves(r.toolUseResult);
      return prs.has(pr)
        ? { allow: true, reason: `the owner chose #${pr} in a question about merging` }
        : { allow: false, reason: `the owner's latest answer does not approve merging #${pr}` };
    }
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
  if (NIGHT_FORM.test(said)) {
    const opened = rows.slice(0, h).some((r) => {
      if (r?.type !== 'user' || isToolResult(r) || r.origin?.kind !== 'human') return false;
      const t = textOf(r).trimStart();
      return t.startsWith(DESK_NIGHT) || (t.startsWith('<command-message>') && t.includes(DESK_NIGHT) && !/^\[from desk:/i.test(t));
    });
    if (!opened) return { allow: false, reason: 'night mode works only in a session the owner opened with a typed /desk-night' };
    // The owner may be back without a new 'user' row: a message typed mid-turn is queued as an
    // attachment, and an answer to a question is a tool result. Either ends the night (fail closed).
    const back = rows.slice(h + 1).some(
      (r) =>
        (r?.type === 'attachment' && r.attachment?.type === 'queued_command' && !['peer', 'task-notification', 'channel'].includes(r.attachment?.origin?.kind)) ||
        (r?.type === 'user' && isToolResult(r) && r.toolUseResult?.answers),
    );
    if (back) return { allow: false, reason: 'night mode: the owner has written since "good night" (a queued message or an answer), so the night is over' };
    const at = Date.parse(rows[h].timestamp);
    if (!Number.isFinite(at) || now - at > NIGHT_HOURS * 3600_000) {
      return { allow: false, reason: `night mode: the owner's "${said}" is more than ${NIGHT_HOURS} hours old, or has no time` };
    }
    const n = night(pr);
    if (n?.eligible === true) return { allow: true, reason: `night mode: the owner said "${said}", and #${pr} passed tools/night-eligible.mjs` };
    const why = Array.isArray(n?.reasons) && n.reasons.length ? n.reasons.join('; ') : 'the eligibility check gave no answer';
    return { allow: false, reason: `night mode: #${pr} is not eligible: ${why}` };
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
    // The NEWEST digest before "all" decides, however much text came between (owner's
    // decision, 2026-11-27); an older digest never counts once a newer one was posted.
    for (let i = h - 1; i >= 0; i--) {
      if (rows[i]?.type !== 'assistant') continue;
      const text = textOf(rows[i]);
      if (!hasDigest(text)) continue;
      return digestLists(text, pr)
        ? { allow: true, reason: `the owner answered "all" to the newest merge digest, which listed #${pr}` }
        : { allow: false, reason: `the newest merge digest before "all" does not list #${pr}` };
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

/** The web session id (`session_…`) the PR trailers carry, from the harness's `cse_…`. */
function webSession() {
  const id = process.env.CLAUDE_CODE_REMOTE_SESSION_ID || '';
  return /^cse_[A-Za-z0-9]+$/.test(id) ? `session_${id.slice(4)}` : '';
}

/**
 * Run tools/night-eligible.mjs, as it is on origin/main, for one PR; anything but a clean
 * "yes" is a no (fail closed).
 */
function nightCheck(pr) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const src = spawnSync('git', ['show', 'origin/main:tools/night-eligible.mjs'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  if (src.status !== 0 || !src.stdout) return { eligible: false, reasons: ['tools/night-eligible.mjs is not on origin/main'] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'night-'));
  const tool = path.join(dir, 'night-eligible.mjs');
  fs.writeFileSync(tool, src.stdout);
  let r;
  try {
    r = spawnSync(
    process.execPath,
      ['--no-warnings', tool, String(pr), '--session', webSession(), '--json'],
      { encoding: 'utf8', timeout: 20_000, env: { ...process.env, NODE_USE_ENV_PROXY: '1' } },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  try {
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    if (r.status === 0 && out.eligible === true && out.pr === pr) return { eligible: true, reasons: [] };
    return { eligible: false, reasons: out.reasons?.length ? out.reasons : [`the check exited ${r.status}`] };
  } catch {
    return { eligible: false, reasons: [`the eligibility check could not run (${(r.stderr || '').trim().split('\n')[0] || `exit ${r.status}`})`] };
  }
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
  // A subagent's merge call never counts, day or night: the owner's word is to this session.
  if (input.agent_id || input.agent_type) return deny("a subagent's merge call never counts; merge from the session itself");
  const { allow, reason } = decide(rows, pr, nightCheck);
  if (!allow) deny(reason);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    deny(`the gate failed (${err.message}), so it refuses`);
  }
}
