---
origin: 2875
priority: P8
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7b
source: https://github.com/Laticent/lattice/pull/2882
---

# Compose draws a state chip on a list item whose layout draws no marker

why now   — a phone test of #2882's preview showed Compose painting green `[x]` chips on `- [x] text` bullets in a `content` slide, while the slide itself prints `[x] text` as plain text. `stateMarkerPlugin` paints "wherever it leads" on purpose (every layout reads a marker through the list-text grammar), but only checklist, verdict-grid and pricing draw it. The escape makes no difference: the engine reads `\[x\]` as `[x]` (checked on the corpus: 62 slides, rewriting every marker to the escaped form changed no engine output), so an escape-based fix is wrong and was tried and reverted on #2882.
where     — docs/src/components/studio/ComposeView.tsx (`stateMarkerPlugin`, the `list_item` branch), `slideClassOf` and a list of the marker-drawing classes, the way `STATEFUL_CLASSES` already gates table cells.
done when — Compose paints the chip only where the slide does; a bullet in a `content` slide is plain text in both.
evidence  — an e2e with one `content` slide and one `checklist` slide, counting chips.
verify    — tier 1 checker.
