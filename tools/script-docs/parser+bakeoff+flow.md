---
group: Test & verify
---
Whether a Segno grammar can read flowchart rows (`Storefront -SEV1-> Payments`), against `splitRow` in lib/core/flowchart-grammar.js on every flowchart and state-chart row in the corpus plus a 200k-row fuzz: the strict row grammar (refused, and why), a committing one (compiles, and the rows it misreads), and the row grammar built on `attempt()` (tools/parser-bakeoff/flow-row-grammar.mjs) in both runtimes, with per-row time and a 2k/8k/32k hostile ladder against the kernel. The same grammar's corpus parity and a 20k-row slice of the fuzz run on every PR (test/unit/tools/flow-row-grammar.test.js). --json for machine output. On-demand, not a gate. See § Flowchart rows need a bounded attempt in engineering/decisions/2026-09-28-segno-unified-inline-notation.md.
