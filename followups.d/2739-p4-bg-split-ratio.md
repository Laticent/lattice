---
origin: 2739
priority: P4
recorded: 2026-10-16
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.7
source: https://github.com/Laticent/lattice/pull/2739
---

# Read Marp's split ratio in `![bg left:40%]` on an image slide

why now   — the lift reads only `left` / `right` (lib/core/bg-directive.js `BG_RE` takes word characters), so `![bg left:40%]` falls back to a full-bleed background and the image layout loses its panel. #2739 makes `lint:deck` say so (`bg-ratio-unread`), but a Marp deck brought in as is still renders wrong.
where     — `BG_RE` and `bgSide`; how the image layout would honor a declared share.
done when — `![bg left:40%]` on an image slide renders the image layout's panel on the left (at the declared share, or the layout's own if a share is not supported), in the CLI and the Studio, and the lint rule retires or narrows.
evidence  — the rendered slide before/after; a demo deck.
verify    — tier 0 gates, plus a visual review.
