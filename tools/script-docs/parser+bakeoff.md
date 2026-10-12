---
group: Test & verify
---
Correctness bake-off for grammar libraries against the hand-written chart and inline-code kernels: the axis bracket list, the flowchart row, the gantt time span, the chart value pill and the inline-code dispatcher, each re-implemented in Peggy, Chevrotain, Ohm, Nearley, Parsimmon and Lezer and held to deep-equal parity with the shipped kernel over every inline-code span in the decks plus a seeded 20k-input fuzz per target. The incumbent runs as its own control row. Chevrotain is already in the tree (mermaid → langium); the rest is opt-in via `npm i --no-save peggy@5 nearley@2 moo ohm-js@17 parsimmon @lezer/generator @lezer/lr`. On-demand. See engineering/decisions/2026-09-28-parser-library-bakeoff.md.
