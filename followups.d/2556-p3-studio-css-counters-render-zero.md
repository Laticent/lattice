---
origin: 2556
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2556
---

# Studio exports draw every CSS counter as 0

why now   — found while verifying #2556 on the real Studio: the welcome deck's timeline numbers
            (`counter(ls-timeline-counter)`) come out as `0` in the PICTURE .odp/.pptx/.pdf too.
            Pre-existing, not caused by #2556 (HARD RULE #18 off-path): html-to-image copies a
            pseudo-element's `content` as a literal string, so `counter()` never evaluates.
where     — docs/src/components/studio/export/deck-export.js withCaptureFixups; a fix bakes each
            counter-bearing pseudo-element's resolved text before the capture.
done when — the welcome deck's timeline exports 1, 2, 3 from the Studio in every image format.
evidence  — the Studio export of the welcome deck, slide 6, against the CLI export.
verify    — export-bytes change: owner sign-off on dark + light renders.
