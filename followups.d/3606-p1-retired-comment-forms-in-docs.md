---
origin: 3606
priority: P1
recorded: 2026-11-28
area: docs
severity: medium
swimlane: test/unit/docs/no-retired-keys-taught.test.js SANCTIONED
deferred: off-path — each file belongs to another lane (component docs, library catalog, the spec desk's diagnostics table, base.docs.md); #3606 adds the guard and was told to report rather than edit them
source: https://github.com/Laticent/lattice/pull/3606
---

# Agent-facing docs still describe a slide comment the @meta cut retired

After #3563 the engine reads only `<!-- @meta{…} -->` records, and lint-core reports every old comment as
`legacy-directive-comment`. #3606's guard asks lint-core which comments are retired, and these still describe
one as current. Each has a TEMPORARY entry in the test's `SANCTIONED` table, which fails once its file is fixed.

| File | Line | Retired form |
|---|---|---|
| `docs/src/content/catalog/libraries/markup.md` | 103 | "the engine's `_focus: line` and `_build: lines`" |
| `lib/base/base.docs.md` | 1755 | "A slide's `_backgroundImage: url(…)`" |
| `lib/components/anchor/title/title.docs.md` | 41 | anti-pattern naming `_footer: ''` |
| `lib/components/anchor/closing/closing.docs.md` | 53 | anti-pattern naming `_footer: ''` |
| `lib/components/anchor/divider/divider.docs.md` | 47 | anti-pattern naming `_header: ''` / `_footer: ''` |
| `docs/src/content/docs/spec/diagnostics.md` (from `spec/diagnostics.md`) | 160, 166, 183, 272, 440 | `track-directive`, `one-stepping-directive`, `code-line-range`, `unknown-debug-facet`, `meta-class-overridden` rows |

`meta-class-overridden` also needs the rule: `lib/authoring/lint-core.js:1100-1104` still counts a `_class` comment as a
class setter.

done when — each line says the record form (`@meta{build=…}`, `@meta{class=…}`, an empty `footer=""`, …) or names the
old form as history, and its `SANCTIONED` entry is gone (the stale-entry check forces the removal).
