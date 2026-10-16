- **Graph charts cross fewer lines.** When a flowchart's or a state chart's layout routes
  with a crossing, Trama now tries dagre's other two rankers. When a wrapped state chart's
  layout crosses, Trama tries moving one line break by one shape, then turning the lines the
  other way. It keeps either change only when that clears every crossing, and reading order is
  kept. On the shipped state-chart slides, crossings fall from 9 to 4. A layout that routes
  clean is unchanged, and live typing in the Studio is as fast as before.
- **`rearrange`, a new state-chart and flowchart modifier.** A chart that wraps onto several
  lines places its states in the order you wrote them, so a side state written last (Blocked,
  Escalated) can end up far from the state it leaves, with lines running back across the
  chart. With `rearrange`, the chart may move such a state beside its neighbor, ordering by
  the graph (Coffman–Graham), but only when that crosses fewer lines or takes a line off a
  state it ran through. A chart with nothing to fix draws as before. On the shipped state-chart slides, crossings fall from 4 to 2. It is
  off unless you add it: `<!-- _class: state-chart rearrange -->`.
