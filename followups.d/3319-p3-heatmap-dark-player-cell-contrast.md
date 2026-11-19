---
origin: 3319
priority: P3
recorded: 2026-11-19
area: chart
severity: medium
swimlane: lib/plugins/chart-family/kinds/heatmap/heatmap.docs.md (Data shape: "five tones ... AA contrast")
deferred: off-path — #3319 changes what a heatmap SAYS, not how it is drawn; the slide renders the same on main
source: https://github.com/Laticent/lattice/pull/3319
---

# Heatmap cell values look low-contrast on the lightest cells of a dark-mode player

why now   — The heatmap docs promise that binning into five tones keeps every printed value at AA contrast. In a
            dark-mode `--player` export of a 3x3 grid, the values on the two or three lightest cells (62, 71, 80 in
            the sample) read as dark text on mid-blue, visibly fainter than every other label on the slide.
where     — lib/plugins/chart-family/kinds/heatmap/heatmap.styles.css and the ramp tokens the dark theme supplies;
            the player's dark mode (`--player-mode dark`) is where it showed.
done when — every printed value on every ramp step measures at least 4.5:1 against its own cell in light and dark,
            on the player and the Studio preview, or the docs stop promising it.
evidence  — the screenshot heatmap-dark.png sent on #3319 (deck: 3 rows x 3 cols, indaco, `--player --narrate
            --player-mode dark`). A quick script measurement was unreliable (it paired the wrong text with
            each cell), so no ratio is recorded here: measure first with the repo's own contrast tooling.
verify    — render the same deck on main and on the fix, dark and light, and read the ratio per cell.
