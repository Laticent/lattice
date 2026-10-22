---
origin: 2830
priority: P2
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-follow-over-tavola.md
source: https://github.com/Laticent/lattice/pull/2830
---

# Follow: survive the leader reconnecting

Following someone ends when they leave, because a reconnecting leader comes back under a new id and nothing in the roster
says the same person returned (name and color are not identity: the red team followed an impostor). Fix: the host knows
the rejoin token's id for each seat; hand the guests a stable seat id in the roster, bind the follow to it, and keep the
follow for a short grace. A session protocol change in `docs/src/lib/tavola/session.ts`. Context:
`engineering/decisions/2026-10-21-follow-over-tavola.md` §14.

       done when — a leader who reconnects under a new transport id keeps being followed (a test), and a member who takes
       the leader's name and color is not.
