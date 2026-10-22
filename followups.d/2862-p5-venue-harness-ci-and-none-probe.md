---
origin: 2862
priority: P5
recorded: 2026-10-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# Decide: run check:venue-conformance in CI as a ratchet, and require a venueProbe on every venueCapacity none

why now   — the harness is on demand; with 53 named rows a ratcheted CI step is cheap, but it changes the CI contract (owner decision, CLAUDE.md second filter). Today a none component's sentence is convention, not verified.
where     — .github/workflows/, tools/check-venue-conformance.js, lib/components/manifest.schema.json.
done when — the owner picks on-demand, nightly report or a ratcheted step; if a step, a committed baseline that may only fall; and the schema rule on none is decided.
evidence  — the harness runtime (about 3 minutes for the catalog) and the baseline file.
verify    — owner decision first.
