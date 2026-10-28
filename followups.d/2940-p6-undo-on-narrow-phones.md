---
origin: 2940
priority: P6
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §10
source: https://github.com/Laticent/lattice/pull/2940
---

# Below 360 px the Markdown pane has no Undo button

```text
  P6 · [no ticket] reach Undo on a phone narrower than 360 px
       why now   — PR 2940: the header's Undo and Redo are hidden below 360 px (in the app and the
                   pre-paint skeleton alike) because at 320 px they left the deck title no width.
                   Compose's pill still has Undo; the Markdown pane has none.
       where     — docs/src/components/studio/StudioShell.tsx (mobile header), StudioDrawer.tsx,
                   StudioChromeSkeleton.tsx
       done when — a 320 px phone can undo from the Markdown pane (a drawer row or an edit-bar
                   button), and studio-shell-parity / studio-instant-shell pass at 320 px.
       evidence  — the two specs at 320 px, plus a screenshot.
       verify    — tier 0.
```
