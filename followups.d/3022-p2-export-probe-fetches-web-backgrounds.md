---
origin: 3022
priority: P2
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md
deferred: off-path — pre-existing in the Studio export, found by the red team reviewing the spine continuation; that change does not alter which addresses are probed
source: https://github.com/Laticent/lattice/pull/3033
---

# The Studio export's missing-picture probe fetches web backgrounds the deck has not allowed

why now   — `recordUnreachableAssets` calls `backgroundImageUrls` and then `probeImage`, which sets `new Image().src` to every
            computed background address, with no allow-list check. It runs in `rasterizeDeckImages` before
            `sweepWebRefsForCapture`, so a web background outside the deck's allow-list is requested from the author's machine at
            export. The capture frame may already have fetched it while laying the slide out (not checked).
where     — docs/src/components/studio/export/deck-export.js `recordUnreachableAssets` / `probeImage`.
done when — the probe skips any address whose `remoteRef.webOrigin` is set and not in the frame's `CAPTURE_WEB_ORIGINS`,
            with a test that fails on today's code.
also      — properties and elements the sweep reads neither before nor after: `-webkit-box-reflect`,
            `mask-border-source` / `-webkit-mask-box-image-source`, SVG `fill` / `stroke` / `marker` / `clip-path` naming an
            external `url()`, and SVG `feImage` / `use` `href`. Each needs a browser oracle before it is added.
evidence  — the red team's reasoning in the continuation PR; reproduce with a deck whose background is a web address
            outside the allow-list and a request log on the export.
verify    — maker-checker; it changes what the export fetches.
