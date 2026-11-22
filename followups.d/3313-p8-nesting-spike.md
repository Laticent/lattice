---
origin: 3313
priority: P8
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 4
deferred: off-path — the owner said go (D4, 2026-11-19); it runs as its own PR from main, not in #3313
source: https://github.com/Laticent/lattice/pull/3313
---

# Spike: author base.table-reflow.css with nesting, flattened by esbuild

why now   — selectors are about half the CSS, much of it repeated boilerplate (data-family clauses, the figure arm, the reflow guard). esbuild already lowers nesting for target chrome91.
where     — lib/base/base.table-reflow.css; the CSS build lowers it so every shipped file stays flat for Marp. Precondition: guard G6 in the plan note §3 (Guards from the adversarial review).
done when — 0 differing elements on every deck, marp-cli and VS Code preview renders of the reflow examples match, and a table compares flat (today), nested and any other candidate on source bytes and repetition, shipped bytes (min + gzip), build time and specificity, written into the plan note so 4.2 can be decided on it.
evidence  — gate summary and the measured delta.
verify    — tier 1 checker, because lowering a nested selector list can change specificity.
