---
origin: 3059
priority: P3
recorded: 2026-11-06
area: chart
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: off-path — a lib/ fix in the narrator; #3059 changes tests only, and its per-child bound does not trip on it
---

# `stripTrailingPills` re-matches the whole lead once per trailing pill

why now   — `stripTrailingPills` in lib/core/chart-narration.js:189 runs a lazy regex over the remaining lead for each
            trailing pill, so its cost is pills × line length. Found by #3059's chart-row-record rewrite: characters read
            per input character grow 124 → 206 → 528 at 100 → 400 → 1,600 pills (443 ms at 1,600).
where     — lib/core/chart-narration.js `stripTrailingPills`.
done when — one right-to-left pass strips every trailing pill, and a `scanWork` bound in
            test/unit/core/chart-narration.test.js holds the per-character count flat across 100 → 1,600 pills.
evidence  — the count at both sizes, and the bound failing on the current code.
verify    — self-review with the gates.
