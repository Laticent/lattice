# `tools/segno-legacy/` — the inline-code kernels as they were before Segno phase 2

Frozen, verbatim copies (taken from `main` at the commit before Segno phase 2 started; only
`require` paths adjusted) of every hand-written inline-code kernel that Segno phase 2 replaces
(`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

Two tools read them, and nothing in `lib/` may:

- **`tools/segno-codemod.mjs`** — recognizes the OLD spellings (`{BETA}:tag:c4`,
  `~{12 14}:bar`) so it can rewrite them in the new notation. It needs the old grammar after
  `lib/` no longer has it.
- **`tools/parser-bakeoff/`** — the bake-off measured six parser libraries against these
  kernels (`2026-09-28-parser-library-bakeoff.md`); pointing it here keeps its published numbers
  reproducible.

Do not fix bugs here: a fix would change what the codemod recognizes and what the bake-off
measured. Each file is deleted when nothing reads it.
