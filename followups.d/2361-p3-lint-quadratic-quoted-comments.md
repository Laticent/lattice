---
origin: 2361
priority: P3
recorded: 2026-10-06
---

# `lintTextWith` is quadratic on many blockquoted unclosed comments

why now   — found while timing #2564's header walk. A deck of N lines of `> <!--` takes 286 ms at
            N = 1,000, 1.1 s at 2,000 and 4.5 s at 4,000 on origin/main, and the same on #2564: the
            time quadruples as the input doubles. Untrusted deck markdown reaches lint in the Studio
            on every keystroke, which is the HARD RULE #22 concern. Not caused by #2564: its final
            head adds no comment-reading code to lint.
where     — lib/authoring/lint-core.js: bisect which rule walks the open comment run per line
            (time `lintTextWith` with rules disabled one at a time); the input is
            `'---\nmarp: true\n---\n\n' + '> <!--\n'.repeat(N)`
done when — the time at N = 4,000 is within ~4x of N = 1,000, and a test in
            test/unit/components/lint-core.test.js pins it beside "linear on unclosed-comment input"
evidence  — before/after timings at N = 1,000 / 2,000 / 4,000
verify    — tier 1 checker: lint-core is the shared kernel (#7) and this is a #22 surface
