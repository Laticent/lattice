---
origin: 2692
priority: P2
recorded: 2026-10-14
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2692
---

# Give the inline-span path a bench scenario, so HARD RULE #19 holds for Segno speed work

why now   — #2683 and #2692 both changed per-span cost (a pill's parse, isDirective's tag guard) and
            both shipped without a `npm run bench` scenario that can see it: a whole-deck render
            cannot resolve 15-45 ns a span, and `test/benchmark/baseline.json` was not re-blessed
            either time. The bakeoff (`npm run parser:bakeoff:segno`) is the only evidence today,
            and it is on-demand, not ratcheted.
where     — test/benchmark/engine-bench.mjs: a scenario that dispatches the decks' inline-code
            spans through lib/core/inline-code-directives.js (escape + `dispatches`), timed with
            the slice-paired method from tools/parser-bakeoff/segno.mjs `timeSet` so the band
            holds; then `npm run bench:bless`.
done when — `npm run bench:check` reports the inline-span scenario within its band on five runs of
            unchanged code, and a deliberate 15 ns regression (re-adding `TAGS.includes` in
            isDirective) moves it outside the band.
evidence  — five bench:check readings, plus the regression arm's reading, pasted in the PR.
verify    — tier 0 gates: a measurement scenario, no shipped code.
