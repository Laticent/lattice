---
origin: 3194
priority: P1
recorded: 2026-11-13
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-26-squadra-lint-library.md §6
deferred: blocked — the Studio lint-core size budget (lintCoreGz) decision on PR #3194; no rule should ride on a budget the owner has not approved
source: https://github.com/Laticent/lattice/pull/3194
---

# Move the remaining near-mechanical deck rules (without front matter) to Squadra

why now   — M1b's first slice moved two rules (`tag-alias`, `say-key-case`) and built everything the rest need: the
            language, the legacy-shape adapter and the per-rule migration diff. The census counts about 23
            near-mechanical rules; those that read front matter wait on the item below.
where     — `lib/authoring/rules/`; each rule's detector out of `lib/authoring/lint-core.js`, a frozen copy into
            `tools/squadra/legacy-detectors.js`, its bad patterns into `PATTERNS` in `tools/squadra-migration-diff.js`.
            Candidates: `callout-spelling`, `statement-ol-bold`, `block-unsupported`, `histogram-dash-range`,
            `ep-curve-point`, `bracket-list-closed-early`, `treatment-placement`, `conflicting-variants`, `track-directive`.
done when — each moved rule runs on Squadra, its lint-core detector is gone, and `npm run squadra:migration-diff` shows
            0 differences for it.
evidence  — the migration-diff report; lint-core's line count and rule-id count, both falling.
verify    — maker-checker per batch; tier 2 if the batch changes the adapter or the language.
