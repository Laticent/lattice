---
origin: 2547
priority: P3
recorded: 2026-10-06
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2547
---

# Limit what an admitted editor can do to the document

why now   — an admitted editor is trusted with the text: Yjs updates carry no signatures, so an editor can write items under another member's client id, split two copies for the rest of the session, or flood the document with updates. Tavola gates who may edit, not what or how much (design note §12, known limits).
where     — docs/src/lib/tavola/session.ts (a per-member rate limit on document frames), docs/src/components/studio/live/live-controller.ts.
done when — document updates from a member are rate-limited, and the remaining insider risk is written into the threat model with the owner's sign-off.
evidence  — a Tavola test that floods updates and stays responsive.
verify    — red team.
