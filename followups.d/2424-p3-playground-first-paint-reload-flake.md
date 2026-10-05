---
origin: 2424
priority: P3
recorded: 2026-10-05
---

# The playground's reload first-paint smoke test timed out once waiting for the stored slide

```text
  P3 · [no ticket] Name why the reload first-paint smoke test sometimes waits 40 s for a
       stored slide that never comes.
       why now   — studio-smoke's playground-first-paint.spec.ts:198 ("a reload paints one
                   geometry per element") timed out once at 40 s in `seedRealSession`,
                   polling for `lattice-docs-pg-last-slide`, on code that passed it before
                   and after (5 of 5 locally). An intermittent failure in studio-smoke costs
                   every PR a re-run.
       where     — docs/e2e/playground-first-paint.spec.ts:171 (`seedRealSession`), and
                   whatever writes the `lattice-docs-pg-last-slide` key.
       found     — 2026-10-05, on the PR that recorded this: the Playground captured its first
                   slide ONCE, 1.5 s after the first render (PlaygroundApp.tsx), and a capture
                   refuses an unfitted or placeholder slide, so one early try left nothing
                   stored until the tab hid. That is the likely cause; it was NOT reproduced.
                   Fixed there (9f4bb47: retry every 1.5 s, up to five more times). A 30-run
                   repeat after the fix (2 workers, a loaded machine): 0 seed timeouts, but
                   1 of 30 failed on another assertion of the same test, `.pg-bar` (the
                   toolbar) laid out 2 ways, [0,61,1194,17] at 498 ms then [0,61,1194,53] at
                   596 ms: the toolbar growing as it hydrates, before any capture runs.
                   Then CI's studio-smoke hit the same seed timeout WITH that retry (on
                   fb041d4; it had passed on 6a39c34, same code), so a window anchored to the
                   first render was not enough. 0265c61 anchors it to the reveal (is-live),
                   retries for up to 45 s, and logs the check that refused on giving up:
                   12 of 12 seed runs and 10 of 10 test runs pass locally on 2 loaded cores.
                   Still open: the cause confirmed from a CI trace (the next failure logs
                   it as "[playground] no first-slide snapshot stored: <reason>"), and that
                   toolbar jump.
       2026-10-05 — the continuation session (PR "perf(trama): no forced style
                   pass…"): 60 of 60 clean on the merged code, production build,
                   --repeat-each 30 twice (--workers 2, CI's shape, 6.7 min; then
                   --workers 4 on this sandbox's cores, 4.3 min). Neither the seed
                   timeout nor the .pg-bar jump came back. A frame probe of a cold
                   visit at 6x CPU throttle holds the toolbar at 53 px from its first
                   sampled frame. CI's studio-smoke has been green since 0265c61
                   (#2516, #2517), so no CI log carries the logged reason yet. The
                   toolbar's 17 px reading is padding plus border with zero-height
                   children, so a fix aimed at it now would be a guess; this stays
                   open until a failure logs its reason.
       done when — the cause is named, and the test passes 30 of 30 with --repeat-each in
                   CI shape.
       evidence  — the repeat run, and the cause in the PR body.
       verify    — tier 0, because it is a test or a timing fix.
```
