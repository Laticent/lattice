---
origin: 2940
priority: P4
recorded: 2026-10-28
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §6
source: https://github.com/Laticent/lattice/pull/2940
---

# Undo in a live session has no end-to-end test

```text
  P4 · [no ticket] pin per-person undo in a two-browser session
       why now   — PR 2940 routes the root ⌘Z, Compose's ⌘Z and its pill to the session's
                   Y.UndoManager (LiveCollab.undo/redo) and mirrors the undone text into Compose;
                   that path is code-traced, not run. The note §6.2 asks for an e2e that settings
                   writes, AI applies and rail moves are undoable in a session. Also: the toast's
                   Undo can merge a write made within 500 ms with the typing before it.
       where     — docs/src/components/studio/live/live-controller.ts, StudioShell.tsx runHistory
       done when — an e2e with two browsers undoes each person's own changes only, from the
                   editor, Compose and the page body.
       evidence  — the spec in three engines.
       verify    — tier 1 checker.
```
