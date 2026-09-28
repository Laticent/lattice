---
origin: 2433
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2433
---

# A plain `.html` export reserves one line of tag, so a wrapped corner label covers the body.

Found by the checker on PR #2433. It is older than that PR (the one-line reserve,
`lib/base/base.card-tag.css`, dates from phase 1), and it is off that PR's path, so it is
logged here.

```text
  P3 · [no ticket] Plain .html export: a corner label past one line overlaps the card body.
       why now   — every other surface runs lib/core/card-tag-equalize.js, which writes the
                   real tag height into --card-tag-block; the plain .html is built in Node
                   before the page renders and carries no script, so the reserve stays one
                   line. A 4-line label covered the first body line with no warning (the
                   export correctly measures the file as it ships).
       where     — lattice-emulator.js TAGS_REACH_DELIVERABLE; base.card-tag.css corner reserve.
       done when — the plain .html either bakes the equalized values into the file, or its
                   reserve clears a wrapped label, or the export warns.
       evidence  — the checker's render of a decision row with a 4-line label, .html vs .pdf.
       verify    — rendered by the checker (CONFIRMED). Mitigated today: `tag-budget` warns
                   on any corner label past one line, so a lint-clean deck never hits it.
```
