---
origin: 2772
priority: P4
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md
deferred: off-path — the door's code ranges (`ctx.codeRanges`) hold only fences, so indented code needs its own range scan through the engine's parser; #3136 fixed the fence and inline-span openers and touches nothing that adds indented code
source: https://github.com/Laticent/lattice/pull/3136
---

# A record after an unclosed `<!--` the parser does not read as a comment is dropped (indented code, an unclosed inline opener)

why now   — the fourth checker pass on #3136: `Text\n\n    <!-- x\n\n<!-- {class=dark} -->` renders with no class, on
            `main` and on the branch. `commentSites` pairs the indented code's `<!--` with the record's `-->` and the
            record never reaches the door. #3136 fixed the same pairing for an opener in a fence and in an inline code
            span (matched by backtick-run length, as CommonMark does). One sibling remains, with the same root (an
            opener the parser never reads as a comment): an unclosed inline `<!--` in a paragraph (`a <!-- y`, a blank
            line, then a record), which CommonMark ends at the blank line. An indented code block is also not in the
            code ranges the door is given.
where     — lib/core/meta-door.mjs `commentSites`; lib/engine/source-hooks.js `codeRanges` (fences only unless a record
            sits in one).
done when — `commentSites` pairs only openers the engine's parser reads as comments (indented code
            excluded, a paragraph's inline opener closed at its paragraph's end), and both shapes render `dark`; the 494-deck render diff against `main` stays byte-identical.
evidence  — the checker's probe (scratch `ck/eng.mts`, shape above).
verify    — tier 1 checker.
