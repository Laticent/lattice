---
origin: 3088
priority: P2
recorded: 2026-11-10
area: engine
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — stacking a kanban's lanes on one page is a new layout decision (when lanes fit, and the measured fallback), not part of the text ladder
source: https://github.com/Laticent/lattice/pull/3088
---

# A kanban at portrait splits one lane per page, leaving most of each page empty

why now   — the owner, looking at the mobile renders (2026-11-10): "kanban being split like that seems odd". At mobile and story a three-lane board splits into one page per lane, and each page holds two or three cards in a page built for ten.
where     — the kanban's portrait split (lib/plugins/chart-family/kinds/kanban/), and the auto-split it rides on (lib/core/auto-split.js).
done when — at mobile and story, a board whose lanes fit one page stacks them on that page (lanes as sections, cards below each heading), and splits only when the stacked lanes overflow; `examples/` kanban decks render without a page that is mostly empty.
