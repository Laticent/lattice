---
origin: 3075
priority: P1
recorded: 2026-11-07
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: off-path — the time is in the markup library's walkStack, not in the masthead split #3075 fixed
source: https://github.com/Laticent/lattice/pull/3075
---

# A `<footer>` flood is still superlinear through `engine.render`

why now   — with #3075's one-pass footer split in, a deck that repeats `<footer>` still grows faster than its
            length through `engine.render`: 86 ms, 155 ms, 515 ms, 3.6 s at 16, 32, 64, 128 KB. A CPU profile
            puts the time in `walkStack` in docs/src/lib/markup/dist/index.cjs, not in masthead.transform.js.
            Shared and AI-generated decks are untrusted input (#22).
where     — the markup library's walkStack (docs/src/lib/markup, source rather than dist); reached from
            engine.render on a deck with many unclosed or repeated `<footer>` tags.
done when — render cost on a `<footer>` flood grows linearly, pinned by a `scanWork` / `charReads` count where the
            walk is countable, or by a `flaky-ok` hang guard where it is not.
evidence  — the growth table above, before and after, and the new assertion failing with the old walk.
verify    — maker-checker: the walk decides document structure on untrusted input.
