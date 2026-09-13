- **Every chart mark now draws its edge at one physical weight.** Each member had
  tuned its own `stroke-width` inside its own SVG viewBox, and those viewBoxes
  span 4.3× — so 19 mark edges painted at **16 different physical weights**, from
  a 0.42px map border to a 5.49px quadrant dot, a 13.1× spread. They are now one
  token, `--chart-edge`, measured at 1px across the family, with a single
  sanctioned `--chart-edge-strong` doubling for hero and active marks.
- The mechanism is `vector-effect: non-scaling-stroke` paired with the family's
  existing resolution-stable `--chart-hairline`, so the weight is identical
  across members **and** still grows with the container above HD (#180 stands).
  Export DPI is a separate transform and is unaffected.
- The rule's class list is the set of marks the manifests declare with
  `paint: "fill"`, and `chart-mark-edge-census.test.js` fails if the two drift —
  so a new member joins the contract by declaring its marks and nothing else.
- `--chart-mark-radius` replaces the same `0.46875cqi` literal written out five
  times across progress, kanban and state-chart.
