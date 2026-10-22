---
origin: 2862
priority: P5
recorded: 2026-10-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# Decide: require a venueProbe on every venueCapacity none (the CI ratchet shipped)

why now   — the ratchet now runs in CI (`ci.yml`, integration shard 4); what is left is the schema rule. Today a none component's sentence is convention, not verified.
where     — lib/components/manifest.schema.json, tools/check-venue-conformance.js.
done when — the owner decides whether the schema requires a venueProbe on every none component.
evidence  — the list of none components that have no venueProbe today.
verify    — owner decision first.
