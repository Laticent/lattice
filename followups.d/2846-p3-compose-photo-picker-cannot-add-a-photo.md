---
origin: 2846
priority: P3
recorded: 2026-10-21
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2846
---

# Compose: the photo picker has no upload

why now   — a new author with an empty Library is sent to the Library first. The Library already imports, behind a format dialog (Library.tsx `addMediaFiles`).
where     — docs/src/components/studio/PhotoPicker.tsx, Library.tsx (extract the import flow).
done when — "Add a photo" in the picker imports through the Library's own flow and the new photo is picked.
evidence  — a real-Studio spec that uploads from the picker.
verify    — tier 0.
