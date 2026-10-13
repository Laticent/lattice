---
origin: 2654
priority: P4
recorded: 2026-10-13
area: engine
severity: medium
swimlane: lib/components/math/math/math.docs.md
source: https://github.com/Laticent/lattice/pull/2654
---

# Run the family-conformance and overflow oracles on the legend-less math arm

why now   — #2654 gives a lone `math` equation the whole stage and the alignment modifiers; it was
            rendered and read at 16:9 and checked at portrait by a checker, but `check:family-conformance`
            crashed on a Chrome disconnect in the authoring sandbox, and the nightly oracles have not seen it.
where     — lib/components/math/math/math.styles.css (the no-legend arm); `npm run check:family-conformance`.
done when — the conformance and overflow oracles pass at landscape, portrait, story and mobile with the
            new arm, or the arm is adjusted until they do.
evidence  — the oracle output at each size.
verify    — tier 1; run on a machine where Chrome stays up, or read the first nightly after the merge.
