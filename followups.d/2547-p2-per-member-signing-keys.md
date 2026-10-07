---
origin: 2547
priority: P2
recorded: 2026-10-06
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2547
---

# Give every member a signing key, so a member's peer id is proven, not vouched for

why now   — peer ids are self-declared. When two guests' own link blips, each re-admits the other on the host's word (`roster?`); a link holder who takes that id at that moment, while the real member is still connected to the host, is let in (§12, known limits). The host's id is already proven this way.
where     — docs/src/lib/tavola/session.ts and hostkey.ts (a member key in the knock, bound in the roster; a signed member hello on every member-to-member link), live-controller.ts (keep the key across a reload with the rejoin token).
done when — a member link is trusted only after a hello signed by the key the roster binds to that id; a squatter under a member id gets nothing, including during a partial blip.
evidence  — a Tavola squat test for the partial-blip case that fails today, plus the live-session-check run.
verify    — the adversarial trio, because it changes the trust model.
