---
origin: 2085
priority: P4
recorded: 2026-11-08
area: infra
severity: low
swimlane: engineering/decisions/2026-11-08-docs-perf-nightly-diagnosis.md §2
deferred: blocked — built on 2026-11-08 (perf-collect --base-docs, perf-nightly builds base first); the evidence clause needs a week of nightly runs after merge
---

# perf-nightly measures all head runs, then all base runs

The nightly collects every head run, then builds and collects every base run. Anything that drifts on the runner across the
job (thermal state, a noisy neighbor, CDN font loads) lands on one arm only. The 11-07 diagnosis alternated head and base
locally and found the reported +592 ms TBT was outside the measured 95% interval. Raising mobile runs to 5 (this PR) cuts
the median's spread; alternating removes the drift bias.

done when — docs/scripts/perf-collect.mjs serves both builds at once and runs Lighthouse head, base, head, base per URL, and
            perf-nightly.yml builds base before the collect step.
evidence  — the job's time before and after, and a week of nightly runs.
verify    — tier 1: maker-checker (it changes a nightly job's shape, so bring the owner the options first).

2026-11-08 — built: `perf-collect.mjs --base-docs` serves both builds and alternates per URL, flipping the order each
round; `perf-nightly.yml` builds base in its own step first. Both arms now use head's configs. What is left is the
evidence clause: a week of nightly runs. Read them with 3034-p5's week, then delete both files.
