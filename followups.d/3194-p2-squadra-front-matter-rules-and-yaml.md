---
origin: 3194
priority: P2
recorded: 2026-11-13
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-26-squadra-lint-library.md §6
deferred: blocked — the Segno P3 front-matter island (followups.d/3042-p1-segno-p3-the-remaining-islands.md), which changes export bytes and waits on the owner's sign-off
source: https://github.com/Laticent/lattice/pull/3194
---

# Move the front-matter deck rules to Squadra, and build the reference YAML language

why now   — Every near-mechanical rule that reads front matter waits on the deck pipeline's front-matter island, and so
            does Squadra's reference YAML language, whose first reader is that island.
where     — Rules: `autosplit-retired`, `caption-key-retired`, `paginate-unsupported-value`, `greeting-hardcoded-period`,
            `unknown-bookend-placeholder`, `unknown-fit`, `unknown-corners`, `retired-backdrop-key`, `retired-form-key`,
            `retired-form-token`, `stray-overflow-marker`, `stray-export-settings`, `unknown-debug-facet`,
            `lexicon-single-letter-key`. Language: `docs/src/lib/squadra/` (`./yaml`), and `fm-key` nodes in
            `lib/authoring/squadra/deck-language.js`.
done when — the island is on `main`, `lattice-deck` publishes `front-matter > fm-key` with name and value parts, and the
            listed rules run on Squadra with 0 differences in the migration diff.
evidence  — the migration-diff report.
verify    — tier 2, the adversarial trio: front-matter fixes can drop the block (PR #2947).
