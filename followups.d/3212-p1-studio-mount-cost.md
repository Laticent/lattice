---
origin: 3212
priority: P1
recorded: 2026-11-15
area: website
severity: medium
swimlane: engineering/decisions/2026-11-15-studio-map-load-cost.md §5
deferred: large — the Studio island's own mount, a separate piece of work from the slide map
source: https://github.com/Laticent/lattice/pull/3212
---

# The Studio's own mount blocks for about 2 s at 4x CPU with the map closed

```text
  P1 · [no ticket] cut the Studio island's mount cost
       why now   — With the slide map closed, /studio/ still blocks ~2.0-2.6 s at 4x CPU
                   (`npm run perf:load` in docs/, CPU=4, map closed). One Lighthouse run's
                   breakdown: client.js (React) ~2.8 s total, unattributable ~2.9 s,
                   StudioIsland mount. #3212 took the map's frames off a returning load;
                   this is the next-largest lever and is untouched.
       where     — docs/src/pages/studio.astro (client:only StudioIsland),
                   docs/src/components/studio/StudioShell.tsx and its eager imports;
                   docs/route-budget.json studio eagerJsGz (608.0 KB at the 5f00534a merge, 49.6 KB over its soft target).
       done when — map-closed TBT at 4x CPU drops measurably (alternated against main's
                   build, median of 5+ pairs), with no route-budget growth.
       evidence  — npm run perf:load (CPU=4, map closed) before/after, alternated; a
                   Lighthouse bootup-time / long-task breakdown naming what moved.
       verify    — tier 1 (an independent checker): it touches the Studio shell every
                   reader loads.
```
