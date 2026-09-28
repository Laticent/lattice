---
origin: 2456
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2456
priority: P3
---

# A restyle does not wait for a new theme's faces

why now   — #2456's in-place restyle keeps the frame's reveal open, so a theme whose
            faces differ could paint fallback text for a moment. Plausible, not observed.
where     — `restyleDocument` in `docs/src/playground/deck-preview.js`; the font gate is
            `lib/core/preview-font-gate.mjs`.
done when — a restyle to a theme with unloaded faces either waits for them or is measured
            to show no fallback frame.
evidence  — a frame-by-frame capture of a palette switch between two different-face themes.
verify    — tier 2: the built Playground, cold font cache.
