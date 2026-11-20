---
origin: 3351
priority: P3
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/decisions/2026-11-20-four-notes.md §6
deferred: off-path — each shape behaves the same on main before the four-notes change, which did not touch it
source: https://github.com/Laticent/lattice/pull/3351
---

# `--strip-notes` edges the independent checker found on main as well

```text
  P3 · four shapes the source scrub does not handle, measured identical on origin/main
       why now   — The four-notes checker probed the scrub and found these on BOTH main and the PR, so
                   they are not regressions, and none is on the four-notes path:
                   1. `<!-- SECRET --!> visible? -->`: a browser ends the comment at `--!>`, the scrub
                      at `-->`, so the embedded source keeps ` visible? -->`, which re-imports as slide text.
                   2. `<span title="<!-- x -->">`: the scrub empties the attribute value.
                   3. `<!-- {TODO secret} -->`: record-shaped, so it is kept as a record (lint reports it
                      as a record that does not read).
                   4. A Marp bundle keeps `<!-- stress-slide -->`, which Marp shows as a speaker note.
       where     — lib/authoring/notes-core.js `removeCommentSpans` / `isPrivateComment`;
                   lib/authoring/notes-core.js `notesToMarp` (4).
       done when — each shape scrubs to the deck as if the author had not written the private text, or
                   is refused with a lint error that names it; 4: the Marp bundle drops Lattice-only markers.
       evidence  — the checker's repro decks on PR 3351 (`cm/`, `pc.md` shapes).
       verify    — `--player --strip-notes` on each shape, then decode the envelope source and grep.
```
