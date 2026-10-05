---
origin: 2519
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2519
---

# Check five findings from a superseded phase-2 review against #2513

why now   — While #2513 (phase 2, claude/segno-phase-2) was built in parallel, the #2519 session
            built and trio-reviewed a narrower phase 2 (pills, state marks, sparks) that it then set
            aside. Its red team, inversion and checker found defects in that code; five of them are
            in shapes #2513 may share, and nobody has checked. If they hold, they ship silently.
where     — #2513's branch: its pill and spark readers, its codemod and any lint autofix, its
            Segno slot fast path, tools/build.js step order versus the ownership guard.
done when — each is confirmed (and fixed with a test) or refuted against #2513's code:
            1. a pill label holding `|` `=` `[` `]` `{` `"` stops rendering with no lint warning;
            2. `{"BETA"}` loses its quotes (old kernel drew `"BETA"`);
            3. a fix built with String.replace(text, to) expands `$&` / `$'` in author text
               (use a function replacer);
            4. a slot fast path that walks the parser's reused buffer breaks when a custom type
               parses again (count parses, fall back);
            5. once lib/core requires `@laticent/segno`, a stale dist/ aborts `npm run build` at the
               ownership guard before the Segno step can rebuild it.
evidence  — a failing test per confirmed item, then passing; for 5, the stale-dist repro (point
            `@laticent/segno` at an older dist, run `node tools/check-ownership.js`).
verify    — tier 1, one checker: each item is narrow and has a known repro.
