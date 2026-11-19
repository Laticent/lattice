---
origin: 3313
priority: P3
recorded: 2026-11-19
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 0
deferred: large — extends the style-needs audit; needs the real build, which the planning session could not run
source: https://github.com/Laticent/lattice/pull/3313
---

# Re-take the plan's numbers: a rule-level CSS usage audit on the real build

why now   — every figure in the plan note is PROVISIONAL (taken with stubbed packages); Phase 2's deletions rest on this audit.
where     — tools/style-needs-audit.mjs: extend from "module needed" to "rule ever matched", with KaTeX, Mermaid and the CLI auto-split running for real; count decks per slide shape (tall, square, strip). Before calling a rule an orphan, grep lib/ for class names built from templates (`${prefix}-callout-marker`, `split-cover-${layoutName}`): the provisional run's four orphans were all of that kind.
done when — KaTeX and Mermaid rules report real hit counts, the plan note's §1 and §2 are rewritten from this run, and its PROVISIONAL banner is removed.
evidence  — the audit's output file attached to the PR.
verify    — tier 1 checker, because deletions rest on it.
