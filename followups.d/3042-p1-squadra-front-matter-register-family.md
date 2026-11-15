---
origin: 3042
priority: P1
recorded: 2026-11-15
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §7 step 4
deferred: large — the front-matter register family is about 25 lint-core rules, each a faithful Squadra port with fixtures and a reference diff at 0; the session that built step 3 spent its budget on the island's adversarial review
source: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md
---

# Step 4, first family: the front-matter registers

why now   — step 3 gave `lattice-deck` the `fm-key` nodes (name, value, block-scalar body, parent) and the
            `deck.settings` / `deck.registers` facts this family reads. It proves a family end to end on the runtime.
where     — new rules under lib/authoring/rules/front-matter/; the lint-core rules that read the front matter
            (grep lib/authoring/lint-core.js for `lastFrontMatterMatch`, `fmBlock`, `frontMatterName`: finish, mode,
            claim, stamp, tone, spectrum and its four dials, rule, eyebrow, headline, corners, lift, venue,
            chart-finish, preset, cards, backdrop, tag, split, form, color-mode, lang, delivery, pace, inline-code,
            the deck `class:`, duplicate-key, fonts-renamed, the typography style override).
done when — each is a `deck/` rule reading `fm-key` or a deck fact, its fixtures pass the strict build, and
            `npm run squadra:reference-diff -- --fix` holds the family at 0 or every difference is explained.
evidence  — the reference-diff report (lint and fix) in the PR body, with the count of sources the fix diff compared.
verify    — maker-checker on the family commit (the plan's tier for a family).
