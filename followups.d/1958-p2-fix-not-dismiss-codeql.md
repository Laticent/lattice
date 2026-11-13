---
origin: 1958
priority: P2
recorded: 2026-11-08
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-26-codeql-triage.md §7
deferred: large — about 35 alerts across 14 files (19 polynomial-regex alerts in four chart test files alone), each a code change with its own test, which is a PR of its own and not the security pass that found the policy
source: https://github.com/Laticent/lattice/pull/3084
---
# Fix the remaining CodeQL alerts instead of dismissing them

why now   — the owner ruled on 2026-11-08 that a CodeQL alert is dismissed only for an
            extraordinary reason with evidence. The triage note's §2 false positives and §3
            "used in tests" alerts were going to be dismissed; under the rule each is fixed.
where     — the alert list in engineering/decisions/2026-10-26-codeql-triage.md §2, §3 and §5
            (notes-core HTML_BLOCK_ENDS, editor.js, slide-context.js, the three script-URL
            loaders, specimen.js, the heatmap/map/quadrant/word-cloud tests, pptx-export,
            shadcn-bridge, interpret, slide-directives, the npm-plugin canary fixture,
            check-overflow and check-preview-render).
done when — the CodeQL check reports zero open JavaScript alerts on main, or each one left
            open has a written, evidence-backed exception in the triage note §7.
evidence  — per alert: the commit that fixes it and a test that fails on the old form; for
            polynomial regexes, a work count (scanWork / charReads), never a wall-clock guard.
verify    — tier 1, maker-checker: some of these sit in the markdown-it mask (notes-core),
            where widening a pattern is the leak direction (§5).
