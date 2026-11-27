---
origin: 3430
priority: P2
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: blocked — each page already holds one card, the split's floor; what is left is capacity at hall type on a 1080×1350 box, which the fit model's spacing rescue or measured split (#2988) addresses, and neither is on main
source: https://github.com/Laticent/lattice/pull/3430
---

# statute-stack still overflows a few portrait pages at a hall venue

why now   — #3430 removed every header overlap and sideways cut. At portrait@hall the default card for INTERNATIONAL now wraps `GDPR Art. 8` under its label, and that page runs 61px over at the foot (slides 2, 8, 10, page 4), where on main it cut the citation sideways. The five-jurisdiction rail (slide 6, 15–127px), `lane` (slide 11, 81–106px) and the "When NOT to" page (slide 12) overflow at portrait@hall as they did on main.
where     — lib/components/legal/statute-stack/statute-stack.styles.css (card padding and the foot pill at hall), and the split that pages the slide.
done when — the statute-stack gallery has no clipped page at portrait@hall, and its fit-ratchet cell falls to 0.
evidence  — fit harness rows on #3430: portrait@hall slide 2 page 4 overflow 61px; slide 6 pages 2–4 overflow 127/127/15px.
verify    — `npm run fit:harness -- --sizes portrait --venues hall --packs none --edits none --only statute-stack --ratchet test/fit/baseline.json`
