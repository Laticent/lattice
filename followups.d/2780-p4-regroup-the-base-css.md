---
origin: 2780
priority: P4
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §7
source: https://github.com/Laticent/lattice/pull/2780
---

# Regroup the always-on base CSS so a deck loads less

why now   — after minifying, the median deck still loads 195 KB because a few modules are unconditional: journey (a :root block), base:card-tag, base.tokens, and the Mermaid and chart-family sheets (loaded when a generic section svg path selector is met).
where     — lib/components/journey, lib/base/base.card-tag.css, lib/base/base.tokens.css, lib/plugins/mermaid/mermaid.styles.css. Note §7 'regrouping' lists three moves.
done when — tools/style-needs-audit.mjs --all reports a lower median with 0 misses and the computed-style gate identical on all 281 decks.
evidence  — the audit's regroup table before and after.
verify    — tier 1 independent checker: moving rules changes the cascade, and source order is the cascade (#1, #26).
