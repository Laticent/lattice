# mermaid

Lattice's integration with [Mermaid](https://mermaid.js.org/) — the
diagram-as-code library. Mermaid handles flowcharts, sequence diagrams,
gantt charts, mindmaps, gitgraphs, and ~20 more diagram types from
plain text. Lattice integrates it in three layers: theme bridge, SVG
overrides, and custom syntax highlighting for the source.

**External dep:** `@mermaid-js/mermaid-cli` (declared in `package.json`).

**The plugin owns its stylesheet and its grammar** (`lib/plugins/mermaid/`, since plugin-system
phase D's browser half): `mermaid.styles.css` — per-diagram CSS overrides, Lattice-theme-aware
selectors targeting Mermaid's emitted SVG (flowchart, journey, mindmap, gitgraph, treemap, c4,
venn, and 9 more that ignore Mermaid's own `themeVariables`) — and `mermaid.highlight.js`, the
highlight.js grammar that colors a raw `\`\`\`mermaid` fence's source. **So does every kernel**
both of the plugin's halves share (HARD RULE #1) — the init directive, the render worker, portrait
reorientation, the motion roles and the overlong-label guard — in `lib/plugins/mermaid/shared/`, the plugin kind's one
in-tree-only folder (`lib/packages/kinds.js` `plugin.codeDirs`). This page keeps the integration's
history and its theme bridge.

---

## Render pipeline

A `\`\`\`mermaid` fenced block is processed in this order:

1. **At build time** (`lattice-emulator.js`):
   - Mermaid source is extracted from the fence.
   - `mmdc` (the Mermaid CLI binary that ships with the npm package) is
     invoked with the source + a theme-variables JSON object derived
     from the active palette's tokens.
   - `mmdc` returns SVG. The SVG is embedded inline in the slide.
   - The `.mermaid-svg` wrapper class + per-diagram-type CSS overrides
     from `mermaid.styles.css` style the SVG.

2. **At runtime** (`lattice-runtime.js`):
   - The browser Mermaid script renders the SVG client-side.
   - Same theme-variables object derived from CSS custom properties.
   - Same wrapper + override CSS.

3. **At build time (raw fallback)** (`lattice-emulator.js`):
   - If `mmdc` isn't available OR Mermaid source fails to parse, the
     raw source is shown as a syntax-highlighted code block.
   - Highlighting is provided by `mermaid.highlight.js`, our custom
     highlight.js language definition.

---

## Theme bridge

Lattice's palette tokens (`--accent`, `--text-body`, `--bg`, etc.) are
mapped to Mermaid's `themeVariables` object at render time. The mapping
lives in `lattice-emulator.js` and `lattice-runtime.js` (mirrored —
must stay in lockstep). When you swap palettes, Mermaid diagrams
recolor without re-rendering.

Mermaid's themeVariables don't cover everything. 9 diagram types
(notably journey, mindmap, treemap, c4, venn, sankey, packet, block,
xychart) ignore the variables and use hard-coded SVG colors. Lattice
overrides those with palette-blind CSS in `mermaid.styles.css`. See
`design/theming.md` for the full per-diagram override surface.

---

## `mermaid.highlight.js` — custom syntax highlighting

A highlight.js language definition for Mermaid source. Adapted from
Prism's `prism-mermaid.js` (MIT) to the highlight.js mode-tree API.

**Coverage:** flowchart/graph, sequenceDiagram, classDiagram,
stateDiagram(-v2), erDiagram, journey, gantt, pie, gitGraph, mindmap,
timeline, kanban, quadrantChart, requirementDiagram, C4 family
(Context/Container/Component/Deployment), architecture-beta,
packet-beta, sankey-beta, radar-beta, xychart-beta, block-beta, info.

The grammar is intentionally permissive: it tags tokens that are safe
to tag in any diagram (keywords, operators, strings, comments) and
avoids mode-stacks that depend on knowing which diagram type a fence
is. Trade-off: some precision lost (`section` is treated uniformly
across gantt/journey/timeline) for a smaller grammar.

The file lives **in the plugin** (`lib/plugins/mermaid/`) rather than in
`lib/integrations/highlight-js/` because the SUBJECT is Mermaid (this is
"Lattice's syntax highlighting for Mermaid"): it is the plugin's `highlight`
contribution, registered by the plugin host under the plugin's code fence.
The hljs integration doc lists it as a registered custom language.

---

## Why mermaid-cli is a runtime dep, not dev dep

The emulator path invokes `mmdc` as a subprocess during PDF build. End
users who install Lattice as an npm package need `mmdc` available to
render any deck containing Mermaid diagrams. Hence runtime dependency
in `package.json` rather than dev dependency.

The Marp CLI path uses Marp's built-in Mermaid runtime support, which
itself depends on a browser context (Chromium via Puppeteer). Both
paths converge on the same SVG output — the theme bridge guarantees
visual parity.

---

## See also

- `lib/components/diagram/diagram.docs.md` — the `diagram` layout that
  hosts Mermaid in a slide container.
- `design/theming.md` — palette token contract + Mermaid `themeVariables`
  mapping + per-diagram-type override catalog.
- `engineering/mermaid.md` — Mermaid-specific authoring conventions
  used in shipped decks.
- `lib/integrations/highlight-js/highlight-js.docs.md` — the hljs
  integration that lists `mermaid.highlight.js` as a custom language.
- `lib/plugins/mermaid/mermaid.docs.md` — the plugin: what it contributes, and where it draws.
