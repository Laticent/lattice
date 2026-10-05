---
origin: 2529
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2529
---

# Lessons speak — pre-recorded Kokoro clips per beat, with word timing

why now   — owner ruling 2026-10-05: lessons get a voice from clips recorded ahead of time, not
            live synthesis and not browser speech (the 2026-06-14 ban stands). Lessons are
            captions only today.
where     — a new clip tool (Kokoro offline) writing one clip + LTT word track per lesson line;
            a `clipNarrator` implementing Vetrina's `Narrator` port and playing through Suono;
            `docs/src/components/studio/use-studio-lesson.ts` passes it to `run()`.
            Design: `engineering/decisions/2026-10-05-studio-lessons.md` §Slices.
done when — every Basics line plays its clip on desktop and phone with no key; captions still
            show; a missing clip falls back to the silent caption; the AudioContext is built
            once per page (Vetrina README §Narration) and disposed on pagehide.
evidence  — clip bytes per lesson (measured, ~6.7 KB/s of speech at the sample's bitrate), a
            real-surface run with sound, and the silent fallback with a clip deleted.
verify    — unit + e2e lessons spec; listen on a real phone.
