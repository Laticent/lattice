---
origin: 2504
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2504
---

# Icons phase 3: Studio autocomplete and an icon picker

why now   — the vocabulary ships with the linter already (icons.vocab.generated.js), so the
            Studio can offer names without loading the drawings (inline-icons note § 10).
where     — lib/authoring/lint-core.js `inlineCodeCompletions` (a `^{` span and a pill's `icon=`),
            the Studio editor's completion source, a picker that loads lattice-plugin-icons.js on open.
done when — typing `^{da` offers `database`, `dashboard`, `dataset`; the picker inserts `^{name}`
            or `icon=name`; neither loads the drawings until the picker opens.
evidence  — screenshots at 1440 / 820 / 390 (tools/screenshot.js).
verify    — tier 1 checker.
