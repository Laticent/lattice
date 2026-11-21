---
origin: 3362
priority: P3
recorded: 2026-11-21
area: engine
severity: low
deferred: off-path — the topic track's Marp path; PR 3362 changes topic's coda claims only, and the track is missing on Marp with the runtime loaded
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# A topic slide's `_track:` row does not draw in a Marp-rendered deck

```text
  P3 · [no ticket] draw the topic track on Marp
       why now   — on the 41-slide board deck, `<!-- _track: Cost to win | Lifetime
                   value | [Payback] | The assumptions -->` draws its tab row in the
                   Lattice PDF and is absent from both the copy-and-go kit and an
                   Export-to-Marp bundle through real `marp --pdf` (marp-cli 4.5.1,
                   runtime loaded). The track text does reach Marp's HTML, and the
                   kit runtime bundles lib/transformers/topic-track.js, so the gap is
                   between the two (measured 2026-11-21).
       done when — the track row renders on both Marp surfaces, or the kit README
                   says topic tracks are engine-only.
```
