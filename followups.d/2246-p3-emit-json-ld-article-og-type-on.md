---
origin: 2246
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2246#issuecomment-5753518960
backfill: true
---

# Emit JSON-LD Article + og:type on the docs site

Backfilled verbatim from the continuation brief on #2246 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Emit JSON-LD Article + og:type on the docs site
       why now   — Chrome's DOM Distiller reads both as eligibility signals and the site emits
                   NEITHER (grep: zero application/ld+json anywhere). Broadens reader-mode
                   support past Readability's heuristic for every docs page at once.
       where     — the Starlight head (docs/astro.config.mjs overrides Header/ThemeProvider/
                   Sidebar/MobileMenuFooter only, not Head) and the repo's own layouts in
                   docs/src/layouts/**. Starlight already supplies og: for docs-collection
                   routes but not for the custom pages.
       done when — a built page carries application/ld+json with @type Article plus og:type
       evidence  — the emitted <head> from docs/dist + tools/reader-extraction-probe.mjs over
                   the built pages (112 of 127 were already eligible; this is about the rest
                   and about Chrome specifically)
       verify    — tier 0 gates
```
