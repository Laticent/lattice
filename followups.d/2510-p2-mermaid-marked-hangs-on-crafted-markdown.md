---
origin: 2510
priority: P2
recorded: 2026-10-04
source: https://github.com/Laticent/lattice/pull/2510
---

# marked, which Mermaid ships, takes 22 s on 8 KB of `[a](`

why now   — The Segno language probe (#2510) timed marked beside Segno and found two inputs
            that grow far faster than their length. marked 16.4.2, the copy under
            node_modules/mermaid, lexed `[a](` repeated 2,000 times (8 KB) in 22.4 s, and was
            still running at 60 s for 20,000 repeats. `*a ` repeated 20,000 times took 44.8 s.
            marked 4.3.0 under @zenuml/core behaves the same. Lattice does not call marked
            itself; Mermaid does, for markdown labels in diagrams. NOT YET CHECKED: whether text
            an author types into a Lattice diagram reaches marked, and so whether a pasted deck
            could hang the Studio or a render.
where     — node_modules/mermaid/node_modules/marked (16.4.2) and
            node_modules/@zenuml/core/node_modules/marked (4.3.0); the callers in mermaid's
            markdown-label path.
done when — either a test shows deck text cannot reach marked's lexer, or the path is
            guarded (input length cap, or a mermaid/marked version without the blowup) and a
            timing test pins it.
evidence  — the reach check (which deck syntax reaches marked, if any), and before/after
            timings on the two inputs above.
verify    — tier 1 for the reach check; the timing test on the guarded path.
