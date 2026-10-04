---
origin: 2361
priority: P3
recorded: 2026-09-26
---

# compare-prose `axis` draws an arrow and clips its numerals and body

why now   — found while adding the emergence slide to the agentic-practices talk. The docs
            say `axis` is for "two FACETS of one idea, not a before/after change of state",
            yet at 4k it still draws the arrow connector between the cards, which reads as
            "left becomes right". The generated Roman numerals (I, II) are cut off at the top
            of each card, and two cards of about 30 words each clip their last line. The talk
            used a two-card `cards-grid` instead.
where     — lib/components/comparison/compare-prose/ (the `axis` rules in its styles, and
            the connector the base layout draws).
done when — `axis` draws no arrow (or a neutral divider), the numerals render whole, and
            two cards of about 30 words each fit at 16:9 4k without clipping.
evidence  — the compare-prose gallery `axis` slide at 4k, light and dark, before and after.
verify    — tier 0 gates plus looking at the gallery; the change is local to one variant.
