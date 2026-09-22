---
origin: 2250
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2250#issuecomment-5757366198
backfill: true
---

# Derive the portrait gantt band instead of inheriting landscape's ratio

Backfilled verbatim from the continuation brief on #2250 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P4 · [no ticket] Derive the portrait gantt band instead of inheriting landscape's ratio
       why now   — this is the named raise-path on #2250's pre-merge card, the one thing that
                   would have moved it from high to very high. GANTT_GEOM_TALL (barH 16,
                   rowGap 5, lanePadY 7) was set by applying landscape's 0.8, not by measuring
                   what portrait needs: the measured requirement was ~2.8 viewBox units and
                   the change spends 24. It FITS (68.7px headroom, ~10% of stage vs
                   landscape's 12%) — this is about the constant being justified, not broken.
       where     — lib/components/chart/gantt/gantt.transform.js GANTT_GEOM_TALL; the landscape
                   band's own derivation is in the comment above GANTT_GEOM. Note laneNameH
                   stayed 15u while everything else shrank, so non-bar chrome's share of a
                   portrait lane rose 29% -> 33% — decide whether that is intended.
       done when — the portrait band's comment states a measured margin the way landscape's
                   does, and check:chart-fit stays green at all three sizes.
       evidence  — the portrait probe measurement (stage vs svg height, headroom px and % of
                   stage) plus a rendered portrait gantt via SendUserFile.
       verify    — tier 1 checker, because unreviewed gantt geometry judgment was caught twice
                   by checkers on #2250 and both times it was real.
```
