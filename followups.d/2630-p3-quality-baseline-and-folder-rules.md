---
origin: 2630
priority: P3
recorded: 2026-10-11
area: infra
severity: low
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §8
source: engineering/decisions/2026-10-11-codebase-structure.md §8
---

# Re-bless or fold npm run quality's stale baseline and folder rules

why now   — test/quality/baseline.json records 64 functions over the complexity threshold, and the
            tree has 663. Nothing runs `npm run quality`, so its baseline went stale. Its
            .dependency-cruiser.cjs folder rules duplicate what tools/structure.js now gates, so the
            repo has two structure vocabularies. Changing what an on-demand check reports is the
            owner's call.
where     — tools/quality-assessment.js, test/quality/baseline.json, .dependency-cruiser.cjs,
            engineering/quality-assessment.md.
done when — the owner picks one: re-bless the baseline, fold the boundary rules into
            tools/structure.js, or retire the duplicated rules. The doc says which.
