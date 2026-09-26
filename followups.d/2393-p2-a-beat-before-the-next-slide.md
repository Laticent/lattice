---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# A self-presenting deck flips to the next slide the instant the last sentence ends

why now   — owner, playing #2393's Guide test deck: "there is no transition from slide. when
            first year with a partner channel we jump to the next slide". Measured in the built
            Studio (2026-09-26): on every handoff from slide 8 to 11 the next slide appeared on the
            SAME frame the previous slide's last caption line ended (77,835 ms and 77,835 ms;
            46,550 ms and 46,550 ms; 105,815 ms and 105,815 ms). The player holds a beat after a
            slide ARRIVES (`pace:`, lib/core/resolve-pace.mjs) but none before it LEAVES, so the
            next slide lands mid-breath. Not caused by #2393, which changes no advance timing.
where     — the Present runner's advance (docs/src/components/studio/PresentOverlay.tsx and the
            Vetrina pacing it drives, docs/src/lib/vetrina/); lib/core/resolve-pace.mjs for the
            beat's length per `pace:`.
done when — after a slide's last sentence the slide holds a short beat, scaled by `pace:`, before
            the next one appears; the exported player does the same.
evidence  — the same caption/slide timing log (every handoff shows a gap), plus a screen
            recording of two handoffs.
verify    — play the Guide test deck in the Studio with the voice on.
