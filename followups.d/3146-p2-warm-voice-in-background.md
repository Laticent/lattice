---
origin: 3146
priority: P2
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-11-voice-synthesis-spine.md §3.5
deferred: off-path — new UI this PR does not touch (the export panel); the owner chose to build it in its own PR (D2 on #3146)
source: https://github.com/Laticent/lattice/pull/3146
---

# "Warm in the background now" for a voice change before export

why now   — a voice change between rehearsal and export misses the clip cache for the whole deck, and the export
            pays for every sentence then (spine note §3.5; §9.3 left the remedy out).
where     — the export panel's voice-change notice; narration-bake.ts on the scheduler's bulk lane
done when — after "warm now" finishes, an export synthesizes nothing new.
evidence  — the request count for the export, with and without warming first, on a mocked provider.
verify    — tier 1 checker: it spends the author's cloud credit.
