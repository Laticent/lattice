- **Every chart mark that draws an OUTLINE now draws it at one physical weight.**
  Each member had tuned its own `stroke-width` inside its own SVG viewBox, and
  those viewBoxes span 4.3× — so the family's declared marks painted at **21
  different physical weights**, from a 0.42px map border to a 2.9px pie wedge, a
  6.9× spread. Now **21 mark classes sit at exactly 1px** through one token,
  `--chart-edge`.
- **It is not one weight overall, and the remainder is deliberate.** Eight
  distinct weights remain over a 2.2× spread: the 1px outlines, one sanctioned
  `--chart-edge-strong` doubling on `state-chart`'s start and terminal nodes, and
  **seven knockouts** — `funnel-band`, `line-dot`, `quadrant-dot`,
  `quadrant-trail-after`, `radar-dot`, `scatter-dot`, `sbar-seg` — which stroke in
  `var(--bg)` to hold two touching marks apart. A knockout's width follows what it
  separates, not the family's outline weight; folding them in took quadrant's
  separator from 2.23px to 1.00px.
- The mechanism is `vector-effect: non-scaling-stroke` paired with the family's
  existing resolution-stable `--chart-hairline`, so the weight is identical
  across members **and** still grows with the container above HD (#180 stands).
  Export DPI is a separate transform and is unaffected.
- **The export used to lose both properties.** `flattenSvgStyles` — the path
  behind every PDF, PPTX, image-set and standalone-SVG export — carried no
  `vector-effect`, and omitted `stroke-width` whenever it equalled the CSS initial
  of `1px`, which is exactly what `--chart-edge` resolves to at HD. A pinned 1px
  edge therefore arrived in the exported file with neither, and fell back to one
  viewBox USER unit: measured by driving both versions of the flattener over the
  same live SVGs, a map edge came back at 0.84px and a scatter BUBBLE at 2.46px.
  (Not the scatter dot — that is a knockout with an explicit 0.9, which is not the
  initial and was never dropped.) A stroked element now never drops either. The
  cost is **+2.7% to +8.2% bytes per exported SVG**, and on the Mermaid path,
  where nothing carries `non-scaling-stroke`, those declarations are all no-ops.
- `chart-mark-edge-census.test.js` ties the shared rule to the marks each manifest
  declares `paint: "fill"`, so a new member joins by declaring its marks. Three
  ways around it are closed: a declared mark carrying `paint-order` (the pie
  wedge) is no longer exempt, a width written as a presentation attribute in a
  transform is now caught, and a `:hover` rule no longer qualifies a mark as a
  knockout. Each arm is mutation-proved.
- `tools/chart-structure-census.js` reports the family's widths, radii and gaps in
  **physical pixels** and `--check`s that every outline is pinned. Re-derive any
  number above with it.
