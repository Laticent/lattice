---
origin: 2519
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2519
---

# Author text reaches `String.replace` as the replacement string in two render paths

why now   — Found by the checker on #2519's follow-up PR while it verified that no LINT fix
            expands `$&` in author text (that refutation held). Two render paths do it instead:
            a `$` pattern in author text is read as a replacement token, so the output carries
            other markup. Pre-existing and off that PR's path, so logged rather than fixed there
            (HARD RULE #18).
where     — lib/forms/tile/meta/meta.transform.js:57: a `meta:` value holding `$` followed by a
            backtick renders the markup before the match in its place; lib/engine/qr.js:69-70:
            a label holding `$'` puts the rest of the SVG markup into
            `aria-label` and `<title>`; probably also roadmap.transform.js:239 and :372 (not
            reproduced). `grep -rn "\.replace(.*, \`" lib/` lists the shape.
done when — every replacement built from author text is a function replacer (`() => text`), each
            site has a test with `$&`, `$'`, `` $` `` and `$$` in the author's text, and a
            HARD-RULE-#1 kernel helper or a lint-core-style gate stops a new site (decide which).
evidence  — a failing-then-passing test per site.
verify    — tier 1 checker: narrow, with known repros.
