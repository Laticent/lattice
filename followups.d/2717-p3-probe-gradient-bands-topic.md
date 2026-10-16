---
origin: 2717
priority: P3
recorded: 2026-10-16
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §13
---

# the render tier excludes topic's tab labels (1.02:1 on text that renders dark on light) in tools/conformance-render.js; note §6.3 rule 7 says fix the probe first, and the exclusion hides a real topic regression

why now   — tools/check-slide-contrast.js (serves five gates); PROBE_LIMITS in tools/conformance-render.js
where     — the probe scores topic's tab labels correctly, PROBE_LIMITS is empty, and the five gates' pinned counts are re-blessed with the diff explained
done when — topic slide 2 before/after in the PR body; every gate that uses PROBE green
evidence  — tier 1 (maker-checker): shared probe, five consumers
verify    — 
