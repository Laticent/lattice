---
origin: 3061
priority: P1
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-gift-link-cli.md §8
deferred: blocked — slice 5 changes exported bytes, so it needs the owner's sign-off on real print-shop PDFs in light and dark (Quality Bar)
source: https://github.com/Laticent/lattice/pull/3061
---

# Gift links: the print-shop PDF (slice 5)

Slices 1–4 shipped in PR #3113 and were verified against the real OpenRouter API on 2026-11-10:
`make`, `report` and `revoke` with the owner's throwaway management key; printed QR codes decoded
to the keys OpenRouter made; a minted link redeemed on the deployed preview; and a minted $0.05
key's chat replied in the Studio, which found and fixed the capped-key refusal (one test key,
`raise-chat-1`, spent $0.06 and was left for the owner to delete).

why now   — the home print sheet (ten cards on Letter or A4 with crop marks) is enough to hand cards
            out; a print shop wants each card at physical size with bleed.
where     — tools/gift-cards.mjs (`imposeSheet` is the home sheet; a print-shop PDF is one card per page
            at 3.5 x 2 in or 85 x 55 mm plus 1/8 in bleed, with crop marks outside the trim).
done when — a print-shop PDF the owner signs off in light and dark, and one batch printed by a shop.
evidence  — the signed-off PDFs; a photo of the printed cards.
verify    — tier 2, maker-checker; the owner's eyes on printed cards.
