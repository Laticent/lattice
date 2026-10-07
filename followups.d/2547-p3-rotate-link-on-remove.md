---
origin: 2547
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Rotate the link secret when someone is removed

why now   — today a removed person who reopens the link reaches the lobby as a new knock; rotation would make the old link dead (§5.4).
where     — docs/src/lib/tavola/session.ts, live-controller.ts (rejoin under the new room).
done when — after remove, members move to a new room and secret, the panel shows the new link, and the old link reaches nobody.
evidence  — a Tavola test plus a live-session-check step.
verify    — tier 1 checker, because it moves every member at once.
