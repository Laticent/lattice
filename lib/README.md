# lib/ — the engine source

Everything the Lattice engine is made of lives here, one concern per folder.
If you are new, read `engineering/architecture.md` first (how a deck flows
through the engine), then the code map below.

The big picture: **three render paths must agree** — the CLI/PDF path
(`lattice.js` → `lib/engine`), the browser playground
(`lib/playground`), and the VS Code preview runtime (`lib/runtime`). Most of
the structure below exists so shared logic lives in exactly one place.

**What each folder is for: `dist/engineering/codemap.md`.** It lists every folder here with its
layer and a one-line purpose, and it is generated from `PARTS` in `tools/structure.js` and `FOLDERS` in
`tools/build-codemap.js`, so it
cannot fall behind the tree the way the table that used to sit here did (21 of 29 folders).
`npm run build` writes it; `npm run codemap:check` fails on a folder with no line.

The #1 gotcha repo-wide: several folders are **bundled into the browser** by
`tools/build-*-core.js` — anything reachable from those entries must be pure
(no `fs`, no Node-only APIs). Each folder README says whether that applies.

