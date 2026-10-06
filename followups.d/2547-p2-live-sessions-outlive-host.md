---
origin: 2547
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Let a live session outlive the host's tab

why now   — a session ends when the host closes the tab; chat is not kept with the deck. Persistence is the first thing a server-backed mode brings (roadmap §2, step 2), but a peer-to-peer version (the last member keeps the room) may be enough for now.
where     — docs/src/lib/tavola/, docs/src/components/studio/live/live-controller.ts.
done when — the owner picks peer-held persistence or the server step, and the chosen path keeps a session (document and chat) alive when the host closes the tab.
evidence  — a test that closes the host and rejoins later.
verify    — tier 1 checker.
