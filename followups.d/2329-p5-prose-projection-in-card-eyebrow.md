---
origin: 2329
priority: P5
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# Prose projection misses an eyebrow that lives in a card head

why now   — `eyebrowOf` in prose-projection.mjs reads only `.masthead-lede`. Since #2329,
            `video` keeps its eyebrow in `.video-head` / `.video-lead`, as `wifi` already
            did with `.qr-head`, so neither eyebrow reaches the prose projection.
            Confirmed by reading the code, not by running the projection.
where     — `eyebrowOf` in prose-projection.mjs (grep -rn "function eyebrowOf" lib docs/src).
done when — the prose projection of a wifi slide and a video slide carries the eyebrow.
evidence  — a unit arm per component.
verify    — tier 0.
