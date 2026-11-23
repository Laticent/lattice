---
origin: 3465
priority: P2
recorded: 2026-11-23
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md F10
deferred: off-path — a late reflow in the Coach panel that was already on main; #3465 changes Present and adds the check that found it
source: https://github.com/Laticent/lattice/pull/3465
---

# The Coach panel's tabs jump 448 px down after the panel opens

why now   — #3465 added `watchStillness` (docs/e2e/stillness.ts), which fails a test when a control moves after its
            input (flaky shape F10). A census with it over the panels that mount found one case beside Present's Stage:
            on desktop (1440), 6 to 16 frames after "Toggle Coach" opens the panel, its tabs ("Top fixes", "Weakest
            slide", "Structure", "The ask") move from y 304 to y 752, in 3 of 6 runs. Something above them renders late
            and pushes them, so a click aimed at a tab in that window lands on whatever slid under the pointer.
            webkit-tablet and gecko showed none in the same census.
where     — docs/src/components/studio/coach/ (the panel, and whatever renders above the tabs after first paint).
            Reproduce: `watchStillness(page, 'body')`, then `openArchitect(page)`, `layoutSettled` twice around
            `schedulerDrained(page, 8)`, and read `unexpected()`.
done when — the Coach panel opens in its final layout (or reserves the late content's space), and a spec holds it with
            `watchStillness` on desktop, webkit-tablet and gecko, with a failing arm.
