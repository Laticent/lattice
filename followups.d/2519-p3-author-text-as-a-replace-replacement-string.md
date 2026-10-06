---
origin: 2519
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2519
---

# Author text reaches `String.replace` as the replacement string: the audit and the gate

why now   — Found by the checker on #2519's follow-up PR. #2533 fixed every site it could
            reproduce, with a test per site holding `$&`: carousel labels and class rewrites,
            split-panel class words, backdrop, QR labels, blocked web-image addresses, the `meta:`
            tile and the roadmap's status cells and horizons cards (test/unit/authoring/
            pill-literal.test.js, test/unit/core/carousel.test.js). What is left is the class:
            nothing stops a new site.
where     — `grep -rn "\.replace([^)]*, \`" lib/` lists about twenty template-string replacements;
            most interpolate engine values (a bucket name, a counter), but some may carry author
            text (chart-family's class rewrite takes `escAttr(newCls)`; scene's `data-scene-spec`).
done when — each listed site is either shown to take no author text or made a function replacer
            with a `$&` test, and a HARD-RULE-#1 kernel helper or a lint-core-style gate stops a
            new site (decide which).
evidence  — the audited list in the PR body, a failing-then-passing test per fixed site.
verify    — tier 1 checker.
