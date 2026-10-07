---
origin: 2376
priority: P3
recorded: 2026-09-28
area: infra
severity: low
swimlane: engineering/decisions/2026-09-25-panes-two-components-one-slide.md
source: https://github.com/Laticent/lattice/pull/2376
---

# the overprint probe cannot see a label over a mark that has no role or no fill

why now   — the truncation half of this item is closed (the panes-chart-labels PR: a name painted
            cut short reports as `truncate` on the `CHART LABELS DROPPED` line, and stacked-bar's
            pane budget is measured). What is left: `probeLabelOverprint` judges a label against
            marks that carry `data-anima-role` and a fill, so it cannot see a label printed over
            slope's dots (no role), slope's lines or bullet's target tick (no fill). Slope's
            label-on-label collisions are caught; a label over a slope dot is not.
where     — lib/core/overflow-probe.js probeLabelOverprint (which elements count as marks); the
            slope and bullet kernels (whether their dots and ticks should carry a mark role).
done when — a slope whose end label sits on a neighbor's dot prints a CHART LABELS OVERPRINT line,
            and no shipped deck gains one it should not.
evidence  — the slope render with the dot under the label; the export log before/after.
verify    — tier 1 checker: the probe runs on every export.
