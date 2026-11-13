---
origin: 3165
priority: P2
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §4 (slice 4)
deferred: large — touches five subsystems (worker pools, preview-iframe pool, idle prefetch, local AI model offers, PDF export pacing), each needing its own measured before/after
source: https://github.com/Laticent/lattice/pull/3165
---

# LITE resources: smaller pools, fewer preview slots, no idle prefetch, local models hidden

why now   — the tier exists but every pool and prefetch is still sized for a strong machine.
where     — picture-encoder-pool.js, narration-pack-pool.js, deck-export.js (PDF in-flight), preview-pool.tsx,
            studio-warm.ts (prefetch), voice-model.js and architect-model.js (model offers).
done when — each reads the tier (lib/device-tier.ts state) and uses §4's LITE values; export BYTES are identical in
            both tiers (§4: no tier ever changes an exported file).
evidence  — §1's audit table lists each site and its current fixed size.
verify    — unit tests per pool with the tier injected; an export byte-equality test across tiers; `npm run bench`
            numbers in the PR (HARD RULE #19) for any path the change makes faster.
