---
origin: 3239
priority: P3
recorded: 2026-11-16
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: large — the photo check, the ink fix and SlideContext key on the `---` unit and sample the preview by that unit's slide; checking a later heading part means re-keying all three on the deck index's parts and sampling that part's preview slide
source: https://github.com/Laticent/lattice/pull/3239
---

# On a `split: headings` slide, the Studio's photo checks read only the first part's photo

why now   — #3239 made the Studio's readers place one picture per heading part (`photosAt`, card-ink-pick.ts), so Compose
            and the engine agree. The callers keyed on the unit still read one photo per unit, `photoAt`, which is the first
            part's: a photo in a later part is placed and drawn but never contrast-checked, and the ink fix cannot pick for it.
where     — `usePhotoContrast` (coach/photo-contrast-watch.ts), photo-verdict.ts, photo-ink-read.ts, thin-card-fix.ts,
            SlideContext.tsx `readBehindCard`; the deck index's parts (docs/src/lib/deck-outline/deck-outline.ts `partBase`).
done when — on a deck whose second heading part places a dark photo under dark words, the Coach names that slide, and the
            ink fix writes the ink into that part's own class comment.
evidence  — a docs e2e case on a split deck, red on today's readers, green after.
verify    — self-review with the gates; the photo-contrast-coach spec on Chromium and webkit-phone.
