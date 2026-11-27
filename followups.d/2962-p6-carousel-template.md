---
origin: 2962
priority: P6
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §14, §16
deferred: large — the measured split is the default on every surface since 2026-11-06 (`fitPacks` in lib/core/resolve-fit.js); what is left is the carousel's packed pages reaching a judged 9, a design pass of its own
---

# Auto-split becomes a carousel: the packed pages reach the judged bar

why now   — the owner judged today's auto split bunk and set the carousel's rules (§14). The packing half is built on every surface and is the default (`fit: pack`, or no `fit:` line): a deck keeps a slide that fits whole and packs an overflowing slide by measured height in the CLI, the Studio's live preview, the Playground and the webpage export, through one measure, plan and verify loop (`lib/core/fit-measure.js`, `docs/src/lib/measured-split.ts`). The live preview keeps the §11 memory (rejoin at 30% spare, items kept on their pages, undo restores a slide's split) and packs fresh pages to 90%, which brings jank on split slides to 0.4% of ±10% edits. On the 94 galleries the measured split cuts pages by about a third and slides that lose content from 246 to 153, with no new clipped or unreadable slide (§16). What is left: an independent judge has scored the packed carousel 5 to 8 against a 9 target. The owner signs off the export bytes from `main` after #2988 merges.
where     — `fitClass`/`fitPacks` in lib/core/resolve-fit.js (the default), the demo decks, and the carousel's packed pages (lib/core/carousel.js, lib/core/split-envelope.js) for the judge's remaining defects.
done when — the fit ratchet is re-blessed from a runner; an independent judge scores the packed carousel 9 or higher.
evidence  — the demo deck's PDFs in a light theme and its dark variant; the fit ratchet diff; judged contact sheets.
verify    — node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --fit-packs knuth-plass; cd docs && npx playwright test e2e/measured-split.spec.ts
