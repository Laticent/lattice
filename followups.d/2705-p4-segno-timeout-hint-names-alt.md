---
origin: 2705
priority: P4
recorded: 2026-10-16
area: website
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2705
---

# The /segno playground's time-limit message blames a long alt(), which Segno no longer chokes on

why now   — When the 1.5 s limit stops a build, docs/src/pages/libraries/segno/index.astro says
            "A very long alt() is the usual cause: split it into rules joined with ref()." Segno's
            lint now names ten overlapping pairs per alternation and counts the rest, so an alt()
            of 3,000 literals is refused in under 0.1 s and never reaches the limit. The one
            runaway the e2e spec still finds is a grammar that builds thousands of tree nodes per
            character of a long text (40 rules of 60 nested node() calls over 10,000 characters:
            22 s in Node). The advice now points visitors at the wrong fix. Found while updating
            docs/e2e/segno-playground.spec.ts steps 7, 11 and 13 on the catalog-follow-ups PR.
where     — docs/src/pages/libraries/segno/index.astro, the `stopRunaway` message (search
            "usual cause"); docs/e2e/segno-playground.spec.ts `STOPPED` matches only the
            sentence before it.
done when — the hint names the cause a visitor can act on today (or says nothing it cannot
            back), with tools/screenshot.js evidence of the stopped state at 1440, 820 and 390.
