---
origin: 2279
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2279#issuecomment-5764143460
backfill: true
---

# Delete the emulator's private section walker — it collapses a deck to ONE page

Backfilled verbatim from the continuation brief on #2279 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Delete the emulator's private section walker — it collapses a deck to ONE page
       why now   — silent data loss on the format this engine exists to produce: a multi-slide
                   deck whose body carries a raw `<section` exports as a 1-page PDF, exit code
                   0, no warning. Until it lands, #2279's fix is only half-applied — the shared
                   kernel is right and one caller still is not. Root cause known, fix small.
       root      — lattice-emulator.js:2217 `splitTopLevelSections` is a SECOND, regex-based
       cause       copy of the walk `lib/core/split-sections.js` does. It matches
                   `/<section\b[^>]*>|<\/section>/gi`, so a `<section` inside an HTML comment
                   or inside `<style>` text moves its depth counter. Measured side by side:
                     clean 3-slide doc            → emulator copy 3 · shared splitSections 3
                     same doc + a quoting comment → emulator copy 0 · shared splitSections 3
                   The export then assembles a document with ZERO sections (verified by
                   parsing the .html export: control 3 slides, trap 0) and the PDF falls back
                   to one page.
       the fix   — delete `splitTopLevelSections` and use the shared kernel. The emulator
                   ALREADY requires it twice (lines 5199, 5791) — this call site was simply
                   never migrated. ONE caller, line 2305. Shapes differ: the private copy
                   returns section STRINGS, so the replacement is
                     splitSections(html).filter(p => p.type === 'section')
                       .map(p => p.openTag + p.inner + '</section>')
                   This is HARD RULE #1 — one transform, one kernel.
       trigger   — MEASURED. The literal `<section` reaching the HTML as raw markup. Collapses:
                   an HTML comment containing it; a `<style>` whose TEXT contains it. Does NOT:
                   `<!-- quoting a section tag -->`, `<style>section { … }</style>`, a plain
                   `<style>`. Fenced code is escaped, which is why authoring it in a fenced
                   block is safe — and why the shipped corpus is unaffected
                   (examples/deck-class-tokens.md exports its full 8 pages, matching its golden).
       scope     — PRE-EXISTING, not caused by #2279: bisected each trap, then A/B'd the three
                   files #2279 changed against 651aa2b with the bundles rebuilt — 1 page on both.
       done when — the repro exports 3 pages, both trigger shapes export every slide, and
                   `grep -n splitTopLevelSections lattice-emulator.js` finds nothing.
       evidence  — `pdfinfo` page counts before/after, PLUS a rasterized page from the fixed
                   PDF actually looked at (tools/rasterize-for-review.sh). A page count alone
                   does not show the slides are right.
       verify    — tier 1, an independent checker. It is the export pipeline, the blast radius
                   is every PDF, and #2279 is a standing demonstration that this area hides
                   defects every gate is green for.
       owes      — a regression arm in the integration export tier. Invisible to the unit tier
                   by construction: the engine's own output is already correct.
```
