---
origin: 2445
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2445#issuecomment-5863010023
---

# Drive the three finish export paths #2445 argued but never ran

#2445 fixed saved finishes in the Studio's exports by writing `--fin-*-opaque` mirrors into the
generated finish's rich rule. Its card rated confidence `high`, not `very high`, because three
paths reach the same mirrors and were never driven on the real Studio:

1. **Studio Print.** The scoped `@media print` flip has the same specificity problem as the
   export flip, so by the same argument it is fixed too.
2. **`finish-override:`.** Its regeneration goes through `generateFinishCss`, so it should carry
   the mirrors.
3. **A spotlight or clearance finish through the Studio raster** (html-to-image), including
   #2400's feathered spotlight.

```text
why now   — the only gap between #2445's card and `very high`; a regression here ships a finish
            that shows on screen and vanishes in the file.
where     — lib/finishes/finish-generate.js opaqueMirrorDecls; docs/e2e/saved-finish-export.spec.ts
            (extend it); the Studio's Print action and Share → Images / PDF.
done when — each path exports a slide that differs from `finish: none` by more than 3% of
            pixels, on the real Studio, and the e2e spec pins at least the two that are
            reachable headless (finish-override:, spotlight).
evidence  — per-path differing-pixel share, before/after, from real Studio exports; Print via
            page.pdf() with print media emulated, called out as such.
verify    — tier 0 gates, because it adds tests and, at most, a generator line already under
            #2445's checker review.
```
