---
origin: 2935
priority: P2
recorded: 2026-10-27
area: export
severity: medium
swimlane: engineering/decisions/2026-10-26-spectrum-edge-shift.md
source: https://github.com/Laticent/lattice/pull/2935
---

# `lattice deck.md deck.pptx --editable` deletes an existing `deck.html` beside the deck.

why now   — found by the third checker on #2935: a file `d.html` containing a sentinel was gone after an editable export of `d.md`; two parallel exports of one deck also collided on `<deck>-dark.html`. Present on `main` too.
where     — the editable export path writes an intermediate `.html` next to the source and removes it afterwards (`lattice.js`, the Office export step).
done when — the export writes its intermediate under a temp directory (or a name that cannot collide with an author's file) and never deletes a file it did not create.
evidence  — the checker's sentinel repro on #2935.
verify    — create `d.html` with a sentinel, run the export on `d.md`, assert the file is still there; run two exports of one deck in parallel and assert both succeed.
