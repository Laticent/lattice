---
origin: 2794
priority: P4
recorded: 2026-10-19
area: website
severity: medium
swimlane: docs/src/components/playground/PlaygroundMap.tsx
source: https://github.com/Laticent/lattice/pull/2794
---

# Check the shipped Playground map for the rail/walk disagreement a second map found

The Playground map shipped to `main` (`PlaygroundMap.tsx`, #f3ea9fe). A second rail, built in parallel and never
opened as a PR, lives on `origin/claude/playground-map-rail-alt` (`MapRail.tsx`, a wireframe tier, live tiles
through `windowFor`, and `docs/e2e/playground-map-rail.spec.ts` at 1440, 820 and 390 plus a webkit-tablet arm).
That branch found one bug worth checking on the shipped map: at 390px, after "Last", the rail said slide 15 while
the walk bar said 14 / 15, because the rail scrolled the filmstrip itself instead of asking the walk (`gotoIndex`).

why now   — the shipped map and the walk bar both claim the reading position; a disagreement at the last slide is a visible bug on a phone.
where     — docs/src/components/playground/PlaygroundMap.tsx and PlaygroundApp.tsx (`gotoIndex`, `reportMapFocus`); the spec on the alt branch.
done when — the alt branch's spec (or one like it) passes against the shipped map at the `mobile` and `desktop` projects: after Last, the map's selected tile and the walk bar's `N / N` agree; then close the alt branch.
evidence  — the spec run and the 390px screenshot.
verify    — tier 2.
