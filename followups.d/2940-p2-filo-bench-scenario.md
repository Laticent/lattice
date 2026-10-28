---
origin: 2940
priority: P2
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §9
source: https://github.com/Laticent/lattice/pull/2940
---

# npm run bench has no Filo scenario

```text
  P2 · [no ticket] add commit, undo and broad-change rows on the 134 KB deck to npm run bench
       why now   — the note's §9 asks for it (HARD RULE #19 shape); PR 2940 sped up trimPatch
                   (4-17 ms -> ~1 ms per undo in Chromium) with e2e measures but no bench row.
                   Slice 5 (persistence, the worker) is the slice that changes Filo's heavy work.
       where     — test/benchmark/engine-bench.mjs, docs/src/lib/filo
       done when — a blessed Filo tier in baseline.json that bench:check gates.
       evidence  — the tier's rows before and after slice 5.
       verify    — tier 0.
```
