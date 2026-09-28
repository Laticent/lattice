---
origin: 2456
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2456
priority: P3
---

# Explore shows a ~4px sliver of the neighboring slides

why now   — #2456 centered stepped slides; at 1440x900 the centering inset (20.5px) exceeds
            the filmstrip gap (16px), so a thin strip of the previous and next slide shows.
where     — `docs/src/playground/deck-preview.js` fit gap (`gap: 16` from
            `docs/src/lib/playground-engine.ts`) vs `scrollWalk` in PlaygroundApp.tsx.
done when — a stepped slide in Explore shows no part of another slide at 1440/820/390.
evidence  — screenshots at the three widths.
verify    — tier 2: the built Playground.
