---
origin: 3165
priority: P4
recorded: 2026-11-13
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §3.1 (slice 1b remainder)
deferred: large — adds a dependency whose benchmark tables must be self-hosted (no CDN), plus a long-task observer with its own failing arms; neither is needed until a slice acts on the tier
source: https://github.com/Laticent/lattice/pull/3165
---

# Wire detect-gpu (self-hosted tables) and the boot long-task probe into the device profile

why now   — `DeviceSignals.gpuTier` is always null and `bootProbeSlow` always false; `classify()` and the System
            panel already handle both (tests cover tier 0/1 and the software-renderer rule).
where     — docs/src/lib/device-tier.ts (after first slide), docs/public for the tables, the System panel's GPU rank row.
done when — gpuTier is set from detect-gpu 5.x with tables served from our origin; a long-task observer during boot
            can drop FULL to LITE (never the reverse) with a toast.
evidence  — §3.1 (detect-gpu ranks real GPUs; tables last published 2025-02); §2 (WebKit names every GPU "Apple GPU").
verify    — unit tests with a stubbed table loader (no network, HARD RULE #32); route budget unchanged (lazy only).
