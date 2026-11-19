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
       why now   — #3292 removed the unstyled frame on reload: a render that began before the stamp
                   held the plugins shows the block as the engine drew it (door-run.ts `unstamped`).
                   The moment BEFORE the door loads was already on main: the engine draws the fence
                   as a code block until the door chunk arrives. Per-frame watcher from the reloaded
                   page's first frame, 20 reloads per engine, 4 workers (Chromium / WebKit / Gecko):
                     main (merge base): unstyled badge in 8 / 0 / 7 runs; frames showing the source
                                        or no fill per reload, mean 2.1 / 6.5 / 0.4 (sd 1.8 / 5.5 / 0.6)
                     #3292 (e388dbb):   unstyled in 0 / 0 / 0 runs; source frames per reload,
                                        mean 1.9 / 5.4 / 0.6 (sd 2.1 / 4.0 / 0.6)
                   So #3292 leaves the code-block moment where main had it; this item is that moment.
       where     — StudioShell.tsx (`setPlugins(...).then(setCodeStamp)` on load); code-packages/entry.ts
                   (the eager fast path renders without the door); door-run.ts `unstamped`.
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
