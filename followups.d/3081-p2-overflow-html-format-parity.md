---
origin: 3081
priority: P2
recorded: 2026-11-08
area: infra
severity: low
swimlane: tools/check-overflow-corpus.js
deferred: large — a new render mode for the sweep needs a full-corpus parity sweep in both formats (about 70 minutes of renders) and bench rows before it can ship
source: https://github.com/Laticent/lattice/pull/3081
---

# Add `--format html` to the overflow sweep once it proves the same verdict as pdf

why now   — the nightly is close to its time limit, and the sweep renders full PDFs only to
            read a console line. Rendering each deck to `.html` runs the same Chromium layout,
            auto-split and clip probes and skips the PDF writer. #3081 prototyped it as
            `--format html` and took it back out because nobody had compared its verdicts
            or timed it.
where     — `tools/check-overflow-corpus.js` (`probe()` picks the output extension), `test/benchmark/engine-bench.mjs`
            (two rows, pdf vs html, for the bar gallery, were planned and never written).
done when — one full sweep in each format gives the same clipped pages on every deck, the
            two bench rows exist with numbers from `npm run bench`, and the sweep uses html
            with that evidence, or the idea is dropped with the numbers that killed it.
evidence  — both `--json` reports diffed to zero, and the bench numbers in the PR.
verify    — run locally; the nightly then shows the new `⏱ sweep cost`.
