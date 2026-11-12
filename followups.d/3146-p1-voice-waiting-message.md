---
origin: 3146
priority: P1
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-11-voice-synthesis-spine.md §9.3
deferred: off-path — new UI this PR does not touch (Present's voice pill and the breaker); the owner chose to build it in its own PR (D2 on #3146)
source: https://github.com/Laticent/lattice/pull/3146
---

# Say "waiting for the voice service" when a voice pauses

why now   — the scheduler's breaker pauses a provider after repeated failures, and Present shows nothing, so a
            pause reads as a stall (spine note §3.3 proposed the message; §9.3 left it out).
where     — docs/src/playground/voice-scheduler.js (breaker state), Present's voice pill
done when — a mocked run of 429s shows the waiting message during the pause, and it clears when audio resumes.
evidence  — screenshots at 1440, 820 and 390 px, light and dark.
verify    — tier 1 checker: every cloud voice reads through the scheduler.
