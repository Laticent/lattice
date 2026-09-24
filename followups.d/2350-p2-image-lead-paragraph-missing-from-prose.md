---
origin: 2350
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2350
---

# An image slide's lead paragraph is missing from the prose article

why now   — the same shape #2350 fixed for video: `image` is in MEDIA_COMPONENTS, so
            `projectMedia` re-hosts the picture and the paragraph under the heading never
            reaches Read · Article (measured: `## Pic` + "A lead paragraph here." + an
            image projects the heading and figure only). Pre-existing.
where     — the MEDIA branch of `projectDeckToProse` in
            lib/transformers/prose-projection.mjs; `projectVideo` is the pattern.
done when — an `image` slide's prose projects once, after the heading, before the
            figure; decide whether the same holds for the other MEDIA components.
evidence  — an engine-rendered arm failing on the old code.
verify    — tier 0.
