---
origin: 2372
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2372
---

# `lattice video` refuses the spike's tone-voiced export: two slides land 35 ms late

Found while verifying the Guide in the player; the Guide is not the cause.

why now   — the tone voice (`tools/spike-video-export.mjs`, the default `--voice=tone`) is the
            spike's machine-without-a-speech-engine path, and its export cannot be captured:
            `lattice video .scratch/out/video/export-dark.html` stops with "the slides did not
            arrive on the frames the layout gives them (16 of 16 arrivals; lags 20, 18, 3, 20,
            18, 4, 29, 1, 20, 31, 1, 11, 22, 7, 35, 35 ms)". The bound is one frame plus half a
            millisecond (33.8 ms at 30 fps). Measured on main (ed5b41d) and on this branch with the
            Guide: the same 16 lags to the millisecond, so the Guide changes no timing. The
            Kokoro-voiced export of the same deck captures cleanly.
where     — lib/export/video.mjs (the arrival check and the frame clock's nested-timer clamp);
            the player's transport chain in lib/export/player-core.mjs (nextCue → endSlide →
            hold). The last two slides are the late ones, which points at clamp drift that
            accumulates along one long timer chain.
done when — the tone export captures, or the check's bound is shown to be wrong and corrected
            with the reason; a Kokoro export still passes; a slide that truly lands a frame late
            still fails the check.
evidence  — the capture of the tone export, and the lag list before and after.
verify    — tier 1 checker, because the arrival check is what stands between a wrong video and
            the owner.
