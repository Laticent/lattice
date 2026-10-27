---
origin: 2915
priority: P3
recorded: 2026-10-26
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# A statement slide with its scrim removed is not checked

why now   — The Coach's photo-contrast read measures spotlight cards only. A statement's backing is the
            `.image-scrim` gradient, which the reader does not model, so statements are skipped. With `card-clear` the
            scrim is gone and the fixed white ink can vanish on a bright photo; that case goes unwarned.
where     — `docs/src/components/studio/coach/photo-contrast-read.ts` (the spotlight-only guard);
            `lib/components/imagery/image/image.styles.css` `.image-scrim` (the two gradient layers and `--_card-alpha`).

done when — The reader models the scrim (or samples it) for a statement and flags white ink that falls under 4.5:1, with an e2e over a bright photo and `card-clear`.
