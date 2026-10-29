---
origin: 2959
priority: P3
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §3.5
deferred: large — WebKit's own undo list after a reload belongs to the browser; making Edit → Undo reach the stored history needs a design of its own (the Tauri app already wires its Edit menu)
source: https://github.com/Laticent/lattice/pull/2959
---

# Safari's Edit → Undo does not reach the history after a reload

```text
  P3 · [no ticket] make Safari's Edit → Undo on a Mac reach Filo's stored history after a reload
       why now   — the ios-safari-undo suite (macOS Safari 26.6.2, 2026-10-29) found that after a
                   reload WebKit's undo command is enabled but raises no historyUndo, so the menu
                   item does nothing to the deck. A real ⌘Z works (the Studio's keydown), and on an
                   iPad the shell's Undo and Redo buttons now cover it (PR 2959).
       where     — docs/src/components/studio/StudioShell.tsx (the history input); undo-probe.js
       done when — Edit → Undo after a reload undoes the edit before it, or the decision note says
                   why the menu is left to WebKit.
       evidence  — the ios-safari-undo macOS step green.
       verify    — tier 1 checker.
```
