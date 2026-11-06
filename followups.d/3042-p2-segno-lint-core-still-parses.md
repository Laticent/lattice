---
origin: 3042
priority: P2
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §The editors install the deriver
deferred: blocked — the lint core keeps its own copy of the boundary reader by design, so it needs its own copy of the deriver: about 1.1 KB gzipped against `lintCoreGz`, which has 0.2 KB of room. Raising that ceiling is the owner's number; the default (owner, 2026-11-06, if silent) is to leave the lint as it is
source: https://github.com/Laticent/lattice/pull/3043
---

# The lint core still parses the deck from nothing on every keystroke

why now   — since PR 3046 the editors install the boundary memo's deriver (docs/src/lib/deck-outline/deck-outline.ts),
            which covers the outline, the slide split, the preview's sample and the class editor: a real Studio
            keystroke went from 59.5 full parses to 1.1. The lint core (esm/lint.js) is the one reader left. It holds its
            own copy of lib/core/slide-boundaries.mjs and of the boundary parser (tools/build-playground.js,
            `assertLintParserIsolated`), so the editors' install cannot reach it, and its comment scan still parses the
            deck from nothing once per keystroke (about 1 ms on a typical deck).
where     — tools/build-authoring-core.js (the lint entry), docs/route-budget.json `lintCoreGz`.
done when — the lint entry installs `deriveFromNearest` on its own copy, within a ceiling the owner sets, and a Studio
            keystroke counts 0 full parses of the whole deck from the lint.
evidence  — the route budget before and after; the lint's `deckModelStats.full` per keystroke in a browser run.
verify    — tier 2, maker-checker; a real Studio run (HARD RULE #23).
