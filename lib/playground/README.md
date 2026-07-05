# lib/playground — the browser render entry

`index.js` exposes `window.LatticePlayground` (`render`, `addThemes`,
export helpers) — the docs-site playground and Studio render through this,
which renders through `lib/engine`, so the browser preview matches the PDF
by construction.

Bundled by `tools/build-playground.js` →
`docs/public/playground/lattice-playground.js`.

**Gotchas:** this entry is ESM (`import`), unlike most of `lib/` (CJS) —
esbuild handles the mix. Theme CSS is deliberately NOT bundled (fetched at
runtime via `addThemes`). Never add a browser-only render shortcut here —
if the playground renders differently from the PDF, that's a bug by
definition.
