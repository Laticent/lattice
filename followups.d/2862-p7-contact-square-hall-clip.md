---
origin: 2862
priority: P7
recorded: 2026-10-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# `contact` venueProbe is marked clipped at hall on a square canvas

why now   — the venue ratchet (`check:venue-conformance --strict`) held the square canvas for the first time and found it; no text or image leaves the frame, only the engine's clip mark fires. It is named in `KNOWN` so the ratchet stays green.
where     — lib/components/connect/contact/contact.styles.css (the square structure: name, lockup, then ledger beside the QR); tools/check-venue-conformance.js `KNOWN`.
done when — `npm run check:venue-conformance -- --only=contact --strict` exits 0 with the `contact` `KNOWN` row deleted.
evidence  — the harness row `contact (venueProbe) square hall V1`, before and after.
verify    — `npm run check:venue-conformance -- --only=contact --strict`, then look at the square hall render.
