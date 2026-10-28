---
origin: 2941
priority: P2
recorded: 2026-10-28
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-26-playground-anti-pattern-slide.md
source: https://github.com/Laticent/lattice/pull/2941
---

# waterfall's stress slide clips the -4.2M label and truncates axis labels

why now   — the export sweep reports the waterfall gallery page 5 (the stress slide) as newly clipped, and the Playground shows it.
where     — `lib/components/chart/waterfall/` (kernel and `stressDoc`); the slide is "The quarter we went negative and came back."
done when — the stress slide renders with no clipped label and no `Receip…` / `Tax settle…` truncation, and `test/integration/overflow-baseline.json` has no waterfall page 5.
evidence  — `waterfall.gallery.md` page 5 at design size: the -4.2M label sits on the plot's bottom edge.
verify    — render the gallery, `npm run overflow:check`, and look at the slide.
