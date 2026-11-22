---
origin: 3427
priority: P1
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-22-two-person-relay.md §As built
deferred: blocked — a hook change, its own PR after #3427 merges (owner's D2, 2026-11-22)
---

# A commit-msg step writes the `Relay-Actor:` trailer from LATTICE_ACTOR

The owner chose D2: A on #3427's ❓ card. Today nothing adds the trailer, so a session must
remember `npm run relay -- trailer`, and the baton and the board show no name for a commit
without it.

where — `lefthook.yml` `commit-msg`, beside `tools/check-commit-msg.sh`; reuse
  `tools/relay-core.js` `resolveActor` (about 30 ms per commit, measured 2026-11-22).
done when — a commit made with `LATTICE_ACTOR=picard` carries `Relay-Actor: John Luke Picard`
  once (never twice, never on a merge GitHub makes); unset adds nothing and warns; an unknown
  value refuses the commit with how to set it. A test with a failing arm (#34).
evidence — `git log -1` on a real commit for each of the three cases.
verify — the adversarial trio (a hook every future commit runs) and the card grader.
