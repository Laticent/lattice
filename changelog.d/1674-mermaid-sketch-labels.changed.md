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
- **Fixed: C4, journey, sequence and timeline diagrams now follow the deck's font too.**
  Those four families carry their own per-element `*FontFamily` config keys, defaulted to
  Open Sans / trebuchet ms, which the global theme variable never touched — so a
  `mode: sketch` deck rendered a C4 context diagram with 33 of its 34 labels in Open Sans
  while the rest of the slide was hand-drawn. All of them (22 for C4 alone, counting the
  `external_`, `_db` and `_queue` shape variants) now take the deck's body face.
- **Fixed: the live preview was handing Mermaid a color as its font family.** The
  preview's palette reader resolves colors by probing `color: var(--token)`, which is how
  `light-dark(...)` reaches Mermaid as a flat rgb — but a font stack is not a color, so it
  came back as the probe's inherited color instead. `mermaid.css` masked it almost
  everywhere; gantt axis ticks, the one text it does not cover, rendered in a generic
  sans-serif on a hand-drawn slide. Non-color tokens are now fetched literally.
- **Fixed: one malformed diagram no longer costs a deck its other diagrams' speed.**
  The batched render was all-or-nothing — an unparseable fence sent every diagram in
  the deck back through the one-at-a-time path. Failures are now isolated per diagram.
- **Changed: sketch reaches diagram TYPE even where it cannot reach diagram SHAPE.**
  On `a11y-*`, `onyx` and `concrete` — and in the `--print` band — nodes stay
  machine-drawn so the per-category texture survives, but labels take the hand face.
  The families Mermaid draws through rough.js are flowchart, state, class, ER,
  **mindmap** and **requirementDiagram** — six, not the four our docs claimed; the rest
  (sequence, gantt, pie, journey, timeline, quadrant, sankey, xychart, C4, block, packet,
  architecture, gitGraph) keep crisp shapes and gain hand type.
- **Fixed: `mode: sketch-clean` previewed every slide in Times New Roman.** The finish
  restored the clean body face from an alias snapshotted at `:root`, which works in the
  export — alias on `:root`, override on the section — but the preview scopes both onto
  the same element, making a custom-property cycle that resolves to nothing. All body
  prose and every diagram label on a sketch-clean slide fell back to the browser default
  in the Playground and the Studio while the exported PDF was correct. The re-point is
  now guarded in its selector instead, so there is no alias to cycle with.
- **Fixed: `autonumber` bubbles in a sequence diagram stayed in a generic sans-serif.**
  Mermaid writes that one label with a hard-coded `font-family` presentation attribute,
  past every config key, so it was the last text on a hand-drawn slide still machine-faced.
