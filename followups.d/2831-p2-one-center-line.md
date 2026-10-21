---
origin: 2831
recorded: 2026-10-20
area: engine
swimlane: engineering/decisions/2026-10-20-inline-objects-audit.md
source: https://github.com/Laticent/lattice/pull/2831
priority: P2
severity: low
---

# Pick one vertical center line for inline objects

The pill centers on the x-height (vertical-align middle) and sits about 0.10em below the cap-height center; the check disc centers on the cap height (median 0.007em). A pill beside a disc is about 0.1em apart.

why now   — the owner asked that inline objects sit on the text's line without looking out of place.
where     — lib/plugins/pills/pills.styles.css (vertical-align) and base.modifiers.css (.lat-state vertical-align).
done when — one rule for both, the audit's alignment medians within 0.03em of each other, the PDF checked.
evidence  — the audit's alignment lines before and after.
verify    — tier 2: visual change on every slide with a pill or a mark; owner decides which line.
