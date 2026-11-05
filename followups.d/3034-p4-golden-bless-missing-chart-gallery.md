---
origin: 3034
priority: P4
recorded: 2026-11-04
area: infra
severity: high
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §5
deferred: off-path — tools/golden-bless.mjs broke with the chart move (#2997), before this PR; this PR changes nothing it runs
---

# golden-bless exits 3: rasterize-showcase needs a chart gallery PDF that is not rendered yet

Since 2026-11-03 tools/golden-bless.mjs:338 exits 3 because rasterize-showcase cannot find lib/plugins/chart-family/kinds/bar/bar.gallery.light.pdf. The chart move (#2997) made about 56 first-time goldens and the bless renders at most 40 a night. Render a missing source gallery before rasterizing it, or skip it. integration-nightly's component-gallery check now fails under green as a result.

done when — golden-bless exits 0 on a night with more than 40 first-time goldens, and the component-gallery check passes in integration-nightly.
