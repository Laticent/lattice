---
origin: 2247
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2247#issuecomment-5761690751
backfill: true
---

# Warn on the render path when a deck still carries `form: off`

Backfilled verbatim from the continuation brief on #2247 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Warn on the render path when a deck still carries `form: off`
       why now   — closes the one hole in a BREAKING change's migration story: lint:deck
                   warns, but the render CLI never lints, so a consumer who renders and
                   never lints gets a silently different PDF (band + bay + rail appear).
       where     — dist/lattice-emulator.js entry / lib/engine/index.js:393 where
                   applyFormToHtml is called; the retired-form-key rule in
                   lib/authoring/lint-core.js already has the exact wording to reuse.
       done when — rendering a deck whose front matter has `^form:` prints one warning
                   naming the consequence; a clean deck prints nothing; exit code unchanged.
       evidence  — the CLI transcript of both renders, pasted in the PR.
       verify    — tier 0 gates, because it adds a console warning and changes no output
                   bytes. NOTE: this changes what EVERY render prints, so put the option
                   to the owner before landing it (CLAUDE.md SECOND FILTER, row 2-ish).
```
