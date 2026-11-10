---
origin: 3061
priority: P1
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-gift-link-cli.md §8
deferred: blocked — slice 5 needs the owner's sign-off on real exported PDFs (Quality Bar), and the end-to-end check needs the owner's own OpenRouter management key, which never enters CI or a sandbox
source: https://github.com/Laticent/lattice/pull/3061
---

# Gift links: the print-shop PDF (slice 5) and the first real batch on the owner's machine

Slices 1–4 shipped on branch `claude/gift-link-module-d7yda3`: the codec (`lib/core/gift-link.mjs`),
the `/gift` route, the admin CLI (`tools/gift-cards.mjs`), the `card` / `card-iso` sizes and the
`gift-card` component. The §7 decisions took their recommended defaults.

why now   — the cards are ready for home printing; a print shop wants exact size with bleed and crop
            marks, and nothing has yet run against a real management key.
where     — tools/gift-cards.mjs (`imposeSheet` is the home sheet; a print-shop PDF would be a
            per-card page at physical size plus 1/8 in bleed); the export pipeline if bleed is drawn there.
done when — (a) the owner runs `node tools/gift-cards.mjs make` once with a real management key, opens
            the printed link on a phone and a laptop, and `revoke` deletes it; (b) slice 5, if wanted:
            a print-shop PDF the owner signs off in light and dark.
evidence  — the real link opening a ready Studio on both devices; the signed-off print-shop PDF.
verify    — tier 2, maker-checker; the owner's eyes on printed cards.
