---
origin: 2628
priority: P2
recorded: 2026-10-11
area: theming
severity: medium
swimlane: engineering/treatments.md
source: https://github.com/Laticent/lattice/pull/2628
---

# Dark slides erase every gradient-slot tint (`tint-*`)

why now   — found while checking the mark review: `mark-seeds` painted nothing on a dark slide.
            #2628 moved seeds to `::before`, so seeds is fixed; the `tint-*` family still has this. `engineering/treatments.md` §Dark mode says treatments need no
            per-mode override; on dark slides that is false for the gradient slots.
where     — `lib/base/base.modifiers.css:849` `section.dark:not(:where(.title, …))` sets
            `background-image: var(--spectrum-bar)` at (0,1,1). The compositor
            `section:where([class*="tint-"], [class*="mark-"], …)` (base.treatments.css:69) is
            (0,0,1), so it loses and `--_bg-radial` / `--_bg-linear` never paint.
measured  — indaco, `color-mode: dark`, `cards-grid tint-corner at-tl`: corner pixel (0,29,51),
            identical to the slide background. Same deck in light: (225,238,244).
done when — a dark slide with `tint-corner at-tl` paints its glow; the spectrum hairline at the top still draws.
fix shape — compose the bar into the slot instead of replacing it, e.g. list `var(--spectrum-bar)`
            as the last layer of the compositor's `background-image`, or give the compositor the
            same specificity. Either way every dark `tint-*` in every gallery starts to paint,
            so it is a visible change on many decks: run golden-diff, and treat it as the owner's
            call (HARD RULE #8, and the second filter in CLAUDE.md).
evidence  — before/after dark pages for each tint family; golden-diff list.
verify    — tier 1 checker, because the cascade is shared by every dark slide.
