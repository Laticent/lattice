---
origin: 2846
priority: P4
recorded: 2026-10-21
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §4
source: https://github.com/Laticent/lattice/pull/2846
---

# Compose: an installed plugin's inline kind opens a panel generated from its `slot`

why now   — `editRecord` (lib/core/segno-edit.js) now writes any slot spec, so the writer exists; the generic panel and drawing a kind the host cannot run (a placeholder) do not. Joins followups.d/2687-p8.
where     — docs/src/lib/compose/inline-objects.ts (`kindOf`, `isObjectSource`), the Studio's plugin records (`kinds[].slot`).
done when — a listed plugin's `@kind{…}` span opens a panel whose write changes only the edited word.
evidence  — a unit arm and the real Studio.
verify    — tier 1 checker.
