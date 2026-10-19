---
origin: 2794
priority: P4
recorded: 2026-10-19
area: website
severity: medium
swimlane: docs/src/components/playground/PlaygroundApp.tsx
source: https://github.com/Laticent/lattice/pull/2794
---

# Reconcile the two Playground slide maps

Two sessions built a Playground slide map in parallel. `origin/claude/veduta-map-rail` (another session, 16
commits) holds `PlaygroundMap.tsx`, `StudioMap.tsx` and `rendered-index.ts`. `origin/claude/playground-map-rail-alt`
(no PR) holds a second rail, `MapRail.tsx`, with a wireframe tier, live tiles through `windowFor` (pip policy), a
Playwright spec at three widths and WebKit tablet, and one fix worth keeping: the rail drives the walk's own
`gotoIndex`, so the rail and the walk bar agree at the last slide on a phone (found at 390px: rail 15, walk 14).

Pick one map. Port the `gotoIndex` fix and the spec onto it, and close the other branch. The owner decides which.

why now   — two maps for one preview is one too many, and the other session's branch is still open.
where     — docs/src/components/playground/PlaygroundApp.tsx; the two branches named above.
done when — one map ships, the other branch is closed, and the shipped map has an e2e that passes at 1440, 820 and 390 and on webkit-tablet with the rail and the walk bar showing the same position after First / Last.
evidence  — the e2e run and the three-width screenshots.
verify    — tier 2.
