---
origin: 2988
priority: P2
recorded: 2026-11-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
source: https://github.com/Laticent/lattice/pull/2988
deferred: off-path — the vector PDF writer is main's (#2928), measured as slow at PR 2988's merge base as on its branch; speeding it up is its own change, not this PR's
---

# The vector PDF writer is 85% of a large deck's export time

```text
  P2 · [no ticket] make the in-page vector PDF writer (composePdfInPage) faster on large decks
       why now   — Owner, 2026-11-17: "we want this to be performant". PR 2988's performance pass timed
                   the CLI export phase by phase (a temporary mark at each phase; same machine). On
                   lib/components/legal/legal.gallery.md at --size square (40 slides) the export took
                   about 64 s at the PR's merge base (0e3c72921) and on its branch alike, and the PDF
                   writer took 54.5 s of it (85%): about 1.4 s a slide. The PR's own fit-and-split loop
                   took 4.8 s (8%), four rounds of about 1 s, most of it the page reload each round.
                   On small decks the writer is still the largest step: examples/read-along-captions.md
                   spends about 4.0 of 6.9 s in it.
       where     — lattice.js composePdfInPage and the bundle it loads (dist/lattice-pdf-compose-min.js,
                   built by the build-pdf-compose step).
       done when — the writer's time per slide is measured, its hot spots named, and the large-deck
                   export is faster by a measured amount with the PDF bytes unchanged or signed off
                   (an export change needs the owner's light and dark review).
       evidence  — before and after timings from `npm run bench -- --cli` plus a large-deck run.
       verify    — tier 1 checker.
```
