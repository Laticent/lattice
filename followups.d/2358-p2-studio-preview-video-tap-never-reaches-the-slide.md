---
origin: 2358
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2358
---

# Tapping a video poster in the Studio preview does nothing

why now   — reported from an iPhone while testing #2358, and reproduced in Chromium against a
            production build. The Studio preview wraps the slide iframe in `pointer-events-none`
            (the parent owns swipe and pinch), so a tap on `.video-poster` never reaches the
            frame's link guard and `window.__videoPlay` never runs. The bridge itself works:
            calling it directly mounts the youtube-nocookie player. `video-overlay.js`'s header
            still says "clicks DO reach the iframe on iOS", which stopped being true.
where     — the preview wrapper in the Studio stage (the `pointer-events-none` DIV above
            `figure.is-live`), docs/src/playground/video-overlay.js, and the input kernel in
            lib/core/present-transport.mjs. Follow the parent-hosted pattern chart-interact
            already uses: hit-test the tap in the parent, map it into the frame, call the bridge.
done when — a tap on a video poster in the Studio preview plays the clip on desktop and iOS,
            and a swipe on the same slide still turns it.
evidence  — a real-device (iOS) tap that plays, and a Chromium arm that taps at the poster's
            SCREEN position (the frame is scaled) and finds `.pg-video-modal`.
verify    — tier 1 checker: it touches the preview's input layer.
