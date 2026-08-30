- **The pick-surface bake-off is re-run by its harness, and the committed runs are no longer a
  hand transcription.** `tools/intent-bakeoff/pick-surface-agent-runs.json` and its new
  `-confusable` sibling are written by `npm run intent:pick-agents` against both committed
  brief sets, carrying each agent's raw return, per-tool call ledger, `modelUsage` accounting
  and cost.
- **Fixed: the harness under-counted tool calls, including to zero.** `parseStream`
  de-duplicated stream frames by `message.id`, but the CLI splits one assistant message across
  several frames sharing that id — one per content block. An agent that emitted a text or
  `thinking` block before calling `Read` therefore recorded **0 reads** while plainly having
  read its surface, and the full-catalog condition recorded 1-4 reads where it really pays
  10-12. De-duplication
  now keys on the `tool_use` block's own `toolu_…` id, which a re-delivered frame repeats and
  two real calls never share. Each run also stores the per-call ledger the counts derive from,
  so `surface_reads` can be audited from the artifact instead of by paying for another run.
- **`parseStream` is extracted to `tools/intent-bakeoff/parse-stream.mjs` and covered by tests.**
  It was unreachable from a test runner — importing the harness parses `process.argv`, prints a
  plan and exits — so the function producing the headline number could only be exercised by
  spending money on it. Eight fixtures now pin the frame shapes that matter: the block split,
  a re-delivered frame, `supersedes` arriving after what it replaces, and `is_meta`.
