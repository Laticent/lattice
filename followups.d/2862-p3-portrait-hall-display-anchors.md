---
origin: 2862
priority: P3
recorded: 2026-10-22
area: anchor
severity: low
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# Decide what a venue means on a portrait canvas: display components clip at hall on tall

why now   — title, quote, content, topic fact, closing, scene, video and others clip at tall/hall because type scales twice (canvas, then venue). The harness records them as known. Either portrait ignores the venue lift, or the venue contract is documented as landscape-only.
where     — engineering/typography.md §7; lib/base/base.modifiers.css venue block.
done when — the owner picks one, the doc says it, and the KNOWN rules for portrait-at-hall in tools/check-venue-conformance.js are deleted or made a stated exemption.
evidence  — a rendered title slide at tall hall before and after.
verify    — owner decision first (it changes what venue means).
