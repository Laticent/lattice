---
origin: 3454
priority: P1
recorded: 2026-11-23
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-23-handoff-folder.md §Implementation slices
deferred: blocked — the owner's usage priorities put it after the weekly reset (Sun 2026-11-29 12:00 UTC); tier C
source: https://github.com/Laticent/lattice/pull/3454#issuecomment-7116728151
---

# Build the handoff folder: `npm run handoff`, `checkHandoffs`, a generated living comment

#3454 merged the design only. The owner picked "This week" for the build (command center,
2026-11-23 12:33 UTC), and the owner's later usage priorities moved it after the weekly reset.
One PR, one commit per slice, in the order the note's §Implementation slices gives.

why now — sessions still hand over through chat and comments alone; the presets takeover lost
  recipes, definitions and the agent count that way (the note's W1–W5).
where — `tools/handoff.js` (new), `checkHandoffs` in `tools/check-ownership.js`,
  `tools/queue-precheck.sh`, `tools/affected-tests.js` `isSkippable`, `biome.jsonc` (a
  `transient` exclusion plus `npm run lint:coverage:bless`), `tools/card.js` `--living`,
  `engineering/workflow.md` §Relay, a new `handoffs.d/README.md`.
done when — the four slices land as the note specifies: shape, secret, size and freshness arms
  each proven able to fail (HARD RULE #34), presence fails only in `merge_group`, the living
  comment is generated from HANDOFF.md with its blob hash, and a cold pickup by a second session
  works from the handoff alone.
evidence — the failing arms and their restored runs in the PR body; the cold pickup's commit and
  living comment.
verify — `npm run build:check`; `node --test` on the new test files; the 🚦 card names the pickup.
