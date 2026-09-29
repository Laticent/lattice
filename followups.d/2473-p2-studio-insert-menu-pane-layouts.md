---
origin: 2473
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# The Studio's insert menu offers the pane layouts as "Two columns" and "Top and bottom"

why now   — the pane layouts ship in `lib/` and `lint:deck` with this PR, but a Studio user who
            never types Markdown cannot find them: the insert menu and Compose editor have no
            entry, so only an author typing `_class: columns` reaches the feature.
where     — the Studio's insert menu and Compose editor (docs/src/components/studio/); the labels
            are set in engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2.
done when — the insert menu has "Two columns" and "Top and bottom", each writing a
            `<!-- _class: columns -->` / `<!-- _class: rows -->` slide with two `### ` panes, and
            the Compose editor shows a panes slide's two titles as editable fields.
evidence  — a Studio screenshot at 1440, 820 and 390px (QUALITY BAR) of each entry inserted and
            rendered.
verify    — insert each entry on the real Studio (not a harness) and render the slide.
