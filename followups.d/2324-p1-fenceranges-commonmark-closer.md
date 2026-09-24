---
origin: 2324
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2324
---
# Compose's `fenceRanges` closes a fence on an indented run that CommonMark does not

why now   — `fenceRanges` decides which slides lock (math, tables) and which directives
            hoist. It accepts any `[ \t]*` indent before a closing fence, while markdown-it
            (and the engine) take only zero to three spaces. So a deck that is valid
            CommonMark (a ``` fence whose body has a `    ```` line) is read wrong: the
            math after the fence stops counting as lossy, so the slide unlocks, and the
            next Compose edit can corrupt that math. #2324 stopped Compose's own
            serializer from WRITING such bytes (`fenceFor` lengthens on any indent), but
            an author can still type them in Markdown mode.
where     — docs/src/components/studio/slide-directives.ts `fenceRanges` (~line 74);
            docs/src/lib/compose/deck-markdown.ts `fenceFor` (its any-indent closer test
            can narrow to ` {0,3}` once `fenceRanges` agrees with CommonMark).
done when — a unit test feeds `fenceRanges` the prose "```\n    ```\n```\n\nPrice $x^2$"
            and gets one range covering all three fence lines, `hasLossyConstruct` is
            true for it, and the test fails on today's regex.
evidence  — the test failing before and passing after (paste both runs).
verify    — tier 1 checker, because `fenceRanges` feeds the slide lock that keeps
            Compose from corrupting math and tables, a seam every edit crosses.
