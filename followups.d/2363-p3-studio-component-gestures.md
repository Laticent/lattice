---
origin: 2363
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2363
---

# The Present Guide points at nothing on six components, and only at the whole chart on two

Progress 2026-09-25 (#2371): the paraphrase tier took the fixture from 37 to 52 of 63, and the
corpus from 93.0% to 96.9% resolved (946 → 35 hides). Still open on the fixture: the 11 cues
that name nothing on their slide (they now hold or hide by design), and "870 reached a proposal,
and 214 signed", which names two funnel bands and so resolves to the whole figure.

why now   — the owner, testing a narrated board deck in the Studio after #2363: "some
            components lose gestures in the studio". The Guide is what a viewer follows while
            narration plays, and on this deck it hides for 26 of 63 sentences.
where     — docs/src/components/studio/present-guide.ts (the resolver tiers); each
            component's manifest `handles` and its `data-label` marks (`SANCTIONED_MARK_IDENTITY`
            in tools/check-ownership.js, the contract in
            lib/components/chart/chart-family.docs.md § Accessibility, and the vocabulary in
            engineering/decisions/2026-08-05-guide-gesture-vocabulary.md).
            Reproduce: `node tools/sweep-guide-gestures.mjs --deck test/fixtures/q3-board-review.md --misses`.
            Measured on main 98cb452 — 37 of 63 cues resolve:

            | slide | component     | result                                   |
            |-------|---------------|------------------------------------------|
            | 1     | title         | miss, 3 of 3 cues                        |
            | 4     | kpi           | miss, 4 cues                             |
            | 12    | compare-prose | miss, 5 of 5                             |
            | 13    | list-steps    | miss, 5 of 5                             |
            | 15    | decision      | miss, 6 of 6                             |
            | 16    | closing       | miss, 3 of 3                             |
            | 5     | waterfall     | whole figure only, 2 cues                |
            | 8     | funnel        | whole figure only, 5 of 5 (no mark has a `data-label`) |

            First confirm with the owner that this is the gesture loss they saw. If they meant
            INPUT gestures (touch, wheel, pinch) on a component in the Studio preview, that is a
            different defect: engineering/decisions/2026-08-10-input-verb-parity.md.
done when — on the fixture deck, every narrated sentence on those eight slides resolves to an
            element smaller than the slide, a funnel stage and a waterfall step each resolve to
            their own mark, and the sweep over the committed corpus resolves no fewer cues than
            before.
evidence  — the sweep's before/after on the fixture deck and on the corpus, plus live Present
            screenshots in the built Studio of the pointer on each of the eight slides.
verify    — tier 1 checker, because the resolver is shared by every deck's Guide.
