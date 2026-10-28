---
origin: 2940
priority: P3
recorded: 2026-10-28
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §3.5
source: https://github.com/Laticent/lattice/pull/2940
---

# Undo during a real IME composition, and iOS shake / three-finger undo, are unverified

```text
  P3 · [no ticket] verify undo with a real IME and on iOS
       why now   — PR 2940's e2e fires composition events itself; a real IME (Japanese, Chinese,
                   Android's per-word composition), iOS shake and three-finger swipe, and the macOS
                   Edit menu were not driven. Android may hold a composition for a whole word, so
                   the pill's Undo would wait for it.
       where     — docs/src/components/studio/StudioShell.tsx runHistory, ComposeView afterComposition
       done when — each input method undoes once, at the right moment, on a real device.
       evidence  — a recording or a device-lab run per method.
       verify    — owner check on device.
```
