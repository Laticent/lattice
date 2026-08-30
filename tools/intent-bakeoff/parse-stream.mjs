#!/usr/bin/env node

// Extracted from pick-surface-agent-eval.mjs so the accounting can be TESTED without the
// paid CLI path. The harness is a script: importing it parses process.argv, prints a plan
// and calls process.exit, so a test runner cannot reach the function inside it. That is
// exactly how the #1897 defect below survived — the highest-risk function in the harness
// was reachable only by spending money on it.

/**
 * Parse the `stream-json` transcript. The final `type:"result"` event carries usage,
 * cost and permission_denials; every assistant message may carry `tool_use` blocks,
 * which is the only place a per-tool count can come from (the `json` output format
 * reports usage but not tool calls).
 *
 * Two frame classes are skipped rather than counted. `is_meta` assistant frames are
 * synthesized by the CLI and can carry a fabricated `tool_use` block no model emitted.
 * A frame carrying `supersedes` replaces already-delivered messages, so counting both it
 * and what it replaces double-counts.
 *
 * DE-DUPLICATION KEYS ON THE `tool_use` BLOCK'S OWN ID, NOT ON `message.id` — and the
 * difference is the whole reason the first harness-written run had to be thrown away.
 * The CLI splits ONE assistant message across SEVERAL stream frames that all share a
 * single `message.id`, one frame per content block. Keying on `message.id` therefore kept
 * the first frame of each message and dropped the rest — so an answer that emitted a text
 * preamble (or a `thinking` block) before calling Read recorded ZERO reads. Measured on a
 * real transcript: four assistant frames, two distinct `message.id`s, the Read sitting in
 * the SECOND frame of the first id, `surface_reads` reported 0 while the agent had plainly
 * read the file. The full-catalog condition was under-counted the same way, which matters
 * more: its read count is the entire basis of the paginated-read argument.
 *
 * A `tool_use` block carries a unique `toolu_…` id. A re-delivered frame repeats that id;
 * two genuine calls never share one. So it de-duplicates exactly what `message.id` was
 * reaching for without collapsing the block split. The resulting ledger is stored on the
 * run as `tool_calls`, so the count can be audited later without the raw stream — the
 * absence of that ledger is why this defect could only be found by re-running.
 */
export function parseStream(stdout) {
  const toolUses = {};
  const superseded = new Set();
  const perFrame = [];
  let result = null;
  for (const line of stdout.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(s); } catch { continue; }
    if (ev.type === 'result') { result = ev; continue; }
    if (ev.type !== 'assistant' || ev.is_meta) continue;
    const content = ev?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const u of ev.supersedes ?? []) superseded.add(u);
    const calls = content
      .filter((b) => b?.type === 'tool_use')
      .map((b) => ({ id: b.id ?? null, name: b.name }));
    if (calls.length) perFrame.push({ uuid: ev.uuid ?? null, calls });
  }
  const seenCalls = new Set();
  const toolCalls = [];
  for (const { uuid, calls } of perFrame) {
    if (uuid !== null && superseded.has(uuid)) continue;
    for (const call of calls) {
      // A re-delivered frame repeats the same `toolu_…`; two real calls never share one.
      // A block with no id cannot be de-duplicated, so it is counted — under-counting a
      // read is the failure this function already shipped once.
      if (call.id !== null) {
        if (seenCalls.has(call.id)) continue;
        seenCalls.add(call.id);
      }
      toolUses[call.name] = (toolUses[call.name] || 0) + 1;
      toolCalls.push(call);
    }
  }
  return { toolUses, toolCalls, result };
}
