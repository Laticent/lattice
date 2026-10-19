---
origin: 2790
priority: P1
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-19-studio-main-thread-jank.md
---

# Start read-aloud sooner: measure the wait before the first sentence and shorten it

why now   — The owner reported a delay before audio starts when playing a deck in Present. #2790 measured the
            highlight at 1 to 5 ms after the audio onset (stubbed voice, real WebAudio) and removed the rail's
            per-frame layout cost, so the highlight is not the late part. The wait is the time to synthesize
            the first sentence before anything plays. It was left unchanged and has no number yet.
where     — `useReadAloud` in docs/src/components/studio/read-aloud.ts (used by PresentOverlay.tsx) and the
            harness in docs/e2e/read-aloud.spec.ts with docs/e2e/read-aloud-harness/.
done when — the time from pressing play to the first audible sample is measured on the real voice path and
            recorded; one change (prefetch the first sentence on entering Present, or a smaller first chunk)
            cuts it, with before and after numbers in the PR.
evidence  — the harness already times highlight against audio onset; extend it to time play to onset with a
            stub voice that takes a fixed synthesis time, then a real run on the owner's machine.
verify    — the extended harness case, plus one real-voice measurement on a 4K display.
