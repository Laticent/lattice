---
origin: 2547
priority: P2
recorded: 2026-10-06
area: website
severity: high
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2547
---

# Say who sees a Live user's IP address

why now   — anyone holding the link gets a direct connection, and so an IP address, before being admitted; the public Nostr relays and the STUN servers (Google, Cloudflare) also see IP addresses. Nothing in the product says so (roadmap §5, decision 3).
where     — the Live panel's start card and lobby copy, the docs site's privacy wording, engineering/decisions/2026-10-06-studio-live-collaboration.md §12.
done when — the owner approves wording, and the start card and lobby state it plainly, with a link to the privacy page.
evidence  — screenshots of both cards at phone and desktop width.
verify    — self-review; prose-checker on the copy.
