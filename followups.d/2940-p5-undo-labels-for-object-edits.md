---
origin: 2940
priority: P5
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §3.4
source: https://github.com/Laticent/lattice/pull/2940
---

# A pill, image or raw-block edit undoes as "Typing", and the pane toast always reports success

```text
  P5 · [no ticket] name object edits in the undo history
       why now   — PR 2940: Compose emits an object edit as an ordinary change, so the announcement
                   reads "Undid: Typing"; undoPane returns true without knowing an undo happened.
       where     — docs/src/lib/compose/{inline,image,raw}-objects.ts, ComposeView.tsx undoPane
       done when — each object edit carries its own label ("Pill color", "Photo"), and undoPane
                   reports whether the history moved.
       evidence  — unit tests on the Filo harness.
       verify    — tier 0.
```
