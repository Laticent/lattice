---
origin: 3292
priority: P1
recorded: 2026-11-19
area: website
severity: medium
swimlane: engineering/decisions/2026-09-24-code-package-contract.md
deferred: blocked — owner decision: hold the first preview for the door (a later first paint) or teach the eager entry the plugin fences (route bytes)
source: https://github.com/Laticent/lattice/pull/3292
---

# On a reload, an approved plugin's block shows its fence source for a few frames

```text
  P1 · [no ticket] the Studio's first preview after a reload draws a plugin's fence as code
       why now   — #3292 removed the unstyled frame on reload (a render that began before the stamp
                   held the plugins now draws as the Studio did before the door held them). The
                   moment BEFORE the door loads was already there on main: the engine's own render
                   draws the fence as a code block until the door chunk arrives. Measured with a
                   parent-page per-frame watcher from the reloaded page's first frame, 4 workers:
                     main (merge base): code block median 0 / 5 / 0 frames (Chromium / WebKit / Gecko),
                                        p90 5 / 14 / 0, plus the unstyled badge in 8/20 and 7/20 runs
                     #3292:             code block median 3 / 6 / 0, p90 7 / 11 / 2, unstyled 0/120
                   Wrong-look frames per reload (code block + unstyled), mean: main 2.1 / 6.5 / 0.4,
                   #3292 3.0 / 5.9 / 0.7, within run-to-run noise.
       where     — StudioShell.tsx (`setPlugins(...).then(setCodeStamp)` on load); code-packages/entry.ts
                   (the eager fast path renders without the door); door.ts `withPlugins`.
       done when — after a reload with a plugin approved, no frame shows the fence source or the
                   unstyled block: the first frame with the block is the styled one, on Chromium,
                   WebKit and Gecko.
       evidence  — the per-frame watcher (plugin-slots.spec.ts `installBadgeWatch`) extended to
                   flag a code block, 40 reloads per engine.
       verify    — tier 1 checker.
```

The two ways in, for the owner to pick:

- **Hold the first preview** until the door holds the Library's plugins when the Library has any
  (StudioShell). No route bytes; the first preview paints later by the door chunk's load time for
  anyone with a plugin installed.
- **Teach the eager entry the plugin fences** (names only), so a fence the Library holds draws as a
  quiet reserved block, not code, before the door loads. Paints at once; costs eager bytes on the
  Studio route, which is 1.1 KB under its ceiling.
