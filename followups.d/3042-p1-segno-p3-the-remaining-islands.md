---
origin: 3042
priority: P1
recorded: 2026-11-05
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 landed: the directive island
deferred: large — four separate moves, two of them export-bytes changes that need the owner's sign-off (the front-matter split and the Mermaid matcher), each held to the corpus on its own
source: https://github.com/Laticent/lattice/pull/3042
---

# Segno P3: the islands the directive island left

why now   — P3's directive island moved `scanMetaSource` onto the deck model; four readers still find comments,
            front matter and fences with their own scans.
where     — lib/core/meta-record.mjs `comments()` and its callers (docs/src/lib/slide-directives.ts, lib/core/meta-edit.mjs,
            `hasMarker`); lib/engine/directives.js `parseFrontMatter`; lib/plugins/mermaid/shared/mermaid-fences.js;
            about 17 comment scans in lib/authoring/lint-core.js; and comment content from S1 so `unprefixed` in
            lib/core/directive-island.mjs can go.
done when — each reads the model's ranges, lint and render byte-identical on the corpus (`npm run identity:check -- --strict`).
evidence  — the identity check per move; the engine differential in test/unit/core/directive-island.test.js.
verify    — tier 2, maker-checker per move; the two export moves get the owner's sign-off on dark and light renders.
