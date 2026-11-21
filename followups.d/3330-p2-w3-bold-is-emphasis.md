---
origin: 3330
priority: P2
recorded: 2026-11-20
area: engine
severity: high
swimlane: engineering/decisions/2026-11-19-deterministic-authoring-audit.md §W3 — Bold is emphasis, never structure (R4)
source: https://github.com/Laticent/lattice/pull/3330
deferred: large — W3 is a second engine-wide change (a label element, about 12 layouts' CSS and JS readers, a codemod, its own render probe); #3330 shipped W2 and handed W3 to a fresh session
---

# W3: bold is emphasis, never structure (R4)

```text
  P2 · W3: bold is emphasis, never structure
       ref       — audit note: W3, Finding 2 (the R4 bullets)
       why now   — bold splits titles in 12 layouts; W2 (#3330) settled the list markers,
                   so bold is the last per-layout reading of the Markdown left in Finding 2
       where     — lib/core/slot-label-lift.js + plugins.js slotLabelLift (wrap the label in
                   <span class="lat-label">, never <strong>); the 8 manifests with
                   inlineRun.slots ["strong"]; card-tag-equalize; CSS keyed on `li > strong`
                   (inventory, citation-card, q-and-a, statute-stack, math theorem, kpi,
                   cards-grid/stack, decision, compare-prose); JS readers relationship.js:1058,
                   carousel.js:47-58, prose-projection.mjs:1621/1999, plugins.js glossary term
       done when — a bold lead renders as emphasis on every layout: no title split, no
                   hidden item, no value carved out of a run; layouts that taught bold as a
                   title (inventory, citation-card, matrix-2x2, verdict-grid, redline,
                   statute-stack, q-and-a, math) teach nesting or a heading
       evidence  — bold probe: every gallery list slide rendered with its leads bold and
                   plain, strong weight neutralized, 0 structural diffs (the audit's method,
                   b-list-and-bold.md); before/after table in the PR
       verify    — Breaking changelog (owner decision 2: hard break, no transition release);
                   a codemod rewrites `- **Title.** body` and `- **Title.**` + nested body to
                   `- Title` + nested body across the repo's decks; demo deck owed (#9)
       note      — the W2 swap probe scripts can be reused for the bold probe: they live in
                   the audit note's method and in #3330's PR body
```
