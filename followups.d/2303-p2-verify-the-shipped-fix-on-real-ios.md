---
origin: 2303
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2303#issuecomment-5776537591
backfill: true
---

# Verify the shipped fix on real iOS Safari

Backfilled verbatim from the continuation brief on #2303 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Verify the shipped fix on real iOS Safari
       why now   — iOS is named in the shipped changelog and gotchas copy and was
                   never driven; it is the one claim in #2303 marked UNVERIFIED.
       where     — the deployed docs preview's Playground
                   (https://claude-issue-2297-klcq99.lattice-docs-5ji.pages.dev/playground/?c=gantt
                   or the equivalent on a fresh branch). Desktop WebKit measured
                   every gantt bar caption at 0.63px from its bar's vertical centre
                   on a 26.1px bar — reproduce that on a real device.
       done when — a real iPhone (hardware or device cloud) shows gantt captions
                   centred in their bars, not riding the top edge.
       evidence  — a photo or device-cloud screenshot from the actual device.
                   Emulation does NOT count (#23).
       verify    — tier 0. It is a read-only observation, not a change.
       NOTE      — if no device is reachable, say UNVERIFIED and move on. Do not
                   substitute emulation and call it verified.
```
