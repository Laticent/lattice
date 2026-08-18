- **Mermaid diagrams now clear WCAG's 3:1 non-text contrast floor in every palette and both
  color schemes.** `--diagram-stroke` draws the outline of fourteen Mermaid keys — node and
  actor borders, gantt bar borders, the pie outer stroke, the quadrant frame, both xy axis
  rules — and every palette declared it as a flat, mode-invariant literal, so on a dark deck
  it was a dark line on a dark canvas. A flowchart node, gantt bar, pie slice and sequence
  actor had **no discernible edge at all in 24 of 64 palette-modes** (worst 1.55:1), and the
  quadrant frame and xy axis rules sat at exactly 1.00:1 on the `a11y-*` family. Retuned to a
  mid-tone in each palette — 12 of 14 changed, `cuoio` and `carbone` already cleared it — plus
  the gantt today marker, and `cuoio`'s edge line. **Diagram colors shift slightly on every
  theme as a result; outlines are lighter, and visibly so on dark decks.**
- **Three Mermaid keys were reading the wrong tier and are re-pointed.** The gantt grid line
  borrowed `--diagram-done` (a pale BAR FILL, 1.30:1 as a line) and now reads `--muted-mark`,
  the graphical de-emphasis tier; the sequence note's border borrowed `--diagram-today` (the
  gantt marker's own hue) and now reads `--diagram-stroke`; the quadrant divider and its
  plotted points read `--cat-8-mark`, a SIBLING of the fills they sit on, and now read
  `--cat-on-fill`, the tier gated legible against them.
- **34 Mermaid theme keys the engine had never stated are now stated.** Left unset, Mermaid
  derives a color from `primaryColor`/`background` by its own mixing — which is where every
  off-palette state diagram, requirement diagram, architecture group box, venn set, C4 person
  glyph and ER row band came from. Now on-palette: the stateDiagram node/transition/composite
  set, the requirementDiagram box and relations, `archEdgeColor`/`archGroupBorderColor`,
  `venn1`–`venn8`, `personBkg`, `rowOdd`/`rowEven`, `border2`, `arrowheadColor` and
  `xyChart.dataLabelColor`. (`nodeBkg` and `compositeBorder` were tried and dropped —
  neither is consumed anywhere in Mermaid 11.14, so stating them asserted a control
  that does not exist.)
- **Known limitation, deliberately not fixed: a sankey's flows are hard to see on dark decks.**
  Mermaid paints every link through an inline `mix-blend-mode: multiply`, which darkens toward
  the backdrop — right on a white page, and on a dark canvas it drives the flow to a near-black
  smudge beside correctly colored node bars. Overriding the blend to `normal` fixes dark and
  **breaks light**: Mermaid paints ribbons ON TOP of node labels, and multiply is what protects
  them, so the labels wash from 15.66:1 to 3.32:1 — below AA. `screen` would be correct on dark,
  but a blend mode must be chosen per color-scheme and no CSS selector can query one. The
  reasoning and the measurements are recorded in `mermaid.css` so the dead end is not re-walked.
- Added `tools/audit-diagram-contrast.mjs`, an on-demand report over the non-text contrast tier
  and a census of which Mermaid color keys are actually levers (measured: it honors all 234 and
  overrides none of ours).
- Added `test/unit/palette/diagram-nontext-contrast.test.js`, which gates the tier above so it
  cannot regress. A shape passes if ANY of its candidate edges clears 3:1 — fill vs canvas,
  border vs canvas, or border vs its own fill — because a node with an invisible border but a
  separating fill is perfectly legible.
- **`state-chart` looks different on light decks.** It is the one non-Mermaid consumer of
  `--diagram-stroke`, using it for the node's leading accent edge. Re-curating that token to a
  mid-tone raises the accent on dark decks (onyx 1.35 → 3.42) and lightens it on light ones
  (onyx 15.91 → 3.44). Nothing drops below the 3:1 floor, but the light accent is visibly
  quieter than it was.
