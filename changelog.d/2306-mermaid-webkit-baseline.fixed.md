- **Fixed: Mermaid diagram labels no longer paint high in desktop Safari.**
  WebKit does not pass `dominant-baseline` down from a `<text>` to its `<tspan>`
  lines, or from a `<g>` to the `<text>` inside it, so sequence actor names,
  notes, architecture service labels and ishikawa causes sat above the middle of
  their boxes. `mermaid.css` now sets `dominant-baseline: inherit` inside every
  Mermaid diagram, which changes nothing in Chromium and covers every Mermaid
  family without naming its classes. Measured on the diagram gallery in desktop
  WebKit against Chromium: 17 of 91 labels over 3px high before, 0 after (worst
  0.92px). iOS Safari runs the same engine but was not checked on a device.
