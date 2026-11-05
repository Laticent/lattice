---
origin: 3040
priority: P1
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §2
deferred: off-path — another spec's time budget; PR #3040 does not touch the export or the slide rail
---

# `export-photo-size` waits 15 s for a multi-megabyte deck's slide rail, and misses on a loaded runner

`docs/e2e/export-photo-size.spec.ts` builds a deck from three phone photos (several megabytes of text) and then waits up
to 15 s for 4 slides in the slide rail. On a loaded CI runner the rail arrived just after that deadline, and the failure
screenshot, taken a moment later, shows all 4 slides. Heads of PR #3040 with the same app code passed (`80ecf10`,
`b1ea8bd`), and the two that failed changed only a probe script or a spec plus docs. The test took 2.0 min on PR #3042,
which has none of #3040's changes, against 1.1 min on a passing #3040 head, and passed 4 of 4 locally. A re-run passed.

The fix is one deadline sized to the deck it builds, the way `editor-lint` already sizes its wait for a 501-card deck.

done when — the rail assertion's deadline scales with the deck it waits on, and `export-photo-size` has not missed it in
20 consecutive `docs-site` runs.
