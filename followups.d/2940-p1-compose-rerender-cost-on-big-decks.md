---
origin: 2940
priority: P1
recorded: 2026-10-28
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §10
source: https://github.com/Laticent/lattice/pull/2940
---

# Compose re-renders a replaced slide slowly on a large deck, in WebKit most

```text
  P1 · [no ticket] cut ProseMirror's render cost per transaction on a 134 KB deck
       why now   — measured on PR 2940 (docs/e2e/filo-compose.spec.ts): an undo's history work is
                   3-13 ms, but ProseMirror re-rendering the replaced slide adds 8-16 ms in
                   Chromium/Firefox and 50-240 ms in WebKit; a plain keystroke is 6-24 ms and
                   17-28 ms. formatSyncPlugin re-syncs every live SlideView on every update.
       where     — docs/src/components/studio/ComposeView.tsx (formatSyncPlugin, SlideView)
       done when — a keystroke and an undo on the 134 KB deck each render under 16 ms in all three
                   engines (the filo:compose-apply measure plus a keystroke measure).
       evidence  — before/after of both measures in three engines.
       verify    — tier 1 checker.
```
