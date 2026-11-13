---
origin: 3197
priority: P1
recorded: 2026-11-13
area: imagery
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — the product fix changes lib/core/collage-lightbox.mjs, which the exported web player copies, so it changes export bytes and needs the owner's sign-off (Quality Bar)
source: https://github.com/Laticent/lattice/pull/3197
---

# The lightbox zooms toward the photo's corner when + comes before the photo loads

why now   — docs/e2e/collage-lightbox.spec.ts:534 failed once in a full desktop @smoke run under load (zoom read 1
            after a drag, expected 1.95). It did not reproduce in 39 runs, including 20× CPU throttling. The
            investigation found two real defects next to it.
where     — lib/core/collage-lightbox.mjs: a zoom step before the image has its size is computed against a 0×0
            box, so it zooms toward the top-left corner, and the open glide then runs under the zoomed photo.
            (The test helper half, `glideDone` reading the img instead of its frame, is fixed in #3197.)
done when — a zoom step before the photo has its size is ignored (or deferred until load), and spec :534 passes
            with the image request held until after the + presses.
evidence  — the held-image repro red before and green after; the light and dark player export sent for sign-off.
verify    — tier 1 maker-checker: the lightbox ships inside the exported player.
