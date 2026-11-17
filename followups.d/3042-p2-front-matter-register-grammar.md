---
origin: 3042
priority: P2
recorded: 2026-11-16
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §11 Step 3 landed
deferred: blocked — the owner decides whether a Segno register grammar replaces the hand-written front-matter key reader, or the island stands as its replacement; PR #3228 built the island by hand and did not weigh the grammar
source: https://github.com/Laticent/lattice/pull/3228
---

# The front-matter register grammar: build it, or record the island as its replacement

why now   — §5 of the 2026-11-13 plan, the Squadra design (design.md row "Front matter") and the Segno pipeline's S3 all
            say front matter is read through "the register grammar", a Segno-generated parser like flowchart-row,
            list-text, css-ref and html-ref. PR #3228 built the front-matter island by hand instead (a regex fence on
            S0 text, lib/core/front-matter-fence.mjs, and a line loop, lib/core/front-matter-keys.mjs), equal byte for
            byte to the engine's old reading, without weighing the grammar. The docs now say so; the choice is open.
where     — tools/build-segno-grammar.js (the generator), lib/core/front-matter-keys.mjs (`frontMatterKeys`, the reader
            a grammar would replace), the `fm-key` contract in lib/authoring/squadra/lattice-deck.js.
done when — the owner has chosen. If the grammar: it is generated into lib/core, `frontMatterKeys` reads its tokens,
            the island's seeded differential (test/unit/core/front-matter-island.test.js) and `npm run identity:check
            -- --strict` stay green, and the route budget holds. If the island stands: §5, design.md and the Segno
            doc's S3 say the island replaces the grammar, and this file is deleted.
evidence  — the owner's answer; for the grammar, the differential and the identity check.
verify    — tier 2, maker-checker, if the grammar is built; none for a docs-only answer.
