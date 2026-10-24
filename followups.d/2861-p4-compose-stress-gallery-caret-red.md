---
origin: 2861
priority: P4
recorded: 2026-10-23
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2861
---

# Two compose-stress e2e tests fail on main: inserting from the gallery leaves the caret on slide 1

`docs/e2e/compose-stress.spec.ts` "inserting from the gallery puts the caret in the new slide" (line 476) and "@parity inserting from the gallery reveals the new slide, taking focus only on a fine pointer" (line 500) fail on the `desktop` project at `810f3a7` (the main commit this work branched from), before any change on the branch `claude/compose-clicks-followups-eghkp9`: the active slide stays 0 where the test expects 2. Found while running the compose e2e specs for #2861's follow-ups; reproduced on main with the branch's changes stashed. Not diagnosed. The gallery insert reaches Compose as an outside source change (`resyncFrom`), so the first place to look is whatever moves the caret to the new slide after the re-import.

done when — both tests pass on `desktop`, or the root cause is recorded and the tests are corrected if they pin behavior that changed on purpose.
