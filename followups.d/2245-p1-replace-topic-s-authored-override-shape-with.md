---
origin: 2245
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2245#issuecomment-5754168975
backfill: true
---

# Replace topic's authored-override shape with a labelled directive

Backfilled verbatim from the continuation brief on #2245 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Replace topic's authored-override shape with a labelled directive
       why now   — an unlabelled markdown <ul> is both the data and the marker carrier, and
                   it is the root cause of roughly half the defects five review rounds found
                   on #2245: "is this <ul> the track?" and "which item is marked?". The track
                   is derived by default now, so that ambiguity is paid on every topic slide
                   to serve an override that almost never fires.
       where     — lib/transformers/topic-track.js (hasAuthoredList, markAuthored, whollyBold,
                   hasOnClass/withOnClass), the `track` slot in topic.manifest.json, and
                   CLOSED_BY_SIBLING in lib/core/top-level-h2.js, which exists only to parse
                   author list markup.
       done when — an override is an explicit directive, the marker machinery is deleted, and
                   every test in test/unit/transformers/topic-track.test.js passes or is
                   replaced by an equivalent on the new shape.
       evidence  — rendered PDF of examples/topic.md via SendUserFile, plus a Chromium
                   computed-style read showing the correct column lit on an overridden track.
                   "The tests pass" is NOT evidence here (#23) — the worst defect on #2245
                   passed a fully green suite.
       verify    — tier 1 checker, because it touches a shared render kernel on both the
                   string and DOM arms, and because every self-reviewed round of this work
                   shipped a defect the next round found.
```
