---
origin: 2547
priority: P2
recorded: 2026-10-06
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2547
deferred: blocked — the docs site has no privacy page to link yet; the wording itself shipped in #3051
---

# Link the Live IP-address note to a privacy page

why now   — #3051 put the wording on the start card and the lobby (owner-approved 2026-11-06): a guest's browser connects directly before admission, and the STUN servers (Google, Cloudflare) and public relays see the address. What is left is somewhere to read more: the docs site has no privacy page.
where     — the Live panel's start card and lobby copy, the docs site's privacy wording, engineering/decisions/2026-10-06-studio-live-collaboration.md §12.
done when — a docs-site privacy page says who sees a Live user's IP address, and both cards link to it.
evidence  — screenshots of both cards at phone and desktop width.
verify    — self-review; prose-checker on the copy.
