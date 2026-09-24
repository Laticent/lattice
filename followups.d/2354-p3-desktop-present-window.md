---
origin: 2354
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: Present's audience view as a native second window

why now   — stage-window.js opens the audience view with window.open + document.write and
            places it with getScreenDetails, which only Chromium has. In WebKitGTK the
            popup path is unverified and screen placement is unavailable.
where     — docs/src/components/studio/present/stage-window.js (~27, ~462, ~869); a window
            seam in docs/src/lib/platform.js; Tauri's WebviewWindowBuilder + monitor API.
done when — Present on desktop opens the audience view in its own native window on the
            second monitor when there is one, and the presenter console drives it.
evidence  — screenshots of both windows from the desktop app.
verify    — maker-checker.
