---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# A receded bar's value and category labels should recede with it

why now   — the Guide's focus (and the chart hover it mirrors) recedes the OTHER marks to 0.45, but
            a bar chart's value label (`text.cart-value`) and category label (`text.cart-cat`) carry
            no link to their bar, so they stay at full strength. On indaco dark the bars themselves
            are dark fills, so the receded bars barely change and the labels carry the reading: the
            focused bar hardly separates (seen in the built Studio, 2026-09-26). Charts that stamp
            `data-mark-for` on their labels (pie key, funnel, slope, quadrant) already recede them.
where     — lib/components/chart/bar/bar.transform.js (and the other cartesian charts that emit
            `cart-value` / `cart-cat`): stamp `data-mark-for="<i>"` on each label.
            docs/src/components/studio/present-guide.ts `focusUnit` already recedes linked labels;
            docs/src/playground/chart-interact.js should recede them on hover too, for one language.
done when — focusing or hovering a bar on indaco dark recedes the other bars' labels, and the
            focused bar reads at a glance.
evidence  — built-Studio screenshots of the bar slide, light and dark, before and after.
verify    — the attribute changes exported bytes (no pixels), so it follows the export sign-off
            rule: dark and light renders to the owner before merge.
