---
origin: 2962
priority: P6
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §14, §16
deferred: blocked — the measured split ships on every surface behind `fit: pack` (§16); making it the default (`heal` gaining packing) changes exported bytes, which waits on the owner's dark and light sign-off
---

# Auto-split becomes a carousel: the measured split becomes the default

why now   — the owner judged today's auto split bunk and set the carousel's rules (§14). The packing half is built on every surface, opt-in: a deck with `fit: pack` keeps a slide that fits whole and packs an overflowing slide by measured height in the CLI, the Studio's live preview, the Playground and the webpage export, through one measure, plan and verify loop (`lib/core/fit-measure.js`, `docs/src/lib/measured-split.ts`). The live preview keeps the §11 memory (rejoin at 30% spare, items kept on their pages, undo restores a slide's split) and packs fresh pages to 90%, which brings jank on split slides to 0.4% of ±10% edits. On the 94 galleries the measured split cuts pages by about a third and slides that lose content from 246 to 153, with no new clipped or unreadable slide (§16). What is left: it is not the default, and an independent judge has scored it 5 to 8 against a 9 target.
where     — `fitClass`/`fitPacks` in lib/core/resolve-guards.js (the default), the demo decks, and the carousel's packed pages (lib/core/carousel.js, lib/core/split-envelope.js) for the judge's remaining defects.
done when — the owner signs off dark and light renders of a demo deck under the measured split; `heal` packs by default on every surface; the fit ratchet is re-blessed from a runner; an independent judge scores the packed carousel 9 or higher.
evidence  — the demo deck's PDFs in a light theme and its dark variant; the fit ratchet diff; judged contact sheets.
verify    — node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --fit-packs knuth-plass; cd docs && npx playwright test e2e/measured-split.spec.ts
