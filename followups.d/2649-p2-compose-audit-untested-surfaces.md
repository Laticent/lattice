---
origin: 2649
priority: P2
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-07-18-compose-prosemirror.md
source: https://github.com/Laticent/lattice/pull/2649
---

# The Compose audit did not reach table editing, undo, paste, drag, slide delete or diagrams

```text
  P2 · [no ticket] Finish the Compose audit on the surfaces #2649 did not touch
       why now   — The #2649 audit drove the context bar, the slide strip, inline code and the issue chip at three widths. It did not test table editing, undo and redo, paste from a spreadsheet, slide drag and reorder, delete-slide confirmation, or any diagram slide (the Mermaid script does not load in the cloud sandbox), and it ran in the default theme only. Jank the owner mentioned may live there.
       where     — docs/src/components/studio/ComposeView.tsx, table-controls.tsx, and the slide rail ops in StudioShell.tsx.
       done when — each listed surface has been driven on the real Studio at 1440 / 820 / 390 (light and dark) and each defect found is fixed or filed.
       evidence  — screenshots from tools/screenshot.js or a puppeteer script, with the audit deck .scratch/compose-audit-deck.md plus a table slide and a long deck.
       verify    — tier 0 gates; a diagram check needs an environment where Mermaid loads.
```
