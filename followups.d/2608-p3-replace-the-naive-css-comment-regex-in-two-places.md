---
origin: 2608
priority: P3
recorded: 2026-10-08
area: engine
severity: low
swimlane: lib/core/css-comments.mjs
source: https://github.com/Laticent/lattice/pull/2608
---

# Replace the naive CSS-comment regex in two places

why now   — lib/core/css-comments.mjs says not to strip comments with
            /\/\*[\s\S]*?\*\//, because it misreads "/*" inside a string or an
            unquoted url(); two callers still do
where     — tools/minify-css.js (COMMENT_RE; first-party CSS only, lower risk);
            lib/theme/parse.js rootSpecificity (selector text, e.g.
            [data-x="/*"])
done when — both call stripCssComments (or maskCssComments where offsets must
            hold); a unit test feeds each a "/*" inside a string and gets the
            right answer; the minified dist/ bundle is byte-identical before and
            after (npm run build, then git diff --stat dist is empty)
evidence  — the new test cases failing on main and passing on the branch, plus
            the byte-identical bundle check
verify    — tier 0 gates plus the before/after byte diff, because minify-css
            feeds every shipped bundle; escalate to a tier 1 checker if the
            bundle bytes change at all
