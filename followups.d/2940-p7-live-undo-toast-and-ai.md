---
origin: 2940
priority: P7
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §6
deferred: off-path — the live-session e2e pins the pill and settings writes; these two are separate writers
source: https://github.com/Laticent/lattice/pull/2940
---

# Live-session undo: the settings toast's Undo, and AI applies and rail moves

```text
  P7 · [no ticket] two live-session undo paths the e2e does not drive
       why now   — docs/e2e/filo-live.spec.ts pins a settings write and Compose's pill in a
                   two-browser session. Two paths stay untested: an AI apply and a rail move
                   (both reach the shared text with the null origin, so Y.UndoManager tracks
                   them), and the settings toast's Undo, which goes to Y.UndoManager and can
                   merge a write made within its 500 ms capture window with the typing before it.
       where     — docs/src/components/studio/live/live-controller.ts, StudioShell.tsx runHistory
       done when — the spec covers a rail move and an AI apply in a session, and the toast's
                   Undo takes back the settings write alone (stopCapturing before a Studio write).
       evidence  — the spec in three engines; the toast case failing before its fix.
       verify    — tier 1 checker.
```
