---
origin: 3427
priority: P2
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-22-two-person-relay.md §As built
deferred: blocked — a hook change, its own PR after #3427 merges (owner's D3, 2026-11-22)
---

# SessionStart warns when LATTICE_ACTOR is unset or not in the roster

The owner chose D3: A on #3427's ❓ card. Kirk returns on Nov 27 with the variable unset; today
the first sign is a warning from `npm run card`, after the session may already have posted.

where — the SessionStart hook (`.claude/settings.json` hooks); reuse `tools/relay-core.js`
  `resolveActor` so the message matches `npm run card`'s.
done when — a session that starts with the variable unset or unknown sees one line naming the
  valid values and how to set it; a valid value prints nothing. A test with a failing arm (#34).
evidence — a session's startup output in each case.
verify — the adversarial trio (a hook every session runs) and the card grader.
