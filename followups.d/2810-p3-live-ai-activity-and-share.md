---
origin: 2810
priority: P3
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Show AI activity in Live, and let a member share a chat turn

why now   — the room cannot tell an AI edit from a hand edit; the applied-edit line was designed in the 2026-10-06 note §5.7 and never built (note §5.3).
where     — live-controller.ts system lines and posts, ArchitectChat.tsx Share action.
done when — 'asking the AI', 'applied an AI edit to slide N', and a Share-a-turn card in people chat.
evidence  — two-browser check; a grep of the posts shows no key or cost leaves the browser.
verify    — tier 1 checker.
