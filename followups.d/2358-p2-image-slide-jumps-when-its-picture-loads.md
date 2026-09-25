---
origin: 2358
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2358
---

# An image slide jumps when its picture finishes loading

why now   — reported from an iPhone while testing #2358, and reproduced in a production build of
            the Studio with the picture's request held 2.5 s: the preview fades in at 2.3 s on a
            provisional composition (the `.lattice-bg` panel 605x504 at y=131, the section flagged
            `overflow clip-marked`, the h2 at y=245) and re-resolves at 3.7 s, when the image
            arrives, to 552x345 at y=187 with the h2 at y=259. The composition is chosen from the
            photo's aspect ratio (`image` resolves `clean`/`split`/`spotlight` from it), and until
            the photo loads that ratio is a guess. The engine HTML for this slide is identical on
            main, so this predates #2358. On a fast local load the image lands before the reveal
            and nothing visible moves, which is why it shows on a phone.
where     — the `image` composition resolver and whatever reads the photo's dimensions
            (lib/core/bg-image.js, lib/core/image-dimensions.js), and the preview's reveal gate.
            Two shapes: (a) hold the reveal until every `.lattice-bg` image has decoded, or
            (b) resolve the composition from dimensions known at render time and never re-resolve.
done when — the image slide paints once in its final composition: no layout change after the
            first visible frame, with the image delayed 2.5 s.
evidence  — `npm run check:jank` style frame record (engineering/jank.md) with a delayed image,
            before and after; an iPhone check.
verify    — tier 1 checker: the preview reveal gate is shared by every slide.
