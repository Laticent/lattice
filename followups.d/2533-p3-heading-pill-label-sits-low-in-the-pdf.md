---
origin: 2533
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2533
---

# A plain pill in a heading sets its label low in the PDF

why now   — measured while centering a pill's icon (#2533): in the export's Chrome 131, which takes
            the no-`text-box` fallback, a plain `{SNS, c1}` in an `h2` is 31.9px tall with its capitals
            10.6px from the top and 7.9px from the bottom, about 1.4px low. Body-size pills are within
            0.4px. Chrome 141, on the `text-box` branch, is 9.6/8.9.
            Pre-existing: the fallback's fixed 0.05em top shift was tuned at body sizes, and a heading
            pill's larger em overshoots it. Not caused by the icon fix, which leaves this pill unchanged.
where     — lib/base/base.modifiers.css § Optical centering, the `@supports not (text-box…)` branch.
done when — a heading-size pill's capitals sit within 0.6px of the box center in the exported PDF,
            and the body, `:sm` and `:lg` sizes stay within their current worst case.
evidence  — ink measurement of pills at body, heading, `:sm` and `:lg` in Chrome 131 (the PDF) and a
            current Chrome, before and after.
verify    — tier 1 checker.
