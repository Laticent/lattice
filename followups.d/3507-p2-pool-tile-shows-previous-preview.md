---
origin: 3507
priority: P2
recorded: 2026-11-23
area: website
severity: medium
swimlane: docs/src/components/studio/preview-pool.tsx (header, re-point measurements)
deferred: large — the fix changes how the preview pool re-points slots, a perf-tuned subsystem whose throttle carries measured WebKit memory numbers, so it owes its own before/after (HARD RULE #19), not a ride on a search PR
source: https://github.com/Laticent/lattice/pull/3507
---

# A gallery tile briefly shows the previous search's preview

why now   — Found while screenshotting #3507 in the real Studio (Chromium, 1440 wide). Type `movie` in the New
            slide gallery, then `science`: for the first moment, the `diagram` and `math` tiles show the video
            slide's poster; within about 6 s every tile shows its own preview. The pool positions a slot over a
            tile and re-points it at most once per APPLY_MS, so a re-ranked result list keeps the old picture until
            the next pass. #3507 does not touch the pool; main behaves the same.
where     — docs/src/components/studio/preview-pool.tsx (`PooledThumbFace`, `updateProps`, the re-point pass);
            every grid that uses `PooledThumbFace`, the add-slide gallery first.
done when — A tile whose sample changed never shows another component's picture: it shows its blank face until
            its own render lands, on Chromium and WebKit.
evidence  — Screenshots of the same `movie` → `science` sequence at 0 ms and 6 s, before and after; the pool's
            WebKit memory re-point row re-measured (#19).
verify    — A Playwright check that types two queries in a row and asserts no tile's preview belongs to a
            component outside the current results, plus `npm run bench` for the pool.
