---
origin: 3081
priority: P2
recorded: 2026-11-08
area: infra
severity: low
swimlane: tools/check-overflow-corpus.js
deferred: large — a full-corpus parity sweep in both formats is about 70 minutes of renders
source: https://github.com/Laticent/lattice/pull/3081
---

# Prove `--format html` gives the same overflow verdict as pdf, then measure it

why now   — #3081 added `--format html` to `check-overflow-corpus.js` as an opt-in prototype.
            It skips the PDF writer, which plays no part in the verdict, so it may cut the
            nightly's cost. Nobody has compared its verdicts or timed it.
where     — `tools/check-overflow-corpus.js` (`--format`), `test/benchmark/engine-bench.mjs`
            (two rows, pdf vs html, for the bar gallery, were planned and never written).
done when — one full sweep in each format gives the same clipped pages on every deck, the
            two bench rows exist with numbers from `npm run bench`, and the default is either
            switched to html with that evidence or the flag is removed.
evidence  — both `--json` reports diffed to zero, and the bench numbers in the PR.
verify    — run locally; the nightly then shows the new `⏱ sweep cost`.
