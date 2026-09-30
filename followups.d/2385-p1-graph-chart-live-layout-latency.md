---
origin: 2385
priority: P1
recorded: 2026-09-27
---

# A mid-size graph chart's drawing still trails a typing burst by about a second in the Studio

```text
  P1 · [no ticket] Cut the router's cost per layout, so the live preview keeps up with typing.
       why now   — measured on state chart v2 (the Studio burst-typing run for PR "state chart
                   v2 on Trama"): an 11-state machine takes ~470 ms per layout in the browser
                   and ~400 ms in Node, and the fit runs 3 layouts per keystroke. The worker
                   keeps the KEYS moving (0 main-thread layouts), but the DRAWING stays frozen
                   for the whole burst and catches up 1.6-2.3 s after the last key. v1's own
                   router answered in ~56 ms on the main thread (with 361 long tasks). Main's
                   kernel costs ~320 ms on the same calls, so most of it is the shared router
                   the flowchart already pays; v2's kernel additions add ~25%.
                   Past budget it is worse: the 36-state, 104-transition type-floor fixture
                   takes 7-13 s per layout (main's kernel too, which the flowchart already
                   pays); the fit now stops after one round there, so a --fluid page loads
                   in ~6.5 s where it took 29 s, but that is still one blocking layout.
                   PARTLY FIXED in #2424's second commit: every fit round paints (key to
                   visible 1,346 -> ~270 ms) and the kernel is ~34% faster with identical
                   layouts (bench: state chart tier 1,747 -> 1,152 ms). Still open: the last
                   key of a 50 ms/key burst lands ~0.8-1.0 s later on the 11-state chart, and
                   one layout still costs ~300 ms in Node. Commit 4 made wrapping cheap (routes 77 -> 30 on the stress deck, 1,152 -> 533 ms, identical output); the 11-state chart now routes 1-2 grids, ~110-190 ms warm, and one routing pass (~100 ms) is the remaining floor.
                   Measured on the real Studio after commits 3-5 (2 runs): key to visible
                   207-236 ms, last key of a 50 ms/key burst drawn 316-464 ms later, worker
                   104-111 ms per layout, 0 long tasks.
                   Sticky wrap (#2424, last commit): a live keystroke lays out the wrap the last
                   search chose; key to visible 280-325 -> 158-202 ms (state chart), 230-241 ->
                   193-214 ms (flowchart), rows hold while typing. Then dagre picks pinned
                   too and the pause search in its own worker: at 600 ms a key, a key's
                   layout lands in 150 / 214 ms (median / p90, 11 states) and 242 / 423 ms
                   (12 states with a composite), no state unpainted. What remains: every
                   routing of this chart hits the router's 20,000-evaluation cap, as a
                   flowchart too; that is followups.d/2424-p3-trama-wrap-aware-placement.md.
       where     — docs/src/lib/trama/kernel.ts: `costOf` (~35% of self time), `cheap`,
                   `build`, `crossings`, `seatCost`, `sharesRun`; the fit's rounds in
                   pipeline.ts (the secant step in the cold-load PR cuts them).
       done when — an 11-to-14-state machine lays out in under 150 ms in Node, and a
                   27-key burst shows its last key drawn within 400 ms of the key.
       evidence  — `npm run bench` GRAPH LAYOUT tier before/after (HARD RULE #19), plus a
                   re-capture of .scratch/typing/flat-v2.md (in the PR body) as a fixture.
       verify    — tier 1: bench + the burst harness on the real Studio.
```
