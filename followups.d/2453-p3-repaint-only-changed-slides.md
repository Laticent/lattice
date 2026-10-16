---
origin: 2453
priority: P3
recorded: 2026-09-28
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-inline-sparks.md
source: https://github.com/Laticent/lattice/pull/2453
---

# Repaint only the slides whose ink changed

why now   — `paintRoughInk` removes and rebuilds every slide's ink overlay whenever any plan
            changes, and the whole-document restyle that follows dominates the cost. Measured
            on a 6-slide sketch deck (#2453 session): ~56 ms per repaint, ~48 ms of it with
            sparks excluded — so it predates sparks and every sketch deck pays it in the
            live preview.
where     — lib/core/rough-ink-dom.js `paintRoughInk` (replaces all overlays) and the
            runtime's single deck-wide fingerprint in lib/runtime/index.js `startRoughInk`.
done when — a change repaints only the sections whose plans changed, keyed by a per-section
            fingerprint; the export path's output is unchanged.
evidence  — .scratch/perf/paint.mjs in the #2453 session: all paths 56.4 ms median,
            non-spark only 48.2 ms.
verify    — HARD RULE #19: before/after numbers on a multi-slide sketch deck, and the Studio
            still inks a deck typed in, switched to boardroom and back.
