---
origin: 3037
priority: P1
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
---

# Fuoco event channel, slice 1: `emit` / `on` and the `doc.*` events

deferred: large — the owner chose to merge the design note first and build later (§9 of the note).
where     — docs/src/lib/fuoco/hub.ts, hub.test.ts; the Lattice event map in the adapter.
what      — §4.1 and §6 slice 1: a typed channel stamped with seq/rev/origin, delivered through the hub's queue, batching (never dropping) on the frame lane; `doc.changed/loaded/saved/save-failed`, `history.undo/redo`. Subsumes followups.d/2884-p1.
done when — a failing-arm test (exactly once, in order, never to own origin, never re-entrant; a broken hub goes red) passes, and the Compose change flash reads `doc.changed` instead of diffing.
