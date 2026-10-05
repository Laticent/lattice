---
origin: 2512
priority: P1
recorded: 2026-10-05
source: engineering/decisions/2026-10-05-trama-radial-layout.md
---

# Build Trama's radial layout and move hub-spoke onto it

why now   — the owner decided on 2026-10-05 (#2512) that every node-and-line chart runs on Trama, and that Trama stays blind to what it lays out. Hub-spoke is the one graph chart still holding its own geometry.
where     — `docs/src/lib/trama/` (new radial kernel code), `lib/components/chart/hub-spoke/hub-spoke.transform.js`, `lib/components/chart/_chart-family/arrowhead.js` (deleted). The split is the table in `engineering/decisions/2026-10-05-trama-radial-layout.md` §3.
done when — hub-spoke lays out through Trama's radial exports at build time, the moved code is deleted from hub-spoke, and every hub-spoke `<svg>` hash (demo deck, gallery, seeded fuzz, normal and sketch) matches its value from before the move.
evidence  — the before/after hash table; the Trama serialization test and `checkTramaBoundary` green.
verify    — tier 2: the adversarial trio (HARD RULE #25), shared library.
