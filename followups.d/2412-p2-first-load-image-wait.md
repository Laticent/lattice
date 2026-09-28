---
origin: 2412
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2412
---

# The Studio's first load still holds the whole slide blank for up to 4 s waiting on photo sizes

why now   — #2412 made an image slide's text wait for its photo's size (`data-img-pending`: the
            panel shimmers, the text is hidden, and it fades in once in its final place). That
            rule already stops the first-load jump, so the older first-reveal gate (#2412 P2), which
            holds the WHOLE frame hidden until every probe settles, capped at
            `PREVIEW_IMAGE_GATE_MS` (4 s), now only costs time: on a slow photo the reader stares
            at a blank slide instead of seeing the placeholder and the heading's surroundings.
            The owner chose to do this as a follow-up to #2412.
where     — lib/core/preview-font-gate.mjs (`fontGateAgent`'s `images()` wait and its cap) and its
            one opted-in caller, docs/src/lib/single-slide-render.ts; lib/transformers/
            image-adaptive.js publishes the probes (`__latticeImageProbes`) only for that wait, so
            the publishing goes too. Deletes code rather than adding it.
done when — the Studio's first load reveals as soon as the fonts are in, an image slide whose photo
            is still loading shows its placeholder with its text held back, and nothing moves once
            visible. Photo held 2 s: time to first paint drops from ~2 s to the font settle.
evidence  — a per-frame record of the Studio's live frame on first load, photo held 2 s, before
            and after (frame opacity, text opacity, heading position), WebKit at the iPhone
            profile, plus the owner's iPhone.
verify    — tier 1 (it removes a gate the owner watched regress once).
