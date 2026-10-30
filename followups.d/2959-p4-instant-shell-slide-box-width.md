---
origin: 2959
priority: P4
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/development.md §Studio e2e suite
deferred: off-path — fails identically on main's own build (695856b), so PR 2959 did not cause it
source: https://github.com/Laticent/lattice/pull/2959
---

# The instant shell's slide box is 3-4 px narrower than the app's at two desktop shapes

```text
  P4 · [no ticket] e2e/studio-instant-shell.spec.ts fails "slide box width" at two shapes
       why now   — on a local build of main at 695856b (2026-10-29), desktop project:
                     1440x900 @ write (editor collapsed to its 46px rail): shell 1207 vs app 1211
                     390x844 @ write (rotated while the engine was still loading): shell 301 vs app 304
                   tolerance is 2 px. PR 2959's branch fails the same two with the same numbers.
       where     — docs/src/components/studio/StudioChromeSkeleton.tsx vs the app's slide strip
                   (#2965 changed the strip)
       done when — both shapes within the 2 px tolerance.
       evidence  — the spec green on the desktop project.
       verify    — tier 0 gates.
```
