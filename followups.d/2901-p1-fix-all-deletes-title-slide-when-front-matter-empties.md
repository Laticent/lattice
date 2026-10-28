---
origin: 2901
priority: P1
recorded: 2026-10-26
area: engine
severity: high
swimlane: engineering/decisions/2026-10-26-squadra-lint-library/design.md §7.4
source: https://github.com/Laticent/lattice/pull/2901
---

# `lint:deck --fix` deletes the title slide when a fix empties the front matter

why now   — The adversarial red team on PR #2901 found it, and it reproduces on `main` (d73c9f4). It is a live
            defect in `lint:deck --fix` (the shared `applyFix`), independent of the Squadra design. The Studio's
            "Fix all" does not offer `retired-logo-key`, so it was not hit there (checked on a deployed preview).
            Fixed by PR #2947; delete this file when that merges.
found     — `applyAllFixes` (`lib/authoring/lint-core.js:2706`) on
            `---\nlogo-on: all\n---\n<!-- _class: title -->\n# Q3 Board Review\n\n---\n\n# Agenda\n`
            applies the `retired-logo-key` fix and leaves `---\n---\n…`. The empty front-matter block then
            reads to the next `---`, so the title slide becomes front matter. Rendered h1s go from
            `['Q3 Board Review', 'Agenda']` to `['Agenda']`, and lint afterwards reports nothing. Any fix that
            deletes the last front-matter key has the same shape.
where     — when a fix leaves the front matter with no keys, delete the whole `---`/`---` block (or keep a
            placeholder the engine reads as front matter). Pin it in the lint-core unit tests, for every rule
            whose fix can delete a front-matter key.
done when — fixing a deck whose only front-matter key is retired keeps every slide; a test asserts the
            rendered slide count before and after "Fix all" on that deck.
verify    — run `node tools/lint-deck.js --fix` on the reproduction above and render the file: the same h1s before and
            after (HARD RULE #23). PR #2947 carries that measurement.
