---
origin: 2710
priority: P1
recorded: 2026-10-15
area: code
severity: medium
swimlane: engineering/decisions/2026-10-15-code-plugin.md §11
source: https://github.com/Laticent/lattice/pull/2710
---

# Compose editor for a fence's `@code{…}` record

why now   — the record is authored by hand today; Compose shows it as a plain code span, so a Compose author has no way to discover `numbers`, `focus=`, `copy` or `format`. Compose already keeps a record on the line above its fence (deck-markdown.ts recordHugsFence).
where     — docs/src/lib/compose/, beside the fence language picker; the fields are lib/plugins/code/shared/record.js SPEC.
done when — a popover beside a fence's language picker edits its record, writes the `@code{…}` line, changes only the words edited, and round-trips byte-for-byte.
evidence  — a Compose e2e that opens the popover, toggles numbers, and reads the source back.
verify    — npx vitest run src/lib/compose; the new e2e on the desktop project.
