---
origin: 2372
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2372
---

# Measure an AAC path, then build the video exporter (LTT step 3)

why now   — video export is the owner's goal, and the owner answered the note's fork 0 on
            2026-09-25: the audience plays video in slide software too, so the audio must be AAC,
            which the measured Chromium's WebCodecs cannot encode.
where     — engineering/decisions/2026-09-25-video-export.md §5 (what the build adds), §6 forks
            1–7; tools/spike-video-export.mjs (the measured pipeline to promote into
            lib/export/video.mjs); lib/export/player-core.mjs (the LTT and audio blocks it reads).
done when — the build follows the note's §0 rule (owner, 2026-09-25): video is an export path
            over the Studio's spine, never a second renderer. First, fork 1d is measured against
            1b (an audio-only AAC encoder: an LGPL ffmpeg build or a WebAssembly encoder; size,
            speed, license) and the owner picks. Then the exported player gains its one
            render-mode hook (a voiced cue lasts its measured length), and `--video` builds the
            narrated HTML export as the Studio would, plays it under virtual time, captures each
            frame, muxes the clips at the player's own times, writes the caption track and the
            .vtt sidecar, probes the encoders first, and passes the spike's checks in a
            test:integration case. The Guide in the player (fork 8) and the Studio path
            (fork 10) are their own slices.
evidence  — the MP4 and .vtt of test/fixtures/q3-board-review.md via SendUserFile, the spike's
            report JSON, and one file opened in QuickTime or PowerPoint on a real machine (or marked
            UNVERIFIED).
verify    — tier 2 trio, because it adds an external dependency and a new export surface.
