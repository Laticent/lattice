---
origin: 3061
priority: P1
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-gift-link-cli.md §8
deferred: blocked — awaiting the owner's answers to the §7 decisions (card size, print route, CSV links, PIN, tool home)
source: https://github.com/Laticent/lattice/pull/3061
---

# Build gift links: the shared link module, the Studio /gift route, the admin CLI and the card deck

why now   — the owner wants coffee-shop trial cards and friend-to-friend key sharing with Lattice storing nothing; the
            design is settled except the five §7 decisions put to the owner in #3061's decision card.
where     — engineering/decisions/2026-11-06-gift-link-cli.md §8 (five slices); docs/src/lib/openrouter-key.js
            (writeOpenRouterKey); lib/core/sizes.js (the card size); lib/components/connect/_qr-card/ (the QR encoder).
done when — slices 1–4 shipped: the link module with tests on fake keys and the key format confirmed from OpenRouter's
            docs; /gift and the gift-link box with screenshots at 1440/820/390 and a WebKit phone run; the CLI make/report/
            revoke with the CSV; the card size, gift-card component and its demo deck for home printing.
evidence  — a real gift link made by the CLI with the owner's management key on the owner's machine, opened on a phone
            and a laptop; printed cards looked at.
verify    — tier 2, maker-checker (it hands out spendable keys).
