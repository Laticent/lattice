# lib/integrations — third-party library wrappers

Config, CSS, and docs for the libraries Lattice embeds. Each subfolder has
its own `.docs.md` — read those for specifics.

- `markdown-it/` — `plugins.js` is the single source of the Lattice
  markdown-it transforms (badges, checklists, deck-class propagation,
  `logo:` directive, functionplot fences) shared by every render path
  (HARD RULE #1). Plus `scaffold.css`.
- `mermaid/` — `reorient.js` (portrait flow reorientation), the hljs
  language def, `mermaid.css`. Authoring guide: `engineering/mermaid.md`.
- `katex/` — docs only; the actual KaTeX render is `lib/engine/math.js`.
- `highlight-js/` — syntax-highlight CSS + docs.

**Gotcha:** `plugins.js` must stay pure markdown-it/Marpit token
manipulation — no Node-only dependencies — because the browser paths
bundle it.
