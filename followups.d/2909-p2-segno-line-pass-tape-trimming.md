---
origin: 2909
priority: P2
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md § G6 landed
source: https://github.com/Laticent/lattice/pull/2909
---

# The generated Segno line pass reaches 62 to 72% of the hand-written loop; the rest is tape writes

status    — narrowed 2026-10-29: the walk, not the tape, was the cost. The generated parse alone runs at
            637-660 MB/s against the hand loop's 608-626; two fixes to the walk took the line pass from
            381 to 471 MB/s (77% of the hand loop), and the rest is the second pass itself. The wasm
            answer is no. Both are recorded in the pipeline note's "Tape trimming, measured". What is
            left is the second machine's run of the same command.
why now   — G6 raised the generated line pass from 315 to 460 MB/s (machine 1) and from 397 to 558 MB/s (machine 2) against 642 and 906 MB/s for the same job by hand. The remaining gap is node bookkeeping and tape writes, not run scanning, so more run work will not close it. The deck pipeline's target for S0-S1 on the 59 KB gallery is under 0.5 ms, and wasm is considered only if that is still missed after this step.
where     — `docs/src/lib/segno/codegen.ts` (the `node` case writes four integers per node), `tools/parser-bakeoff/deck/staged.mjs`.
done when — the generated line pass is within 15% of the hand loop on both bake-off machines, or a measured reason says why it cannot be, with the wasm question answered from that measurement.
evidence  — the PR #2909 body and the "G6 landed" section of the pipeline note: both machines' medians of five.
verify    — tier 0: `npm run parser:bakeoff:deck -- --arms --runs 5` on two machines.
