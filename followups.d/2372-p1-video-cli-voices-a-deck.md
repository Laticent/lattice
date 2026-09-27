---
origin: 2372
priority: P1
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2372
---

# `lattice video deck.md`: the CLI voices a deck itself (fork 10, CLI half)

The owner ruled on 2026-09-27 (video note §6, fork 10): the CLI voices a deck itself through an
optional kokoro-js install, so a video no longer needs the Studio first. The caption half of the
old P1 file is done and signed off (note §10: `tx3g`, off until picked, checked on the owner's
iPhone in dark and light).

why now   — today the only route is Studio → narrated HTML export → `lattice video`.
where     — lib/export/video-cli.mjs (a `.md` input narrates first); the spike's Kokoro path in
            tools/spike-video-export.mjs (voice, MP3 bake, lead trim) is the reference to lift into
            lib/, sharing the Studio's bake rather than forking it (HARD RULE #1);
            engineering/pipeline.md §6.
done when — `lattice video deck.md` writes the MP4 and .vtt with Kokoro narration when kokoro-js is
            installed, and says how to install it when it is not; the voice's clips match the
            Studio's bake for the same text; and PowerPoint playback of the MP4 (with its tx3g
            track) is checked and recorded in the note, or marked UNVERIFIED with the reason.
evidence  — the fixture deck rendered from Markdown, dark and light, for the owner's sign-off
            (export bytes).
verify    — tier 1 checker.
