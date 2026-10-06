- **Graph charts cross fewer lines.** When a flowchart's or a state chart's layout routes
  with a crossing, Trama now tries dagre's other two rankers. A wrapped state chart may also
  move one line break by one shape, or turn its lines the other way, keeping reading order,
  but only when that clears every crossing. On the shipped state-chart slides, crossings fall
  from 9 to 4. The stress deck's incident machine now reads in three columns with no
  crossing, where it had two cramped lines and a crossing. A layout that routes clean is
  unchanged. A chart that crosses takes longer to lay out: the incident machine takes 93–152 ms
  per layout, up from 47–66 ms.
