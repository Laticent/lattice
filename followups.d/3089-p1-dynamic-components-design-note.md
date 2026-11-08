---
origin: 3089
priority: P1
recorded: 2026-11-08
area: engine
severity: low
swimlane: engineering/decisions/2026-11-08-agenda-styles-and-autofill.md
deferred: blocked — the owner asked for the note after PR #3089 merges, since it generalizes that PR's fill model
source: https://github.com/Laticent/lattice/pull/3089
---

# Design note: "dynamic components", one contract for slides the deck writes

why now   — five components already take their content from the deck, each built on its own: the agenda (filled from
            dividers, this PR), the glossary (`glossary: auto` appends a slide), topic (its track reads sibling topic
            headings, lib/transformers/topic-track.js), divider (marker and `divider numbered`, lib/core/section-index.js)
            and `split-panel proof` (color from its place among proof slides). Each re-solved the same three problems: the
            one-slide preview cannot see the deck (DECK_DERIVED_FACTS), Export to Marp needs a live-DOM arm, and narration
            and Present must agree on the slide. The owner named the concept "dynamic components".
where     — engineering/decisions/ (a new note), on a fresh branch from main after #3089 merges.
done when — a decision note that defines a dynamic component (content read from the deck; the author places the slide;
            anything the author writes wins; settings through a front-matter register), inventories the five with how each
            meets or misses that contract, recommends moving the glossary to the agenda's fill model (an empty
            `_class: glossary` slide fills from the acronym definitions; `glossary: auto` becomes a shortcut that places one
            at the end, retiring the four `withoutAutoGlossary` trims), weighs a sources/references slide (needs a citation
            syntax the deck lacks today), and puts the choices to the owner in one round. No code in that PR.
evidence  — the comparison table and inventory in the owner conversation of 2026-11-08 on PR #3089.
verify    — the note exists, every component it names is checked against the code it cites, and the owner has picked.
