---
origin: 2361
priority: P2
recorded: 2026-09-27
---

# `lint:deck` warns on a spot `scale-*` / `venue-*`

why now   — the owner ruled on 2026-09-27 (PR #2399): a `_class: scale-xl` or `venue-*` on SOME
            slides, not the deck, sets those slides apart in size, which is the per-slide difference
            one-size-per-deck exists to stop. Keep the directive working, but warn.
where     — lib/authoring/lint-core.js (a new rule beside `capacity-scale`; FONT_SCALE_KEYS already
            names the tokens); lib/base/base.registers.docs.md and engineering/typography.md §7,
            which document the spot directive; `checkTypeSizeModifiers`' carve-out comment in
            tools/check-ownership.js.
how       — fire when a slide's own `_class` carries a scale / venue token the deck's front matter
            does not; the fix names front-matter `venue:`. Count the corpus first
            (`grep -rn "_class:.*\(scale-\|venue-\)" examples lib`) so the severity is set knowing
            how many decks it touches.
done when — the rule ships with a unit test, the docs say the spot form is discouraged, and the
            carve-out in the decision note (Amendment 2026-09-27 (2)) points at it.
evidence  — `lint:deck` output on a deck with one spot `scale-xl` slide; the corpus count.
verify    — tier 0: the unit test plus `npm run lint:deck:all`.
