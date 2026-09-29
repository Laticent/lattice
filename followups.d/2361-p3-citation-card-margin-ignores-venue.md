---
origin: 2361
priority: P3
recorded: 2026-09-29
---

# `citation-card margin` text never scales with the venue

why now   — the `margin` variant sets its quotation in `--fs-h2`, which is exempt from the
            venue step (typography.md §7), so it stays 28pt at every venue while the text
            around it grows (`engineering/decisions/2026-09-29-one-reading-size-per-venue.md` §3.3).
where     — lib/components/legal/citation-card/citation-card.styles.css.
done when — `npm run audit:reading-size -- --only=citation-card` shows `citation-card
            margin` growing from laptop to hall, at the role the owner picks (display or the
            shared reading size).
evidence  — the audit line before and after.
verify    — self-review with the gates.
