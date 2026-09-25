---
origin: 2358
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2358
---

# A video slide's poster blinks dark before its image paints

why now   — reported from an iPhone while testing #2358, and reproduced in a production build:
            the layout does not move, but `.video-poster` paints its fallback
            `background: var(--qr-ink, #14140f)` (near-black) until the poster image decodes, so a
            light poster flashes dark-to-white on every load. The engine HTML for this slide is
            identical on main; this predates #2358.
where     — lib/components/imagery/video/video.styles.css (the `.video-poster` background and the
            `.is-placeholder` rule). A poster WITH an image wants a neutral surface token under it
            (or a short fade once decoded), not the dark placeholder ink, which belongs to the
            no-image case.
done when — a video slide with a light poster shows no dark frame while the poster loads, in both
            light and dark palettes, and the no-poster placeholder still reads as a dark video tile.
evidence  — a frame record with the poster request delayed, before and after, both palettes.
verify    — tier 0 + the visual review path.
