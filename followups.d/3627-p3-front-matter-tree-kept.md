---
origin: 3627
priority: P3
recorded: 2026-11-28
area: website
severity: low
deferred: off-path — a speed change, which owes `npm run bench` evidence (HARD RULE #19); #3627 fixes a flaky count, not a cost
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P4b, step one: CodeMirror reads the model (2026-11-27)
source: https://github.com/Laticent/lattice/pull/3627
---

# Keep the deck editor's front matter tree across keystrokes

why now   — `frontMatterTree` (docs/src/lib/deck-language/deck-language.ts) is built afresh on every parse, so
            CodeMirror's fragments never cover it and the front matter's YAML is parsed again on every keystroke.
            It is also why a parse that runs out of its 20 ms budget is cut at the YAML (offset 4 in the gallery)
            and the next slice parses every nested HTML region again. Found by #3627's checker.
where     — deck-language.ts `frontMatterTree` / `deckTree`.
done when — the front matter tree is kept while its text is unchanged, a test counts no YAML parse for a
            keystroke in the body, and the bench shows the per-keystroke cost before and after.
evidence  — that test with its failing arm; `npm run bench` before/after.
verify    — `cd docs && npx vitest run src/lib/deck-language`.
