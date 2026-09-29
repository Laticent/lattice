---
origin: 2361
priority: P1
recorded: 2026-09-29
---

# Give reading text one size per venue, across every component

why now   — every deck on every venue mixes three reading sizes (a `list` row at
            `--fs-message`, a card body at `--fs-body`, a table cell at
            `--fs-body-compact`), because the venue multiplies each role by one factor. It is
            the base the boardroom consistency bar stands on, and every capacity budget depends
            on it. Steps 1–2 are on `claude/one-reading-size-per-venue-ybt94q`: the audit
            (`npm run audit:reading-size`) and the costed note `engineering/decisions/2026-09-29-one-reading-size-per-venue.md`. Owner rulings: code keeps
            `--fs-body-compact`; one-per-slide lead sentences stay display-sized. The shared
            size (note §5) is still open. This file restores the one #2361's brief named, which
            was never pushed.
where     — size roles: engineering/typography.md; list rows: `--list-row-fs` in
            lib/components/inventory/list/list.styles.css; tables: base.elements.css
            § UNIVERSAL TABLE; budgets: each manifest's venueCapacity, re-measured by
            tools/calibrate-capacity.js. Note §6 lists every stylesheet that moves.
done when — `npm run audit:reading-size` shows one reading value per venue apart from the
            note's named exceptions, and the #2361 talk renders its takeaway, tabular, table
            and card slides at one size with an empty OVERFLOW line.
evidence  — the before/after size table in the PR body; the six galleries and the #2361 talk
            at laptop and huddle before and after, via SendUserFile, plus tools/pixel-check.js.
verify    — tier 2 adversarial trio: it changes every component on every venue and re-sets
            the budgets lint:deck and the fit check rely on.
