---
origin: 2540
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2540
---

# Listen to the lesson voice on a real iPhone, and run the @webkit-phone lessons tests

why now   — #2540 verified the voice on the real Studio in Chromium (desktop and 390px, audio captured)
            but iOS Safari is out of the sandbox's reach. The gesture unlock is the iOS-specific risk.
where     — docs/src/components/studio/use-studio-lesson.ts (§THE VOICE), lessons/lesson-voice.ts;
            docs/e2e/lessons.spec.ts `@webkit-phone` through the nightly workflow's `spec` input.
done when — on an iPhone, a lesson picked from search speaks its first line; a deep-linked lesson
            (`/studio/?lesson=export-pdf`) speaks after the first tap; the @webkit-phone tests pass.
evidence  — a screen recording with sound from the phone; the nightly run link.
verify    — on-device.
