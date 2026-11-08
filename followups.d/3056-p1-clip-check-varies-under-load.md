---
origin: 3056
priority: P1
recorded: 2026-11-08
area: engine
severity: medium
swimlane: engineering/pipeline.md
deferred: off-path — the CLI clip check and its font settle (lattice.js); the varying run used no progress-rail setting, and this PR does not touch that code
source: https://github.com/Laticent/lattice/pull/3056
---

# The CLI's CONTENT CLIPPED report varied between identical renders

```text
  P1 · find why the clip check flagged 13 slides once and none on reruns
       why now   — `node lattice.js examples/gallery-jargon.md out.html cuoio -q --no-split`
                   (no progress-rail key, so the default placement) reported "CONTENT CLIPPED
                   — 13 slides … pages 16, 24, 29, 38, 39, 40, 42, 43, 48, 50, 51, 52, 54"
                   twice in a row on 2026-11-07, then nothing on four reruns of the same
                   files. The two that flagged ran while the machine was loaded (a docs build
                   and an agent's Playwright renders); the reruns ran on an idle machine.
                   Lead, not a finding: the embedded watcher settles fonts with a 2000 ms
                   deadline (`settleFonts(document.fonts, 2000)`, lattice.js), so under load
                   it may measure footers in the fallback font, which is wider, and see an
                   ellipsis that a settled render does not draw. Not reproduced on purpose.
       where     — lattice.js (the embedded overflow watcher and its font settle);
                   lib/core/font-settle.js.
       done when — the clip report for a fixed deck is the same with and without CPU load,
                   or the cause is named with a reproduction (e.g. run the render under
                   `stress`/a parallel build and compare the report 10 times).
       evidence  — the report text from a loaded and an idle run of the same deck.
       verify    — tier 0: two CLI renders, one under load.
```
