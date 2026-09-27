---
origin: 2385
priority: P1
recorded: 2026-09-27
---

# A mid-size graph chart's drawing lags typing by one to two seconds in the Studio

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
       where     — docs/src/lib/trama/kernel.ts: `costOf` (~35% of self time), `cheap`,
                   `build`, `crossings`, `seatCost`, `sharesRun`; the fit's rounds in
                   pipeline.ts (the secant step in the cold-load PR cuts them).
       done when — an 11-to-14-state machine lays out in under 150 ms in Node, and a
                   27-key burst shows its last key drawn within 400 ms of the key.
       evidence  — `npm run bench` GRAPH LAYOUT tier before/after (HARD RULE #19), plus a
                   re-capture of .scratch/typing/flat-v2.md (in the PR body) as a fixture.
       verify    — tier 1: bench + the burst harness on the real Studio.
```
