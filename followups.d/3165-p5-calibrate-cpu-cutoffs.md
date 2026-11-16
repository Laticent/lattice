---
origin: 3165
priority: P5
recorded: 2026-11-13
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §3.1
deferred: blocked — needs probe scores from real slow devices; the sandbox (≈250) and the owner's iPhone (392) are both fast
source: https://github.com/Laticent/lattice/pull/3165
---

# Calibrate the CPU probe's LITE (60) and floor (20) cut-offs on real slow devices

why now   — the cut-offs are provisional; they must be set from measured low-end scores before slice 5 lets the CPU
            probe help decline anyone.
where     — LITE_CPU_SCORE / FLOOR_CPU_SCORE in docs/src/lib/device-profile.ts.
done when — scores from at least one old phone and one low-end laptop are in §3.1, and the constants are set from them.
evidence  — measured so far: sandbox Chromium ≈178–250 units, 4x CDP throttle 24, owner's iPhone (Safari 26.4) 392.
verify    — the System panel's "Run speed test" on each device (`?system`), recorded in the design note.
