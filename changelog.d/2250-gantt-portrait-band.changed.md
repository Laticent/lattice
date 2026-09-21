- **Changed: the portrait gantt band's constants carry their measurement.** The comment
  above `GANTT_GEOM_TALL` said the band "carries the same 0.8 the landscape one took",
  which is the mechanism rather than the justification — the overflow it fixed was 2.8
  viewBox units and the trim spends 24. It now states the margin the way the landscape
  band's does: on `test/fixtures/chart-fit.md` p9 at portrait, 68.7px of headroom, 21.2
  viewBox units against a 21-unit bar-row pitch, so the chart holds one more row in
  reserve — by 0.67px, which is inside `check-chart-fit`'s own slack and a property of
  that stage rather than of the constants. `laneNameH` staying at 15 while the bar band
  shrank is recorded as deliberate: at 12 the lane name would cross the lane rule.
  The numbers are unchanged; only the reasoning is now checkable.
