---
origin: 2361
priority: P2
recorded: 2026-09-29
---

# At `venue: hall`, table cells render smaller than their own labels

why now   — the label lift raises `--fs-meta` 1.3x on top of hall's 1.5x step, so labels,
            pills and column headers land at 21.9pt while `--fs-body-compact` cells land at
            20.2pt: the data reads smaller than what labels it (`engineering/decisions/2026-09-29-one-reading-size-per-venue.md` §3.3).
where     — `--venue-meta-lift` in lib/base/base.modifiers.css; the cell role in
            base.elements.css § UNIVERSAL TABLE.
done when — `npm run audit:reading-size -- --venues=hall` shows every reading size at hall
            above the meta size. The 16pt shared-size option satisfies it by itself (cells at
            24.1pt); any other option needs its own fix (a lower hall lift, or a floor).
evidence  — the audit's hall line before and after, and one table slide at hall rendered.
verify    — self-review with the gates.
