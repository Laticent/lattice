---
origin: 3313
priority: P8
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 4
deferred: blocked — waits on the owner's go (D4)
source: https://github.com/Laticent/lattice/pull/3313
---

# Spike: author base.table-reflow.css with nesting, flattened by esbuild

why now   — selectors are about half the CSS, much of it repeated boilerplate (data-family clauses, the figure arm, the reflow guard). esbuild already lowers nesting for target chrome91.
where     — lib/base/base.table-reflow.css; the CSS build lowers it so every shipped file stays flat for Marp.
done when — 0 differing elements on every deck, marp-cli and VS Code preview renders of the reflow examples match, and the source-size and specificity findings are written into the plan note.
evidence  — gate summary and the measured delta.
verify    — tier 1 checker, because lowering a nested selector list can change specificity.
