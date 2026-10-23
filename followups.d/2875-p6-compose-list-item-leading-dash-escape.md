---
origin: 2875
priority: P6
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7
source: https://github.com/Laticent/lattice/pull/2875
---

# Compose: a list item's leading `-` writes back escaped, and the engine marks it

why now   — the fourth checker on #2875 found it; main does the same. The upstream first-line escape writes a list item that starts with `-` as `\-`, which the engine renders as `<span data-esc>-</span>`; the flowchart reader then treats it as text, not an arrow. Seen in examples/callouts-schedule.md (`  - -SEV2-> Open ticket`).
where     — docs/src/lib/compose/deck-markdown.ts (the `paragraph` serializer's first-line escape; `guardParagraphLines` now probes that line and could drop an escape that guards nothing).
done when — `- -SEV2-> Open ticket` round-trips byte for byte and renders the same.
evidence  — a unit arm rendering through lib/engine.
verify    — tier 1 checker.
