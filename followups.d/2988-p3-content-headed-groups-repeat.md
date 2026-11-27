---
origin: 2988
priority: P3
recorded: 2026-11-16
area: engine
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
source: https://github.com/Laticent/lattice/pull/2988
deferred: off-path — this PR fixes the shape for regulatory-update only; content's split is the shared envelope's item axis, which other layouts depend on
---

# A content slide of `###` groups, each over its own list, repeats the other groups on every split page

```text
  P3 · [no ticket] split a content slide of headed lists between its groups
       why now   — PR 2988 taught cover-paginate that `###` groups each over a list are the members
                   (split-envelope.js headedListGroups), scoped to regulatory-update. The checker found the
                   same shape on a plain `content` slide still pages one list and prints the other groups
                   on each page, and clips (.scratch/chk/contentA.md, contentB.md; byte-identical before
                   and after this PR, so not a regression of it).
       where     — lib/core/auto-split.js (no-recipe envelope, deriveAxis), fit-measure.js `members`,
                   fit-measure.js HEADED_GROUP_LAYOUTS.
       done when — a content slide with two or more `###` lists too tall for its page splits between
                   groups, no group repeats, and `team-profile sides` keeps its measured item split.
```
