---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# On an iPhone, the Guide's underline runs past its text, and the resting cursor covers words

why now   — owner, on an iPhone 15 Pro in the Studio (2026-09-26): "sometimes i see the gesture
            underline extends beyond the actual text". Not reproduced in Chromium: an iPhone 15 Pro
            emulation (393×852 @3x, touch, iOS user agent) measured every underline ending within
            0.0 px of its text at rest, so the overshoot is most likely WebKit measuring the text
            range differently. The same emulation showed a second, pre-existing defect: on
            expressive's top moment the resting cursor sat on the card body text ("Net retention")
            at phone scale.
where     — docs/src/components/studio/present-guide.ts (`guideCueIn` / `rectsOf` — the ink's
            text-range geometry — and the rest-placement solver's keep-out at a small slide scale);
            .scratch-style probe that measures ink box against text box in page pixels.
done when — on real WebKit (the `webkit-phone` Playwright project, or a device), every underline
            ends within 1 px of its text on the test deck, and the resting cursor never overlaps a
            text box at 393 px wide.
evidence  — the ink-vs-text measurement from WebKit at devices['iPhone 15 Pro'], plus screenshots.
verify    — maker-checker; iOS Safari itself stays UNVERIFIED unless a device drives it.
