---
origin: 2400
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2400
---

# A saved finish with no stored recipe keeps its pre-#2400 CSS

Narrowed on 2026-09-28. The original claim, that a Fabricate finish saved before #2400 keeps its
old generated CSS until re-saved, does not hold for a finish with a recipe: the Studio library
rebuilds a finish's CSS from its recipe on every read (`finish-library.ts` `toStudioFinish`), and
has since #2336 (2026-09-24), before #2400 landed. The saved-finish export test
(`docs/e2e/saved-finish-export.spec.ts`) exercises that read path. What is left is a record the
generator cannot rebuild.

```text
  P3 · [no ticket] a recipe-less saved finish keeps its stored CSS.
       why now   — a library record with only CSS text (no recipe) is used as stored, so it keeps
                   whatever generator it was written by: a hard spotlight edge before #2400, no
                   `-opaque` mirrors before #2445 (so no finish in the Studio's exports).
       where     — docs/src/components/studio/finish-library.ts toStudioFinish; wherever such a
                   record can be created (an imported package without a recipe file).
       done when — a recipe-less record is either upgraded on load (parse its CSS back into a
                   recipe) or flagged in the library with a one-click regenerate.
       evidence  — a Studio export of a deck using such a record, before/after.
       verify    — tier 0 gates, because it is a load-time path with a narrow reach.
```
