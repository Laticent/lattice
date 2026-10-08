---
origin: 2606
priority: P3
recorded: 2026-10-08
area: theming
severity: low
swimlane: engineering/treatments.md
source: https://github.com/Laticent/lattice/pull/2606
---

# The eleven `mark-*` treatments: look at each one closely and decide keep, change or drop

why now   — the owner reviewed every mark on 2026-10-08 and found some that make no sense on a
            slide. The intent stands: marks are SUBTLE texture that plays with finishes and must
            never take away from the content or the finish. But several cross from subtle into
            invisible. No CSS has changed; this card is for deciding together, mark by mark.
            The review (indaco, cards-grid, each mark alone and over finish-atrium,
            finish-nimbus and finish-ledger, light and dark) read:
              - hold up: mark-micro, mark-grid, mark-chevron, mark-slashes, mark-pills;
              - too faint or lost: mark-brackets (two ~6×16px "]" pressed against the right
                edge, nothing at viewing size), mark-threads (hairlines, gone in dark),
                mark-ticks (mostly gone in dark), mark-seeds (corner specks; vanish under
                finish-nimbus in dark), mark-asterisks (renders as dots at this size, a weaker
                mark-micro);
              - clash: mark-orbit sits beside the page number, bottom right, and crowds it.
where     — lib/base/base.treatments.css (each mark's ::before: size, position, the 28% accent
            mix, the mask SVG); the rules in engineering/treatments.md §Design constraints
            (peripheral slots, the 28% opacity budget, cropped boxes because masks drop in
            some PDF viewers); finishes in lib/base/base.finish.css and
            engineering/decisions/2026-06-30-finish-the-surface-layer.md (marks are the
            finish's texture ingredient).
done when — the owner has decided keep / change / drop for each of the eleven; any change
            stays inside the peripheral slots and the opacity budget (or the budget is changed
            on purpose, in treatments.md); a dropped mark is retired with a lint message, not
            silently removed; mark-orbit no longer crowds the page number.
evidence  — the same review deck before and after, sent to the owner: one page per mark,
            light and dark, no finish + the three finishes above. To rebuild it, write a deck
            of 48 `cards-grid` slides (12 rows: no mark, then each mark × 4 columns: no finish,
            `finish finish-atrium`, `finish finish-nimbus`, `finish finish-ledger`) once with
            `color-mode: light` and once with `color-mode: dark`, render both with
            `node dist/lattice-emulator.js`, and tile each mark's 8 slides on one page.
            Also a feature deck per HARD RULE #9 if any mark changes.
verify    — tier 0 gates plus the owner's look, because this is a visual judgment on decorative
            CSS with no export or engine path; golden-diff will show which galleries move.
