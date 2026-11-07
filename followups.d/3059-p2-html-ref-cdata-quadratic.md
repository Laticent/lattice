---
origin: 3059
priority: P2
recorded: 2026-11-06
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: off-path — the fix belongs in the Segno code generator, which emits lib/core/html-ref.generated.js; this PR changes tests only
---

# An unterminated `<![CDATA[` makes the html-ref reader quadratic

why now   — an unterminated `<![CDATA[` in foreign content after a `>` searches for `]]>` to the end of the text once
            per section (`r_cdata`, lib/core/html-ref.generated.js:471, reached from html-ref-reader.js:172). Found by
            #3059's rewrite of `test/unit/core/html-ref-differential.test.js`: about 15,000 characters searched per
            input character. Measured through R3: 0.35 s at 420 KB, 1.5 s at 1.7 MB, 9.3 s at 3.4 MB;
            `blockWebImages` takes 17.7 s at 3.4 MB. Shared and AI-generated decks are untrusted input (#22).
where     — the Segno generator's CDATA rule; `nx_45` and `nx_60` already remember their last single-character search.
            Unverified beside it: `lib/core/masthead.transform.js:432` `/(\s*<footer[^>]*>[\s\S]*?<\/footer>\s*)$/` was
            flagged on the closed-comments inputs by a backtrack counter later shown not to tell linear from quadratic,
            so measure it before acting.
done when — the `]]>` search is remembered across sections, and the two CDATA inputs in html-ref-differential move from
            their hang guard to the `scanWork` bound the other eight inputs hold.
evidence  — `scanWork` on both readers at the test's inputs, before and after.
verify    — maker-checker: the generator emits a security-relevant reader.
