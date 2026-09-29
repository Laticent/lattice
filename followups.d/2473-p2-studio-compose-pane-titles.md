---
origin: 2473
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# The Studio's Compose editor edits a panes slide's two titles as fields

why now   — PR 2473 put "Two columns" and "Top and bottom" in the Studio's insert menu and
            `columns` / `rows` in the Playground's picker (docs/src/lib/pane-layout-entries.mjs),
            so a Studio user can insert a panes slide. The Compose editor still shows it as one
            block of text: a user who never types Markdown cannot rename a pane or change its
            component.
where     — the Studio's Compose editor (docs/src/components/studio/); the labels are set in
            engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2.
done when — the Compose editor shows a panes slide's two `###` titles as editable fields, and
            each pane's component as a picker.
evidence  — a Studio screenshot at 1440, 820 and 390px (QUALITY BAR) of a panes slide in Compose.
verify    — edit a pane title in Compose on the real Studio (not a harness) and render the slide.
