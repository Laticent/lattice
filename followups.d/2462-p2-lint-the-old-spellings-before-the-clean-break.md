---
origin: 2462
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2462
---

# Lint the old inline spellings before phase 2's clean break

why now   — #2462's inversion review: decision 9 is a clean break. The codemod reaches the
            238 shipped decks, but not decks in the Tauri app, user files, or text models
            learned from the old docs, and the old spelling fails SILENTLY: `{X}:a:b` still
            reads `{X}` as a valid record and drops the modifiers.
where     — lib/authoring/lint-core.js (HARD RULE #7); the old spellings listed in the Segno
            note's § What every current grammar becomes (`}:` after a record, `after:`,
            `:4`, `+120`, `approve =>`).
done when — `lint:deck` warns on each old spelling with an autofix to the new one, and the
            phase-2 PR ships it with the migration.
evidence  — a fixture deck with every old spelling, linted before and after.
verify    — tier 1; `npm run lint:deck` on the fixture.
