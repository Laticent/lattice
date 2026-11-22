---
origin: 3249
priority: P4
recorded: 2026-11-16
area: docs
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — the cap is shared by every generated gallery; recalibrating it per venue repaginates all of them and needs its own sweep, golden review and decision note
source: https://github.com/Laticent/lattice/pull/3249
---

# The anti-pattern card's word cap is calibrated at design size, not at hall

why now   — closing 3226-p4 (divider s6 at hall) found the cause is a card length the generator allows: at a hall venue the structural split gives each anti-pattern card a page of its own, and a 58-word card (inside the 60-word three-across cap) still overflowed that page by 38px at square and 208px at story.
where     — tools/build-component-docs.js (`ANTI_PATTERN_WORD_CAPS`, `antiPatternPages`), and the manifests' `antiPatterns[].body`.
done when — every generated gallery's anti-pattern slide fits at hall on square, portrait and story, either by a venue-aware cap that the generator and an audit both enforce, or by shortening the long cards; the fit baseline shows no anti-pattern page clipped at hall.
evidence  — across all manifests, 106 of 250 anti-pattern cards run over 30 words and 17 over 45 (closing 46, title 47, topic 53, pricing 57, kpi 64, checklist 57, logo-wall 58, …). Divider's card fit only at about 22 words at portrait@hall.
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues hall --packs none --edits none --ratchet test/fit/baseline.json` over the component galleries, reading the anti-pattern slides' pages.
