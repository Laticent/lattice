---
origin: 2962
priority: P3
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §13
deferred: large — tier 2 (about 30 text components that clip), a column-label stamp for general tables, and a lint, each its own pass over many components
---

# Text-room reflow, after tier 1: tier 2, general tables, the lint, the remaining family rules

why now   — tier 1 is built (§13): the shared rule (`--col-min`, `--col-max`, `--fluid-cols` and three container-query thresholds at 34em, 23em and 17em of body text), and the 21 galleries the fit ratchet named unreadable at narrow boxes are at 0. What the owner's 2026-10-29 decisions still ask for:
            (1) tier 2, the text components that CLIP at narrow boxes rather than cram: redline, citation-card, policy-recommendation, code, split-panel, authority-chain's variants, decision, compare-prose, content, split-compare, verdict-grid, table, obligation-matrix, quote, big-number, stats, kpi, logo-wall, q-and-a, cards;
            (2) narrow TABLES in general: rows become label/value cards keeping column 1's header, tables of three rows or fewer transpose, authors may mark columns to drop first. statute-stack's `lane` and glossary have their own card form now, but a generic table needs each cell stamped with its column label (a transform), which nothing does today;
            (3) the lint that fails a multi-column component with no narrow form; today `test/unit/css/text-room-thresholds.test.js` pins the thresholds and the tier-1 components only;
            (4) the owner's condition that a component's family rules retire as it moves: math keeps 22 `data-family` selector lines on parts tier 1 did not touch (the default form, `feature`, `canvas`, `compare`, `derivation`, `stats`, and `matrix` outside its legend), and premise keeps its section-level family block, which a container query cannot replace (a container cannot query itself);
            (5) live surfaces re-plan only at Fluid's named size buckets: the opt-in fluid viewer's slide follows the window, so it can cross a threshold on a raw resize until Fluid's bucket watcher (2026-10-27-fluid-layout-library.md §4.4) lands.
where     — each component's `*.styles.css`; a cell-label stamp beside the table transform; tools/check-ownership.js for the lint.
done when — the tier-2 galleries' clip counts at portrait@hall and story@hall fall in the fit ratchet, a generic narrow table renders as label/value cards, the lint fails a multi-column component without a narrow form, and no component carries both a `data-family` column rule and a text-room rule for the same part.
evidence  — the ratchet diff in test/fit/baseline.json, a montage of one slide per layout at story@hall before and after, and a demo deck per layout change (HARD RULE #9).
verify    — npm run fit:harness -- --sizes square,portrait,story --venues laptop,hall --packs none --edits none --ratchet test/fit/baseline.json
