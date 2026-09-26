---
origin: 2372
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2372
---

# Video export: prove it plays in slide software, and let the CLI voice a deck itself

Progress 2026-09-26: built. `lattice video <narrated-export.html>` writes the MP4 (H.264, AAC,
a WebVTT track) and the `.vtt` by capturing the export's own player in render mode
(engineering/decisions/2026-09-25-video-export.md §9). Fork 1d was measured and built on
(`@mediabunny/aac-encoder`, FFmpeg's AAC encoder in WebAssembly). The owner ruled on 2026-09-26:
keep 1d and carry FFmpeg's LGPL notice (done), ship H.264, and keep 1 s lead-in and outro. What
is left is below; the Guide in the player (fork 8), a phone aspect (fork 9) and Studio video
(fork 10) stay the owner's calls in the note's §6.

why now   — the owner's audience plays video in PowerPoint, Keynote and QuickTime (fork 0), and
            only Chromium has decoded one of these files. The muxed caption track reads back as no
            track at all through mediabunny, and QuickTime expects `tx3g`. And the CLI can only
            capture a narrated export the Studio made: it has no voice of its own, so "the Studio
            or the CLI" is today "the Studio, then the CLI".
where     — lib/export/video.mjs (the muxer's subtitle track); lib/export/video-cli.mjs (a deck
            input would narrate it first, which needs a Node voice such as kokoro-js, the one the
            spike runs, or captions only); engineering/pipeline.md §6.
done when — one MP4 from test/fixtures/q3-board-review.md opened in QuickTime and in PowerPoint on
            a real machine, with sound, picture and captions checked and recorded in the note (or
            each marked UNVERIFIED with the reason); the caption track is either read back by a
            real player or replaced by one that is (`tx3g`); and the owner has ruled on the CLI
            taking a deck, with that ruling built or recorded as declined.
evidence  — screenshots or a screen recording from the real players; the ruling.
verify    — tier 1 checker, because it changes the MP4 every export writes.
