---
origin: 3599
priority: P1
recorded: 2026-11-28
area: website
severity: low
deferred: off-path — the language has no door for a re-parse on a plugin change yet, and math nodes are unstyled, so the stale window (until the next keystroke) draws nothing different
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P4b, step one: CodeMirror reads the model (2026-11-27)
source: https://github.com/Laticent/lattice/pull/3599
---

# Re-parse the deck editor's tree when plugin admission changes

why now   — `followDeckAdmission` runs inside the debounced linter (docs/src/components/studio/Editor.tsx),
            after CodeMirror has parsed the edit, so a deck whose admission turns math off is read with math
            on until the next keystroke, including on first open. Found by #3599's checker; not reproduced
            in a browser.
where     — Editor.tsx (`followDeckAdmission`), docs/src/lib/deck-language/deck-language.ts.
done when — a change in the admitted plugins asks the language for a re-parse, and a test opens a deck that
            turns math off and finds no `LatticeInline` node.
evidence  — that test, with its failing arm.
verify    — `cd docs && npx vitest run src/lib/deck-language`.
