---
origin: 2704
priority: P3
recorded: 2026-10-17
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md §11a.5
source: red-team of the Veduta audit; reproduced on docs/src/lib/fuoco/dist/index.mjs
---

# Fuoco reports can cancel a deferred move, read stale focus, and cannot be quiet

why now   — a scrolling stage (the Playground filmstrip, a Veduta stage) reports the hub during reflow and nav; three defects bite there.
where     — docs/src/lib/fuoco/hub.ts `report`, `reportUnit`, the delivery queue.
done when — (a) a report that changes nothing leaves `deferred` and `waitingStep` alone; (b) reports are evaluated after queued publications apply; (c) `reportUnit` takes `quiet`. Each has a failing arm in hub.test.ts.
evidence  — (a) `go('editor',{unitIndex:3},{after:B})`, then `reportUnit('stage',{unitIndex:1})` on the focused unit, then `update(B)`: focus stays 1. (b) map `go(3)` with a stage listener reporting 2 then 3 ends at focus 2, origin stage.
verify    — hub.test.ts model run with FUOCO_RUNS=5000.
