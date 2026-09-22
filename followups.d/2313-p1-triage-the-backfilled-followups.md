---
origin: 2313
priority: P1
recorded: 2026-09-22
---

# Triage the backfilled followups.d/ items

why now   — #2313 copied every unticketed item from two months of continuation briefs
            into this folder without checking any against `main`. Until someone does,
            the list mixes live work with done and duplicated items, so it cannot be
            worked top-down.
where     — every `followups.d/*.md` with `backfill: true`. `npm run followups` counts them.
            Known cases: #2215 P1 and #2212 P1 are done; the CDN-route render appears on
            both #2302 and #2307.
done when — every backfilled item is deleted (done or duplicate), promoted to an issue,
            or kept with `backfill: true` removed. `npm run followups` prints no triage
            warning.
evidence  — the triage PR's body lists each item with its verdict (done / duplicate /
            promoted / kept) and the commit or issue that shows it.
verify    — tier 0, because each verdict is a file deletion or a one-line edit, and the
            PR body is the record.
