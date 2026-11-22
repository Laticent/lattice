---
origin: 3148
priority: P4
recorded: 2026-11-12
area: imagery
severity: low
swimlane: engineering/decisions/2026-11-11-deferred-asset-bytes.md §7
deferred: blocked — trades the camera's strip-by-strip photo read (phone memory) for whole-photo pixels; needs a real iPhone memory measurement first
---

# Shrink photos (Lanczos) in a worker instead of on the main thread

why now   — The camera shrinks each photo to its drawn size on the main thread: ~95 ms a photo, 1.7 s for 18 photos, once
            per export (memoized). A worker needs the whole photo's pixels at once (48 MB for 12 megapixels), which the
            strip reader exists to avoid on phones.
where     — lib/core/slide-camera.mjs `resamplePicture`, docs/src/lib/lastra/resize.ts `lanczosResize`.
done when — either the resample runs in the picture pool with the same output bytes and a measured iPhone memory peak
            that stays safe, or this item is closed with that measurement as the reason.
evidence  — export time and peak memory on a real iPhone for a 12-megapixel photo deck, before and after.
verify    — tier 1: maker-checker.
