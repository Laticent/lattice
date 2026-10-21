---
origin: 2824
priority: P2
recorded: 2026-10-21
area: imagery
severity: low
swimlane: lib/components/imagery/image/image.docs.md
source: https://github.com/Laticent/lattice/pull/2824
---

# A visual-review pass on the band and thin cards: a hazy `ink-dark` statement scrim edge and small spotlight band body text.

Both were noted as open on #2824's PR body.

```text
  P2 · [followups.d/2824-p2-visual-review-of-the-band-and-thin-cards.md]
       why now   — the band is new, and these are the two things a reviewer's eye lands on first.
       where     — lib/components/imagery/image/image.styles.css (band block, statement scrim);
                   examples/image-band.md slides with `ink-dark` and `spotlight band`.
       done when — whole slides at 1440/820/390 pass the engineering/visual-review.md rubric.
       evidence  — `tools/rasterize-for-review.sh` PNGs of examples/image-band.md via SendUserFile.
       verify    — tier 0 gates plus one reviewer agent, because it is CSS inside one component.
```
