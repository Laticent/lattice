---
origin: 2650
priority: P1
recorded: 2026-10-13
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2650#issuecomment-6142132263
---

# A pill costs 2.8x the retired kernel, and the all-spans ratio still lands either side of 1.5x

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

Progress (2026-10-13, this branch): a plain `{…}` record now binds from the parser's tree
(`fastRead` in schema.ts), `isDirective` and the icons `canonical` got a fast first branch, and the
pill reader reuses the icon it already found. A pill's shipped decision went from 933, 678 and
702 ns to 563, 503 and 521 ns over three runs (5.1x, 3.5x and 3.8x the kernel, then 3.0x, 2.8x and
2.7x). The every-span ratio read 1.65x, 1.37x and 1.29x, against 1.34x, 1.71x and 1.41x before:
the done-when (at or under 1.4x in each of three runs) is NOT met, and most of what is left is not
the pills. The ordinary-code row, which this work did not touch, read 1.0x, 1.6x and 1.4x across
the same three runs, so the figure is noise-bound in this sandbox.

What is left, in the order it would pay: (1) the grammar's own parse is about 290 ns of a pill's
503, and `parse()` allocates two result objects per call (`{ok, tree: {buf, top, kinds}}`) that
the fast read throws away; (2) the harness times every column through one `time()` call site, which sees many different
functions. That probably makes each column pay an indirect call and adds run-to-run noise, but it is
a hypothesis and was not tested. A per-column timer would show it; change the harness only with a
before/after run of both versions on one machine.
