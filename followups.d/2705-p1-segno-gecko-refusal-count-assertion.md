---
origin: 2705
priority: P1
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2705
---

# The `@gecko` Segno playground spec expects a refusal summary the library no longer writes

why now   — `docs/e2e/segno-playground.spec.ts` step 7 waits for `… and 44,800 more` under
            the 300-alternative grammar. The unchanged Segno library now summarizes that
            refusal as `k: 295 more branches can start with a character an earlier branch
            takes`, so all three `@gecko` widths fail (seen on #2705 against a built site,
            desktop project; the grammar code was not touched there).
where     — docs/e2e/segno-playground.spec.ts step 7; docs/src/lib/segno/grammar.ts (the
            summary line); docs/src/pages/libraries/segno/index.astro renders the verdict.
done when — step 7 asserts the summary the engine writes today (and the shown-problem count
            it still pins), and the `@gecko` and `@webkit-tablet` variants pass.
evidence  — the spec green in its own project, with the trace of step 7.
verify    — self-review; it is a test-expectation change unless the library's summary is
            itself the regression, in which case fix the library instead.
