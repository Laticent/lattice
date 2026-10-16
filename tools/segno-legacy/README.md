# `tools/segno-legacy/` — the inline-code kernels as they were before Segno phase 2

Frozen, verbatim copies (taken from `main` at the commit before Segno phase 2 started; only
`require` paths adjusted) of the three hand-written inline-code kernels the parser bake-off
measured (`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

One tool reads them, and nothing in `lib/` may: **`tools/parser-bakeoff/`**. The bake-off
measured six parser libraries against these kernels (`2026-09-28-parser-library-bakeoff.md`);
pointing it here keeps its published numbers reproducible.

`flowchart-row.js` joined them at Segno phase 3b: `readArrow` and `splitRow` as they were at
a4fb527, before the generated row parser replaced them. The bake-off's flow arm times it as the
incumbent, and `tools/parser-bakeoff/freeze-flow-rows.mjs` reads it to (re)write the oracle in
`test/unit/tools/fixtures/flow-rows.frozen.json`. The unit test reads that fixture, not this file.

Do not fix bugs here: a fix would change what the bake-off measured. Each file is deleted when
nothing reads it.
