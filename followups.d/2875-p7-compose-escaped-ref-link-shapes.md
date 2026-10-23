---
origin: 2875
priority: P7
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7
source: https://github.com/Laticent/lattice/pull/2875
---

# Compose: round trip changes link reference definitions on other slides

why now   — the checker on the `[x]: /u` fix found two cases that predate it and are off its path. (1) A slide that holds `[t]: /t` loses the definition on round trip, so a `See [t].` on another slide stops linking, and `hasLossyConstruct` does not lock it. (2) A `- \[x\] done` item on one slide becomes a live link to a `[x]: /def` defined on another slide, because the parser cannot tell `\[x\]` from `[x]`.
where     — docs/src/lib/compose/deck-markdown.ts (the markdown-it reference handling), docs/src/lib/compose/deck-source.ts (`hasLossyConstruct`).
done when — a slide with a reference definition either keeps it on round trip or locks; the deck-wide case has a decision.
evidence  — a unit arm rendering a two-slide deck through lib/engine before and after.
verify    — tier 1 checker.
