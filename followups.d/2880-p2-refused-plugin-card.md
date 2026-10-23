---
origin: 2880
priority: P2
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md
source: https://github.com/Laticent/lattice/pull/2880
---

# A Library plugin card can say "Approved in this browser" for a plugin the door will never run.

Found by the checker on #2880 and not reproduced. A plugin whose fence the door refuses (for example it collides with a shipped fence) can still hold a stored approval that matches its bytes, so the card reads "Approved" while `runnablePlugins()` filters the plugin out.

```text
  P2 · [no ticket] Make the Library card agree with what the door will actually run.
       why now   — the card is the one place a person checks a plugin's state; a green
                   "Approved" on a plugin that never draws is a small lie.
       where     — docs/src/components/studio/Library.tsx `renderPlugin` (the
                   `approved` line), docs/src/lib/code-packages/door.ts
                   `runnablePlugins`, `planFencePlugins`.
       done when — a refused plugin's card says why it will not run, not "Approved".
       evidence  — a unit test with a plugin whose fence collides with a shipped one,
                   plus a Studio screenshot of its card.
       verify    — tier 0 gates; Library-only and reversible.
```
