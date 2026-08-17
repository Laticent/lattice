- The decisions index is now budgeted per ROW, not per file. `npm run decisions:index`
  and `decisions:index:check` fail a note whose index row exceeds `ROW_CAP` (285
  characters) — the filename is rendered twice per row and paid on every read, so an
  over-long slug is the lever the message names. A file total is deliberately not
  gated: it would bill the PR that trips it for 424 predecessors' contributions,
  which is the aggregate mistake #1547 already removed from this generator.
- `2026-08-17-context-index-tiering.md` rule 1 restated with measurements. The old form
  ("an index over ~10k tokens has failed") was unreachable for a 424-note corpus and
  neither exit it proposed reached the target; the budget now depends on the access
  mode the routing prescribes — read-whole indexes hold ≤10k, grep-first indexes budget
  the row.
- `2026-08-17-component-pick-surface.md` records the discriminating follow-up it named
  as missing: 12 pre-registered briefs drawn from the confusable clusters, four Opus
  agents, one surface each.
