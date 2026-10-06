---
origin: 2550
priority: P4
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2550
---

# Trama: attribute the live pin's line breaks to a real Studio flow, or drop them

```text
why now   — #2550 made the live pin carry a calmed pick's breaks (Geometry.breaks through
            docs/src/lib/trama/pipeline.ts) so a moved line break holds while typing. In the
            real Studio the stress deck's wizard held its 4/2 drawing while typing WITH and
            WITHOUT that change (a control run with the breaks removed), so the change is proven
            on the kernel only (1,576 pinned round-trips identical) and no real flow is known to
            reach it.
where     — docs/src/lib/trama/pipeline.ts (`held`, the Wrap pin, the live worker path);
            the probe shape: drive /studio/, type one key at a time, read each state's row.
done when — a per-key dump of `held` shows a flow that consults the pin with a moved break and
            draws it, or the pin change is removed as unreachable.
evidence  — the per-key `held` dump and the rows read from the real Studio.
verify    — tier 1 checker.
```
