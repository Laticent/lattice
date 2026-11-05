---
origin: 3037
recorded: 2026-11-05
area: website
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
priority: P1
severity: medium
deferred: large — the owner chose to merge the design note first and build later (§9 of the note).
---

# Fuoco event channel, build 1 (slice 1): the channel, its integrity rules, and the `doc.*` events

where     — docs/src/lib/fuoco/events.ts (new, composed by createFocusHub as `hub.events` on a separate `FocusHubWithEvents` type), hub.ts, hub.test.ts; docs/src/lib/lattice-events.ts and its ledger test.
what      — §4.1 and §10 of the note. Occurrences and FACTS (last value kept, `replay`), the `until(check, type)` wait helper, an envelope with its own sequence and the emitter's `rev` (never the hub's `lastBy` or current rev), per-listener try/catch, a drain cap, `*` on the idle lane only, no default lane, events delivered after the render like focus, a bounded frame lane with a timer fallback and `events.missed`. The ledger test (§10.2) and the payload rule (§10.5). Events: `doc.changed` (span computed on every change, new work), `doc.loaded`, `doc.saved`, `doc.save-failed`, `history.undo`, `history.redo`. Subsumes followups.d/2884-p1.
done when — failing arms go red against a broken hub for: exactly once and in order, never to own origin, no re-entry, a throwing listener starves no one, the drain cap trips, a late subscriber and an await after the emit both resolve, an event never drops a caret report; the ledger test runs; the Compose change flash reads `doc.changed` instead of diffing.
