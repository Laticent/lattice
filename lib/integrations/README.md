# lib/integrations — third-party library wrappers

Config, CSS, and docs for the libraries Lattice embeds. Each subfolder has
its own `.docs.md` — read those for specifics.

**These are moving to `lib/plugins/`**, one at a time
(`engineering/decisions/2026-09-27-plugin-system.md`). KaTeX went first: math is now the
`math` plugin (`lib/plugins/math/`). Function-plot and Mermaid follow.

- `markdown-it/` — `plugins.js` is the single source of the Lattice
  markdown-it transforms (badges, checklists, deck-class propagation,
  `logo:` directive, functionplot fences) shared by every render path
  (HARD RULE #1). Plus `scaffold.css`.
- `mermaid/` — the integration's notes only. The Mermaid plugin owns its code:
  its stylesheet, grammar and kernels (`reorient.js`, the render worker, the init directive, the
  motion roles, the label-length guard) live in `lib/plugins/mermaid/` and `lib/plugins/mermaid/shared/`. Authoring guide:
  `engineering/mermaid.md`.
- `highlight-js/` — syntax-highlight CSS + docs.

**Gotcha:** `plugins.js` must stay pure markdown-it/Marpit token
manipulation — no Node-only dependencies — because the browser paths
bundle it.
