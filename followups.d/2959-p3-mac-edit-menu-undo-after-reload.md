---
origin: 2959
priority: P3
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §3.5
deferred: large — WebKit's own undo list after a reload belongs to the browser; making its undo command (and so, presumably, Edit → Undo) reach the stored history needs a design of its own (the Tauri app already wires its Edit menu)
source: https://github.com/Laticent/lattice/pull/2959
---

# Safari's undo command does not reach the history after a reload

```text
  P3 · [no ticket] make Safari's undo command on a Mac reach Filo's stored history after a reload
       why now   — the ios-safari-undo suite (macOS Safari 26.6.2, 2026-10-29) found that after a
                   reload WebKit's undo command, sent through execCommand, is enabled but raises
                   no historyUndo, so it does nothing to the deck; the Edit menu presumably does
                   the same, but no run has clicked the real menu. A real ⌘Z works (the Studio's
                   keydown), and on an iPad the shell's Undo and Redo buttons now cover it (PR
                   2959). Before a reload the command works: PR 2959 fixed it undoing twice
                   (Safari answers one undo command with two historyUndo events).
       where     — docs/src/components/studio/StudioShell.tsx (the history input); undo-probe.js
       done when — the undo command (and a real Edit → Undo click) after a reload undoes the edit
                   before it, or the decision note says why the menu is left to WebKit.
       evidence  — the ios-safari-undo macOS step green.
       verify    — tier 1 checker.
```
