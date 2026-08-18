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
- **36 Mermaid theme keys the engine had never stated are now stated.** Left unset, Mermaid
  derives a color from `primaryColor`/`background` by its own mixing — which is where every
  off-palette state diagram, requirement diagram, architecture group box, venn set, C4 person
  glyph and ER row band came from. Now on-palette: the stateDiagram node/transition/composite
  set, the requirementDiagram box and relations, `archEdgeColor`/`archGroupBorderColor`,
  `venn1`–`venn8`, `personBkg`, `rowOdd`/`rowEven`, `nodeBkg`, `border2`, `arrowheadColor`
  and `xyChart.dataLabelColor`.
- **Fixed: a sankey's flows were invisible on dark decks.** Mermaid paints every link through
  an inline `mix-blend-mode: multiply`, which darkens toward the backdrop — correct on a white
  page, and on a dark canvas it drove the entire diagram to a near-black smudge while the node
  bars stayed correctly colored.
- Added `tools/audit-diagram-contrast.mjs`, an on-demand report over the non-text contrast tier
  and a census of which Mermaid color keys are actually levers (measured: it honors all 234 and
  overrides none of ours).
- Added `test/unit/palette/diagram-nontext-contrast.test.js`, which gates the tier above so it
  cannot regress. A shape passes if ANY of its candidate edges clears 3:1 — fill vs canvas,
  border vs canvas, or border vs its own fill — because a node with an invisible border but a
  separating fill is perfectly legible.
