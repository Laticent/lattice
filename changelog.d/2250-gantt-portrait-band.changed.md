- **Changed: the portrait gantt band's constants carry their measurement.** The
  comment above `GANTT_GEOM_TALL` said the band "carries the same 0.8 the landscape
  one took", which is the mechanism rather than the justification — the overflow it
  fixed was 2.8 viewBox units and the trim spends 24. It now states the margin the
  way the landscape band's comment does: measured on `test/fixtures/chart-fit.md` p9
  at portrait, 68.7px of headroom over a 690.8px stage — 21.2 viewBox units against a
  21-unit bar-row pitch, so the chart holds exactly one more row in reserve. The
  numbers are unchanged; only the reasoning is now checkable. The reserve is one row
  by 0.67px — inside `check-chart-fit`'s own 1.5px slack, and a property of that
  stage rather than of the constants, both now stated. `laneNameH` staying at 15
  while the bar band shrank is recorded as deliberate, with the measurement: the lane
  name's rendered box is 10.8 units sitting 2.36 above and 1.84 below, and at a
  12-unit band the name would cross the lane rule rather than sit tight.
