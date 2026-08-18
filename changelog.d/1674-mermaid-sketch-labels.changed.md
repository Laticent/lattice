- **Fixed: `mode: sketch` now reaches Mermaid diagram labels.** Text inside a
  rendered diagram stayed in the machine mono face, so a hand-drawn deck wrapped
  hand-drawn shapes around machine-faced labels. The export rendered through the
  `mmdc` binary, whose page carries none of the engine's fonts, so Mermaid measured
  every label in a fallback face and the deck then painted it in the real one —
  hand type clipped mid-word, and mono only escaped because its stack ends in the
  `monospace` generic. Diagrams now render in a page the engine owns, with the
  engine's `@font-face` loaded and awaited before Mermaid measures anything.
- **Changed: exported diagram labels use the deck's body face, not JetBrains Mono.**
  Both render paths read `--font-body` now, so an exported diagram matches its preview.
  Off `sketch` that means the deck's body sans where the export previously used mono;
  under `sketch` it is the hand face. **This resizes existing diagrams**: a proportional
  face sets narrower labels than mono, and a Mermaid node is sized from its label.
  Measured across three committed decks, node widths come in **3–16% narrower** (the
  widest labels move most); every committed diagram PDF in the repo was re-rendered in
  this change. Nothing is clipped — the box is measured in the face it is painted in,
  which is the point — but a deck with hand-tuned diagram spacing will reflow.
- **Fixed: one malformed diagram no longer costs a deck its other diagrams' speed.**
  The batched render was all-or-nothing — an unparseable fence sent every diagram in
  the deck back through the one-at-a-time path. Failures are now isolated per diagram.
- **Changed: sketch reaches diagram TYPE even where it cannot reach diagram SHAPE.**
  On `a11y-*`, `onyx` and `concrete` — and in the `--print` band — nodes stay
  machine-drawn so the per-category texture survives, but labels take the hand face.
  Legacy-renderer families (sequence, gantt, pie, journey, timeline, quadrant,
  mindmap) likewise keep crisp shapes and gain hand type.
