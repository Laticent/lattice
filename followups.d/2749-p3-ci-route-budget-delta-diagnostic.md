---
origin: 2749
priority: P3
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
---

# Find why CI reads a few bytes of route-budget delta on a markdown-only change.

why now   — #2749 changes only markdown, followups and one code comment, yet CI read studio +13
            bytes and playground -3 against `main`. A local build reads +0 on every metric of
            every route, in every comparison tried. The studio is over its soft target, so every
            byte there must be declared, and each markdown-only PR can owe a declaration it did
            not cause. This is independent of what #2749 says and does not bear on its merge.
where     — .github/workflows/ci.yml (the "Measure the base" step and the docs build);
            docs/scripts/measure-route-base.sh; docs/scripts/check-route-budget.mjs;
            engineering/gotchas/ci.md ("A PR that changes only markdown fails the route budget",
            which lists what was ruled out).
done when — one CI run on a markdown-only PR saves both builds' output (the base and the PR),
            the two are diffed, and the cause is named; then either the cause is fixed or the
            gate stops charging for it. The gotcha entry is updated to the answer.
evidence  — the diff of the two saved builds, file by file, from the CI run.
verify    — tier 1; the change is to a CI step, so it needs the owner's OK before it is added
            (HARD RULE: the CI contract is the owner's call).
