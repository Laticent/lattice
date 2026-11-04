---
origin: 3004
priority: P2
recorded: 2026-11-03
area: website
severity: medium
swimlane: engineering/decisions/2026-08-10-preview-pinch-zoom.md
deferred: blocked — cause unknown, and not yet shown on main: main's iPhone photo runs died earlier, at the editor wait #3004 fixes, so they never reached this one
source: https://github.com/Laticent/lattice/pull/3004
---

# On the iOS Simulator, the Studio's live preview frame sometimes never mounts

why now   — `ios-safari-photo` timed out on the first preview render at `deca0cb` and `3c72050` (both iPhone), with the
            diagnostics below; an iPad run at `1b3b32b` timed out on the same wait before those diagnostics existed. In each, the Studio had
            hydrated (render metrics present; at `3c72050` every pane button visible and none inert) and the
            screenshot shows the first slide drawn, but `[aria-label="Live deck preview"] iframe.live` never
            appeared within 90 s: "preview box present; iframes none", or the frame's document unreadable.
            In Playwright WebKit at 402 px the same frame mounts about 1.5 s after the first render. So what
            the phone shows is the pre-paint seed or snapshot, and the live frame that should take over from
            it does not, on that run. A user would see a slide that never updates as they type.
where     — docs/src/components/studio/StudioShell.tsx (`FocusedPreview`, `editorSlotVisible`);
            docs/src/components/studio/preview-pool.tsx; docs/src/playground/snapshot-cache.js;
            docs/scripts/ios-safari/photo-probe.js (the wait and its `previewState()` message).
done when — the cause is named (the frame is never created, is created and discarded, or waits on something
            that never settles on iOS), and the first render reaches the live frame in every one of 5
            dispatched runs of ios-safari-photo on both devices.
evidence  — the dispatched runs, and the failing runs' previewState() messages before and after.
verify    — platform-suites.yml dispatch, suites=ios-safari-photo,ios-safari-studio
