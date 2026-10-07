---
origin: 2547
priority: P3
recorded: 2026-10-06
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-live-collaboration-roadmap.md
source: https://github.com/Laticent/lattice/pull/2547
---

# See how often Live connections fail in the field

why now   — we cannot tell how many people hit "Nobody answered" (no TURN, blocked networks), so the TURN decision rests on guesses.
where     — docs/src/components/studio/live/; the Studio's existing feedback path, if there is no telemetry pipeline.
done when — an opt-in, anonymous count of join outcomes (connected, path type host/srflx/relay, failed) reaches somewhere the owner can read.
evidence  — a dashboard or a log query with real numbers.
verify    — self-review; a privacy check with the owner.
