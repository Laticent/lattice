---
origin: 3022
priority: P2
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md
deferred: off-path — each property needs a three-browser oracle before the sweep reads it; the probe fix that opened this file landed (the note's "The export's missing-picture probe, as built")
source: https://github.com/Laticent/lattice/pull/3033
---

# The Studio export's web sweep does not read every property that fetches a picture

why now   — The probe now skips a web origin the deck has not allowed (2026-11-05). The sweep it shares an allow-list
            with still reads only `WEB_URL_PROPS` and the media attributes: `-webkit-box-reflect`,
            `mask-border-source` / `-webkit-mask-box-image-source`, SVG `fill` / `stroke` / `marker` / `clip-path`
            naming an external `url()`, and SVG `feImage` / `use` `href` are read neither by the sweep nor by the probe.
            The frame's policy refuses each today, and the renderer rewrites the authored spellings first.
where     — docs/src/components/studio/export/deck-export.js `WEB_URL_PROPS`, `sweepWebRefsForCapture`.
done when — each property above is either read by the sweep, with a browser oracle that it fetches, or recorded as one
            the browser does not fetch from a computed style.
evidence  — per property, Chromium, WebKit and Firefox (Playwright) on a frame with no policy: does the clone request it.
verify    — maker-checker; it changes what the export swaps.
