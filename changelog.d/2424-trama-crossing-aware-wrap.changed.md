- **Graph charts cross fewer lines.** When a flowchart's or a state chart's layout routes
  with a crossing, Trama now tries dagre's other two rankers. When a wrapped state chart's
  layout crosses, Trama tries moving one line break by one shape, then turning the lines the
  other way. It keeps either change only when that clears every crossing, and reading order is
  kept. On the shipped state-chart slides, crossings fall from 9 to 4. A layout that routes
  clean is unchanged, and live typing in the Studio is as fast as before.
