# Follow: survive the leader reconnecting

Following someone ends when they leave, because a reconnecting leader comes back under a new id and nothing in the roster
says the same person returned (name and color are not identity: the red team followed an impostor). Fix: the host knows
the rejoin token's id for each seat; hand the guests a stable seat id in the roster, bind the follow to it, and keep the
follow for a short grace. A session protocol change in `docs/src/lib/tavola/session.ts`. Context:
`engineering/decisions/2026-10-21-follow-over-tavola.md` §14.
