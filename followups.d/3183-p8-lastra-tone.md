---
origin: 3183
priority: P8
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-image-library.md §5
deferred: blocked — nothing uses tone until the covered-photo lift (followups.d/3183-p2-lift-covered-photos-out-of-slide-pictures.md) is built, and building it first would ship code with no caller
source: https://github.com/Laticent/lattice/pull/3183
---

# lastra slice 6: grayscale and duotone on pixels, held to the browser's blend layers

why now   — The image plugin's duotone and grayscale are CSS blend layers (lib/base/base.media.css), so an export cannot lift a
            toned photo out of the slide picture; the PDF writer refuses those photos as 'filter' (11 on the owner's Bilan deck).
where     — docs/src/lib/lastra (tone.ts), the W3C Compositing and Blending separable and non-separable modes the CSS uses.
done when — tone produces pixels within a stated per-channel ceiling of each engine's own blend-layer rendering, in
            Chromium, Firefox and WebKit, light and dark, and the covered-photo lift uses it.
evidence  — a pixel-difference table per engine on a fixed photo set; the lift's per-slide image census.
verify    — tier 1 checker; the owner's export sign-off with the lift.
