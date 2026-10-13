---
origin: 2649
priority: P1
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-07-18-compose-prosemirror.md
source: https://github.com/Laticent/lattice/pull/2649
---

# Compose inline notation editors, after the pill editor: sparks, a chart series grid, avatars, and a diagram outline builder

```text
  P1 · [no ticket] Compose inline notation editors, phases 2 to 5
       why now   — the pill editor shipped (the first implementation PR for 2026-10-13-compose-inline-notation-editors.md) and proved the shared host: the pill drawn in the text as the slide draws it (the engine's own pill rules and tokens, copied at runtime from the preview frame), one editor that is a popover on desktop and tablet and a sheet on the phone, and a word-level writer that returns null rather than guess. Authors still type `~{12 14 17, end}` and `!{Ada Okafor, hair=coily}` by hand, and chart data and Mermaid are the same problem in a bigger form.
       where     — docs/src/lib/compose/inline-notation.ts (the plugin, `insertPill`, `applyPillEdit`, the open range mapped through every edit), docs/src/lib/compose/pill-sheet.ts (the borrowed pill CSS and tokens, which a spark and an avatar will need the same way), docs/src/components/studio/PillEditor.tsx (`PillPanel`, `PillEditorHost`), lib/core/inline-pills.js (`editPill`), lib/authoring/inline-editors.js (the bundle door). A spark writer belongs next to `withSparkSize` in lib/authoring/lint-core.js or in lib/core/inline-sparks.js; an avatar writer in lib/plugins/avatars/avatars.inline.js.
       done when — each phase ships on its own PR, in this order: (2) the spark editor with its number grid and type chips, whose writer replaces only the changed words and has a property test over every spark in the shipped decks; (3) the chart series grid, after a short note that says which chart components are list-shaped (gantt, kanban and map are not); (4) the avatar designer, name plus trait swatches with a reset-to-name control; (5) the diagram outline builder, after its own note, which must turn Mermaid into an outline and back without loss and may only open for diagrams it recognizes. The pill editor's two open items go in with phase 2: a crowding warning for a circle or diamond with a long label (the linter's `pill-shape-crowded`), and the `icon=` axis through `IconGrid`.
       evidence  — per phase, tools/screenshot.js or a driven run of the real Studio at 1440 / 820 / 390, light and dark, with the editor open, plus a round-trip property test over the shipped notation; the sheet and keyboard on a real phone.
       verify    — tier 1 checker on each writer, because it rewrites deck source; tier 0 for the panels.
```
