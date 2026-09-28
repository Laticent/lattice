---
origin: 2410
priority: P2
recorded: 2026-09-27
---

# One desktop Studio e2e spec left from the "red on main" list: a load-sensitive rotation check

why now   — the nightly e2e cannot be trusted while specs are red on main. The list this file
            carried (14 specs, blamed on e504ac7) was re-run on 2026-09-28: 24 tests red across 8
            files, and e504ac7 caused none of them. 23 are fixed (see "resolved" below); this one
            is not.
failing   — studio-instant-shell.spec.ts:456 "rotating a phone into landscape leaves no chrome
            behind" — "the re-seed did not detect cinema after the rotation". It passes run alone
            (--workers=1, 3 of 3) and failed in 2 of 3 runs of the 8 files (--workers=2, and the default)
            on a 4-core box. So it depends on timing under load; the nightly runs --workers=2.
where     — docs/e2e/studio-instant-shell.spec.ts:456 and the instant shell's cinema re-seed.
how       — find what the re-seed waits for and assert that signal rather than a wall-clock
            window; "flake" is not a cause.
done when — the spec passes in a --workers=3 run of its file, several times.
evidence  — the spec at --workers=3, before and after.
verify    — tier 0: the spec.
resolved  — 2026-09-28, the 23 others, each by its own cause:
            • stage-window ×10: 0ee4ab0 (#2443) added a `route()` in `gotoStudio`; any request
              interception stalls the Stage popup's parser-blocking runtime script. The fixture
              now refuses the kokoro worker with an init script instead.
            • stage-window:372: a real bug — a Stage rewrite dropped the presenter view and
              re-zeroed the talk clock on every palette change. Fixed in PresentOverlay.tsx.
            • webpage-export ×2: a real bug from 1f21c66 (#2387) — the strip-notes export baked
              the authored render. Fixed in share-export.ts.
            • split:206: a real bug — a component pick with the preview collapsed left Explore
              showing the old deck. Fixed in PlaygroundApp.tsx.
            • playground-stress ×4: the kpi gallery grew 13 → 15 slides (#2399) and `flowchart`
              now tops a "chart" search (#2385); the specs track both.
            • inline-grammar:75: `[?]` became a state mark (#2327); the spec lists it as one.
            • status-pill ×2, theme-import ×2: spec drift after #2247, #2185, #2202 and #2402,
              plus one latent pointer-hover pause in status-pill:186.
