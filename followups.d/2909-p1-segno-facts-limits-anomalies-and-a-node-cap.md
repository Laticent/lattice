---
origin: 2909
priority: P1
recorded: 2026-10-28
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §R1
source: https://github.com/Laticent/lattice/pull/2909
---

# Segno has no cap on the tape and reports nothing about what a parse capped or skipped

why now   — The 2026-10-27 design note settles that Segno reports facts and callers decide. Its first phase (R1) is the one place the core has a real gap: `grow()` in the generated parser doubles the tape with no limit, so one hostile 3M-character flowchart row held 67 MB before `parse()` let it go (phase 3b's red team). The same phase adds the general facts every dialect needs: which runtime cap a parse hit (depth, stack, tape size), input anomalies found once at S0 (bidi controls, NUL, lone surrogates, C1 controls, mixed line endings) and the ranges no rule read.
where     — `docs/src/lib/segno/codegen.ts` (the generated `grow()` and `parse()`), `docs/src/lib/segno/flat.ts`, the S0 ingest in `engineering/decisions/2026-10-22-segno-deck-pipeline.md`.
done when — a `maxNodes` option stops a parse and says so in the same shape as the `stack` error; a parse result carries `limits`, `anomalies` and `coverage`; the generated parsers stay byte-identical on grammars that set nothing; `mutate:segno` gains mutants for each new path; the three Segno benches do not regress (HARD RULE #19).
evidence  — the design note's §"Segno core: limits and anomalies"; the 67 MB figure is in the comment above `buf` in `docs/src/lib/segno/codegen.ts`.
verify    — tier 1: a differential on the corpus (old vs new generator), then the Segno suite and `npm run mutate:segno`.
