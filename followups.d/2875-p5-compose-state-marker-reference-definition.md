---
origin: 2875
priority: P5
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7
source: https://github.com/Laticent/lattice/pull/2875
---

# Compose: `- \[x\]: /u` writes back as a link reference definition

why now   — the fourth checker on #2875 found it; main does the same. `unescapeLeadingMarker` turns a list item's leading `\[x\]` into `[x]`, and `[x]: /u` is then a reference definition: the item renders empty (`<li></li>`).
where     — docs/src/lib/compose/deck-markdown.ts (`unescapeLeadingMarker`, the list-item branch of the `paragraph` serializer).
done when — a list item whose text is `[x]: /u` round-trips to a list item that renders its text.
evidence  — a unit arm rendering through lib/engine.
verify    — tier 1 checker.
