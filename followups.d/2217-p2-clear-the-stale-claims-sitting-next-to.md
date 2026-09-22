---
origin: 2217
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2217#issuecomment-5672786328
backfill: true
---

# Clear the stale claims sitting next to this diff

Backfilled verbatim from the continuation brief on #2217 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Clear the stale claims sitting next to this diff
       why now   — each has already misled someone once; all are cheap.
       where     — engineering/decisions/2026-08-18-…md §4.2 still says "The
                   Playground's Mode row never renders" (fixed by an earlier PR).
                   docs/src/styles/deck-config.css header says the panel is styled for
                   "the Playground and the Studio" — DeckSetupSheet.tsx is now the sole
                   host rendering a `.deck-config` panel. docs/src/playground/
                   deck-config.js CONFIG_PROFILES.noTheme and .preview have no
                   production caller left (only their own tests), and
                   docs/src/components/playground/PlaygroundApp.test.tsx:57 still mocks
                   `noTheme` although the host now reads `author`.
       done when — each claim corrected in place with a dated note or removed with its
                   test, the stale mock updated, and `npm run build:check` green.
       evidence  — grep showing no remaining production reference for a retired
                   profile; the corrected doc lines in the diff.
       verify    — tier 0 gates, because it is prose plus dead-code removal in one
                   module with no behavior change.
```
