---
origin: 2846
priority: P5
recorded: 2026-10-21
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7
source: https://github.com/Laticent/lattice/pull/2846
---

# Compose: notes (`say`, `describe`, `note`) edit in place, and Motion gets an Insert item

why now   — the note panel is read-only, and an empty Anima scene draws nothing so the Insert menu has no Motion item. Ask the owner whether notes should edit in the panel.
where     — ComposeView.tsx (`buildCommentPanel`), InsertControls.tsx, the scene library.
done when — an edit field in the note panel that round-trips the comment bytes; a Motion item that inserts a scene from the library.
evidence  — a real-Studio spec.
verify    — tier 0.
