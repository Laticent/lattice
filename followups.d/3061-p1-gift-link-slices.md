---
origin: 3061
priority: P1
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-gift-link-cli.md §8
deferred: blocked — slice 5 needs the owner's sign-off on real exported PDFs (Quality Bar), and a minted key's first real model call cannot be observed from a sandbox whose proxy injects the management key into every openrouter.ai request
source: https://github.com/Laticent/lattice/pull/3061
---

# Gift links: a real chat on a minted key, and the print-shop PDF (slice 5)

Slices 1–4 shipped in PR #3113. On 2026-11-10 the CLI ran against the real OpenRouter API with the
owner's throwaway management key: `make` (one key, then a PIN-locked batch of two with the deck,
PDF and Letter sheet), `report` and `revoke` all worked. The printed QR codes decoded to the keys
OpenRouter made, and a freshly minted real link redeemed on the deployed preview's `/gift` in
Chromium and WebKit. Every test key was revoked, and nothing was spent.

why now   — two things are still unobserved: a minted key answering its first real model call (the
            activation delay `minted: true` covers), and, if wanted, a print-shop PDF.
where     — tools/gift-cards.mjs (`imposeSheet` is the home sheet; a print-shop PDF is a per-card page
            at physical size plus 1/8 in bleed); docs/src/lib/openrouter-key.js (`OPENROUTER_ACTIVATION_MS`).
done when — (a) on a machine without a key-injecting proxy, a link from `make` opens the Studio and its
            first chat turn gets a reply (or the activation notice, then a reply); (b) slice 5, if wanted:
            a print-shop PDF the owner signs off in light and dark.
evidence  — the chat reply on the minted key; the signed-off print-shop PDF.
verify    — tier 2, maker-checker; the owner's eyes on printed cards.
