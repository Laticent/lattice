---
origin: 3183
priority: P11
recorded: 2026-11-15
area: website
severity: medium
swimlane: lib/core/slide-camera.mjs
deferred: off-path — the WebKit bug predates PR 3183 (main's camera captures pixel-identically), and the owner ruled on 2026-11-15 that it is fixed in a separate PR after 3183 merges
source: https://github.com/Laticent/lattice/pull/3183
---

# In Safari, a Studio export cuts off the left part of every card's shadow

why now   — The owner exported the turned-photo test deck from the Studio in WebKit and saw the image card's offset
            shadow start two thirds of the way along its bottom edge; Firefox draws it whole. The slide camera draws the
            slide's foreignObject SVG into a canvas at 2x with ctx.scale(2, 2), and WebKit then drops the left part of any
            box-shadow inside it. A plain WebKit page draws the shadow whole, and so does the same SVG at 1x.
where     — lib/core/slide-camera.mjs captureSlideCanvas: the `<svg width=w height=h>` it builds, and the `g.scale` before
            `g.drawImage(img, 0, 0, w, h)`. It touches every Studio PDF, PowerPoint and ODP photo from Safari or an iPhone.
done when — the camera renders the snapshot at the target size (a minimal test: CSS `zoom: 2` on the inner wrapper,
            the SVG at 2w x 2h, drawn 1:1, puts the shadow back in WebKit and leaves Chromium unchanged; `transform` and a
            viewBox do not), with a WebKit capture of an image-card slide whose shadow matches Chromium's, and the owner's
            dark and light sign-off, since every exported slide photo changes.
evidence  — minimal repro: a box with box-shadow in a foreignObject, drawn at scale 2: WebKit's shadow row starts at
            x 982, Chromium's at 700; zoom brings WebKit to 701. main's camera and PR 3183's give identical WebKit
            captures (difference bbox None).
verify    — tier 2 maker-checker; a gallery sweep in Chromium, Gecko and WebKit.
