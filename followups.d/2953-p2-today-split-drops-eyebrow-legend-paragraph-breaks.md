---
origin: 2953
priority: P2
recorded: 2026-10-28
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §7
---

# Today's structural split drops an eyebrow, a legend and paragraph breaks

why now   — the fit harness's corpus run found 41 slides that lose a text leaf at every split box (square, portrait, story). Read from the renders, three cases are real losses in today's builders, and the P2 hybrid inherits each one wherever it splits:
            (1) the compare-prose and compare-code splits drop the slide's eyebrow: in test/integration/baseline-decks/gallery.md, `Decision · Close Time` (slide 50), `Decision · Build vs Buy` (51), `Operations · Recalibration` (52) and `Decision Close-Time · Before vs After` (63) each appear 7 times in the whole render and 0 times in the split one, and `compare-code · stress` (lib/components/code/compare-code/compare-code.gallery.md slide 3) appears once whole and never split;
            (2) the obligation-matrix split drops its key (Regime, Applies, Partial) on lib/components/legal/obligation-matrix/obligation-matrix.gallery.md slide 7 (45 `Partial` labels whole, 40 split);
            (3) the content split joins the slide's two paragraphs into one `split-feat-lede` (lib/components/statement/content/content.gallery.md slide 3): the text survives, the paragraph break does not.
            One more case is by design and wants a yes from the owner rather than a fix: the row-to-card reshape drops column 1's header label (`Vendor`, `Regulation`, `Function`, `Criterion`, `Row`) on about 25 table, rows, columns and legal slides. Pane labels that move into the running head (compare-code) are not lost; the harness counts that head as chrome.
where     — lib/core/carousel.js and the split builders it calls: the compare-prose and content (split-feat) builders and the obligation-matrix recipe. The exact lines are not pinned yet.
done when — each of the slides above keeps its eyebrow, key and paragraph break when split; `npm run fit:harness -- --only <gallery> --sizes square --venues laptop` reports 0 lost for them on the structural arm.
evidence  — the harness's Lost column for those galleries before and after, and the split golden (`npm run split:golden:check`) re-blessed with the reason.
verify    — npm run build:check; npm test
