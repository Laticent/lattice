---
origin: 2372
priority: P4
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2372
---

# Video export from the desktop app (fork 10, desktop half)

The owner ruled on 2026-09-27 (video note §6, fork 10): the desktop (Tauri) app runs the same
capture code next. A web page cannot capture its own DOM without a screen-capture prompt, so the
browser Studio does not get a video button.

where     — the Tauri wrapper (its own Laticent repo) calling lib/export/video.mjs.
done when — a video button in the desktop app writes the same MP4 the CLI does for the same export.
evidence  — an MP4 made from the desktop app, and the owner's playback check.
