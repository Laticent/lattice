---
origin: 2547
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Decide whether to put a free third-party TURN in the slot

why now   — without TURN, networks that block direct browser-to-browser traffic cannot connect at all; the inversion review ranked it the change that most improves the success rate.
where     — docs/src/lib/tavola/adapters/trystero.ts (rtcConfig), note §7 and §12.
done when — the owner chose: no TURN, or a named free provider configured in the adapter with its trade-off (a third party relays media while in use) written into §7.
evidence  — the decision line in §10.
verify    — tier 0; it is a decision.
