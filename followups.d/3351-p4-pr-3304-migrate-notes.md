---
origin: 3351
priority: P4
recorded: 2026-11-21
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-four-notes.md §5
deferred: blocked — PR 3304 belongs to another session (HARD RULE #31), and this one cannot message it
source: https://github.com/Laticent/lattice/pull/3395
---

# PR 3304's decks still use the old note forms

why now   — #3351 removed `say:`, `describe:`, `reader:` and plain-comment speaker notes with no
            alias, and test/unit/tools/no-old-note-forms.test.js fails any tracked file that still
            carries one. PR 3304 (the voice work) was opened before #3351 merged, so its decks will
            fail that guard, and their notes will reach nothing, until they are migrated.
where     — PR 3304's branch, owned by its own session.
done when — that session runs `lattice migrate notes <deck.md>` on each deck it adds or edits, and
            the guard is green on its head.
evidence  — no-old-note-forms.test.js green on PR 3304's head.
verify    — tier 0, that session's CI.
