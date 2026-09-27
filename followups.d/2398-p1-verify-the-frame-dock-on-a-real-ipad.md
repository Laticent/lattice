---
origin: 2398
priority: P1
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2398
---
# Drive the Studio frame dock on a real iPhone or iPad (Safari 26+)

why now   — The dock (`docs/src/components/studio/frame-dock.tsx`) is the Safari/iPad memory fix,
            and its one core claim nobody could test from the Linux sandbox is on the device itself:
            do anchored frames keep up with momentum scrolling, pinch-zoom and the on-screen
            keyboard? Everything in #2398 ran on Playwright WebKit 26 on Linux.
where     — the deployed Studio (or a PR preview). Open Add slide, fling-scroll the gallery, close,
            reopen, repeat; open Settings → deck presets; open Present → overview (`g`). Tap the
            Add slide search field so the keyboard comes up. Pinch-zoom once with a gallery open.
            Governing note: `engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md` §5.
done when — On the device, every preview stays on its tile during and after a momentum fling, no
            frame paints outside the gallery's scroll area with the keyboard up or zoomed in, and
            Safari's Web Inspector (Timelines → Memory) shows no step up on the second and later
            reopens of Add slide. Any lag or escape is filed with a screen recording.
evidence  — a screen recording of the fling, and the Web Inspector memory timeline across three
            reopens, attached to the PR that deletes this file.
verify    — tier 0 plus a human on the device, because the surface cannot be driven from here (#23).
