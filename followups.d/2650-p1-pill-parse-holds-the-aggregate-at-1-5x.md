---
origin: 2650
priority: P1
recorded: 2026-10-13
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2650#issuecomment-6142132263
---

# A pill costs 4x the retired kernel, which holds the all-spans ratio on the 1.5x line

why now   — #2650 took ordinary inline code from 149 ns to 37 ns (1.3x the kernel), but the
            all-spans bakeoff ratio still reads 1.41–1.64x over five runs. 35 pills and 18
            other directives of 4,742 spans hold it there (about 6 ns of 53). A pill costs
            942 ns against the kernel's 232 ns, and the bakeoff arm's own copy is slower
            (1.04 µs). Every deck that writes a pill or an icon pays it.
where     — docs/src/lib/segno (the generated grammar; `bindItems` in schema.ts: parse ~380 ns,
            tree to values ~230, bind ~170) and lib/core/inline-pills.js `accepted` / `bindPill`
            (about 230 ns above the bare slot read: isDirective, the memo compare,
            `service('icons','known')`, the result object). Segno README § Speed and
            § How the generated parser stays fast.
done when — `npm run parser:bakeoff:segno` reads "every span" shipped/kernel at or under 1.4x in
            each of three consecutive runs, with every tree and error identical
            (test/unit/core/inline-code-table.test.js and the Segno 1.2M-pair differential).
evidence  — the bakeoff's shipped column before and after, three runs each on one machine, plus
            npm run bench before/after (HARD RULE #19); route-budget declared if the Studio
            bundle grows.
verify    — tier 2 trio: it changes the parser generator and binder that every Segno surface and
            the published @laticent/segno share.
