- **Fixed: a status word means the same thing in every chart, whatever its
  case.** `AT-RISK`, `At-risk` and `at-risk` now color alike in `progress`,
  `timeline-list`, `state-chart` and `slope`, as they already did in `gantt`
  and `kanban`. Before, `progress` and `timeline-list` painted a capitalized word
  in the info fallback, and `state-chart` and `slope` dropped it into the label.
  The pill keeps your spelling, and the state-chart narration no longer reads
  the word as part of the state's name. All six components share one rule,
  `chartStatus` in `_chart-family/transform-utils.js`.
