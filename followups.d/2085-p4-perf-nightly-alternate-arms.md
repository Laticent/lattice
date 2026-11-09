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

2026-11-09, 13:14 UTC — no night read yet. The 11-09 scheduled run had not started (the 05:37 UTC cron has fired
between 11:53 and 13:27 UTC this week). #2085 is already closed (the owner, 2026-11-08 20:22 UTC), so the alarm can no
longer append to it: `perf-nightly.yml` finds the rolling issue among OPEN issues by its title marker, and a noise
filing would now show up as a NEW `[perf-nightly] docs perf regression detected` issue. So the week's test is "no new
such issue for a drop inside the noise band" across the 11-09 to 11-15 scheduled runs; list them with
`gh api 'repos/laticent/lattice/actions/workflows/perf-nightly.yml/runs?per_page=10'` and read each run's perf-report
artifact. Nothing is left to close; delete this file (and its pair) after the 11-15 run if none of the seven filed one.
