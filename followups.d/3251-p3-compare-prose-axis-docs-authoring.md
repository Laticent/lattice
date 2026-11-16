---
origin: 3251
priority: P3
recorded: 2026-11-16
area: comparison
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: off-path — a pre-existing doc contradiction in the manifest's slot text and common mistakes; #3251 changes only the stylesheet, and rewriting the authoring contract needs its own docs review
source: https://github.com/Laticent/lattice/pull/3251
---

# compare-prose docs still teach the old blank-lead `axis` authoring

why now   — #3251's card checker found compare-prose.docs.md contradicting itself: the options slot (line 22) and a common mistake (line 41) tell authors to leave the outer bullet blank and nest a numeral/title/description sub-list, while the stylesheet and the gallery generate the numeral from an ordered list (`1. Own the verb` / `- the body`).
where     — lib/components/comparison/compare-prose/compare-prose.manifest.json (slots.options description, commonMistakes), which generate compare-prose.docs.md.
done when — the docs describe only the ordered-list `axis` form the gallery uses, and no line tells an author to leave a lead blank.
evidence  — compare-prose.docs.md:22 "In `axis`, leave the lead blank and nest a 3-item sub-list instead"; :41 the matching common mistake; the gallery's axis slide (s10) and the stylesheet's numeral comment use `1. Own the verb`.
verify    — read the regenerated compare-prose.docs.md, and author an `axis` slide from it alone; it should render like the gallery's s10.
