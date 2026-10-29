---
origin: 2962
priority: P5
recorded: 2026-10-29
area: legal
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §12
deferred: off-path — statute-stack's chip row and topic's eyebrow layout; this PR changes tooling and docs only
---

# statute-stack's chips and topic's eyebrow draw text over text at hall

why now   — the readability probe's overlap check (#2962) found two pre-existing defects, both confirmed on the rendered pages:
            (1) statute-stack (lib/components/legal/statute-stack/statute-stack.gallery.md slides 3–5, split at square/hall): the citation chip runs under its status pill, so the citation "15 U.S.C. §6501" reads "15 U.: In effect since 2000" and "Cal. Civ. §1798.120" reads "Cal. Civ. §179 Enforced 2023";
            (2) topic (lib/components/anchor/topic/topic.gallery.md slide 3, whole at square/hall and story/hall): the slide's "Payback" label is drawn over the "SECTION 02 · UNIT ECONOMICS" eyebrow, and the basis line overprints the footer note.
            The baseline counts them as unreadable (statute-stack 3 at square@hall, topic 1 at each hall cell).
where     — lib/components/legal/statute-stack/statute-stack.styles.css (the chip row: the citation chip must shrink or wrap rather than slide under the pill) and lib/components/anchor/topic/topic.styles.css (the eyebrow and basis bands at a narrow box and large venue).
done when — neither slide draws text over text at square, portrait or story at hall, and the fit ratchet's unreadable counts for both galleries fall at those cells, banked with `--bless`.
evidence  — renders of the slides before and after, the ratchet diff in test/fit/baseline.json, and a demo deck (HARD RULE #9).
verify    — for g in statute-stack topic; do npm run fit:harness -- --only $g --sizes square,portrait,story --venues hall --packs none --edits none --ratchet test/fit/baseline.json; done
