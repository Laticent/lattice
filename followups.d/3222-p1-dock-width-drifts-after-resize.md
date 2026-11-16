---
origin: 3222
priority: P1
recorded: 2026-11-15
area: website
severity: low
swimlane: engineering/decisions/2026-11-15-one-side-pane.md §4
deferred: off-path — window-resize sizing of the docked pane, not the one-pane slot this PR changed
source: https://github.com/Laticent/lattice/pull/3222
---

# A docked pane comes back wider after the window shrinks and grows again

why now   — With one pane open at 1440, resizing the window to 1100 and back leaves the pane at 371px instead of
            its 320 default. The panels are sized in percentages: at 1100 the pane hits its 280px floor, and that
            larger share carries back up. Two docks used to hide it, because their fold re-ran the ideal layout.
where     — docs/src/components/studio/dock-layout.ts (idealDockLayout), the resize path in StudioShell
            (useResizableSplit), react-resizable-panels' percentage layout.
done when — a pane the author never dragged returns to DOCK.default after a resize down and back, and a pane
            they did drag keeps their width; docs/e2e/studio-dock-sizing.spec.ts asserts 320 again.
evidence  — measured 371px on the built Studio (PR 3222, "a resize down and back" test).
verify    — tier 2: the dock-sizing e2e spec on the desktop project.
