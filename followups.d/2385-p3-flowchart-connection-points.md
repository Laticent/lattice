---
origin: 2385
priority: P3
recorded: 2026-09-26
---

# Let an author pin where a line meets a shape, in a pinch

why now   — The owner's idea, raised on #2385. The solver picks every port itself (side
            middles, a diamond's tips, spreading ends that share a side), and that is
            the right default. An author has no way to say "leave from the right
            side" or "enter at the top" when the default reads wrong.
where     — lib/core/flowchart-grammar.js (a span word on the connection, e.g.
            `:from-right` / `:to-top`, or per-shape named points); graph-layout.js
            (`solveRoutes`: a pinned side is a fixed port, as self-loops already are);
            lint-core.js; flowchart.docs.md.
done when — A connection can pin the side it leaves from and the side it arrives at
            (top, right, bottom, left; a diamond's four tips). The solver treats a pin
            as fixed and routes everything else around it. The self-healing half: a
            pin the never-rules cannot honor (it would force a line through a box)
            is dropped for that line, and lint says so; a pin never breaks a
            never-rule. Quality counts stay zero across the gallery with pins added
            to the fuzz corpora. It stays an escape hatch: the docs say the default is
            what to use.
evidence  — The owner's review of #2385.
verify    — node --test test/unit/components/graph-layout.test.js
            test/unit/core/flowchart-grammar.test.js.
