---
origin: 2419
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2419
---

# authority-chain: the laptop `capacity.hard` of 6 is above the measured ceiling of 4.

Found while fixing the hall overlap (the card-tag follow-ups PR). `main` at f73625a
measures the same, so this change did not cause it.

```text
  P3 · [no ticket] authority-chain capacity.hard 6 exceeds the measured ceiling 4.
       why now   — `node tools/calibrate-capacity.js authority-chain --family wide --words 6`
                   (and `--words 14`) report "ceiling 4 · fails at 5", while the manifest
                   declares sweet 4 / soft 5 / hard 6. The gallery's six-tier slide fits only
                   because its rows carry a label and no gloss, which the probe's rows do not.
                   The trail variant also clips each column's citation at venue: hall
                   (gallery slide 4), a separate horizontal capacity.
       where     — lib/components/legal/authority-chain/authority-chain.manifest.json
                   `capacity`; the docs' "Three to five tiers" line.
       done when — capacity.soft/hard sit at or below what calibrate-capacity measures for
                   the shape the docs tell authors to write, or the docs name the shorter
                   row shape that holds six.
       evidence  — calibrate-capacity output before/after.
       verify    — tier 0 gates; it is one manifest and one doc.
```
