---
origin: 2962
priority: P6
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §14, §16
deferred: large — the measured split ships in the CLI behind --fit-pack (§16); the Studio and Playground preview still split structurally and need the same measure, pack and verify path in the preview frame plus the §11 memory, and making it the export default is an export-bytes change that waits on the owner's dark and light sign-off
---

# Auto-split becomes a carousel: the packing half, on every surface

why now   — the owner judged today's auto split bunk and set the carousel's rules (§14). The presentation half shipped in that PR. The packing half is built in the CLI, opt-in: `--fit-pack knuth-plass` renders the deck whole, keeps a slide that fits whole, packs an overflowing slide by measured height, and verifies every body page against the shared fit verdict (`lib/core/fit-measure.js`), falling back to today's split for a slide it cannot place. On the 94 galleries at six box-venue cells it cuts pages from 18,066 to about 12,600, slides that lose content from 246 to 153, and adds no clipped or unreadable slide (§16). An independent judge scored it 5 to 8 against today's 3. Two things keep it from being the default: (1) the Studio and Playground split in `splitForPreview` with no measurement, so turning it on in the CLI alone would make one deck split two ways (HARD RULE #1); (2) a stateless pack janks 11 to 12% under ±10% edits, which a live editor must not show, so the preview owes the §11 memory (the split decision on the undo stack, rejoin at 30% spare, members-per-page kept while they fit). Owner rulings kept for that work: no navigation control on content pages, the key insight keeps its callout styling, keep the vertical timeline and vertical cycle with the cycle drawing its return to step 1.
where     — the preview frame's render (lib/playground/index.js `splitForPreview`, docs/src/lib/playground-engine.ts, single-slide-render.ts, share-export.ts): measure in the frame with `measureFit`, plan with `@laticent/fluido` `pack`, split with `splitDoc(..., { plan })`, verify with `overflowBySlide`; the memory beside the Studio's undo stack; then flip the CLI default.
done when — the Studio, the Playground and the export split one deck identically with the measured plan on; live edits on the agenda, list-steps, cards-grid and checklist galleries jank at or under hysteresis-0-30's 3.5%; the owner signs off dark and light renders of a demo deck for the default flip; an independent judge scores the packed carousel 9 or higher.
evidence  — a Studio screen recording or screenshots at portrait and story beside the CLI export of the same deck; the harness jank table for the stateful arm; judged contact sheets in a light theme, its dark variant and a second theme.
verify    — node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --fit-packs knuth-plass
