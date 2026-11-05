---
origin: 3042
priority: P1
recorded: 2026-11-05
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 landed: the directive island
deferred: blocked — the two moves left that change export bytes (the front-matter split, the Mermaid matcher) wait for the owner's sign-off on dark and light renders; the remaining lint-core comment scans are large, one rule at a time
source: https://github.com/Laticent/lattice/pull/3042
---

# Segno P3: the islands still left

why now   — the comment content (S1), `commentBlocks` for the directive editors and the track rule moved onto the deck
            model (engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 islands). Three readers still find
            front matter, fences and comments with their own scans.
where     — lib/engine/directives.js `parseFrontMatter` (export bytes: a BOM-led deck's front matter);
            lib/plugins/mermaid/shared/mermaid-fences.js (export bytes: a fence inside an HTML block);
            about 16 comment scans in lib/authoring/lint-core.js, some of which read the rendered body on purpose.
done when — each reads the model's ranges, lint and render byte-identical on the corpus (`npm run identity:check -- --strict`).
evidence  — the identity check per move.
verify    — tier 2, maker-checker per move; the two export moves get the owner's sign-off on dark and light renders.
