---
origin: 2547
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Hand the host role to the next person when the host leaves

why now   — today, if the host's tab sleeps or closes, nobody new can join and chat waits as "Sending…" until the host returns. For a phone host this is the common case (roadmap §6).
where     — docs/src/lib/tavola/session.ts (a successor chosen from the roster, signing with a key the host shared), live-controller.ts (chat numbering moves with the role).
done when — when the host leaves for longer than the grace period, the next member becomes host, new people can knock, and chat keeps flowing; the old host rejoins as a member.
evidence  — a Tavola test for the handoff and a live-session-check step that closes the host tab.
verify    — the adversarial trio, because it moves the trust anchor.
