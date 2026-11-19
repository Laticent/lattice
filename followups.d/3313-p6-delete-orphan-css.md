---
origin: 3313
priority: P6
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §2
deferred: blocked — waits on the rule-level audit (3313-p3) to confirm each rule is dead
source: https://github.com/Laticent/lattice/pull/3313
---

# Delete the CSS rules the real usage audit proves dead

why now   — the first real deletion; it proves the audit end to end before larger cuts.
where     — whatever 3313-p3 proves dead, and nothing else. The provisional run's four candidates are all live: graph-callout-marker/-detail are built by noteItem() in lib/plugins/chart-family/shared/callout-place.js, split-cover-table by lib/core/split-envelope.js, and inv-rows sits only inside :not() in live inventory rules. A dead-rule audit must count class names code builds from templates, not only deck text. Precondition: guard G4 in the plan note §3 (Guards from the adversarial review).
done when — the computed-style gate (the tools/style-loader-gate.mjs method) shows 0 differing elements on every deck.
evidence  — the gate summary attached to the PR.
verify    — tier 0 gates plus the computed-style gate, because it is a deletion with a byte-level proof.
