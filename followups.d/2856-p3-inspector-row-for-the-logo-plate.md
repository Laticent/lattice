---
origin: 2856
priority: P3
recorded: 2026-10-22
area: website
severity: low
swimlane: engineering/decisions/2026-08-04-finish-stacking-displaces-frame-chrome.md
source: https://github.com/Laticent/lattice/pull/2856
---

# Add a Plate row to the Studio Inspector's Logo section.

```text
  P3 · [no ticket] Add a Plate row to the Studio Inspector's Logo section.
       why now   — #2856 made the plate an opt-in `logo-finish:` word; the Inspector still shows
                   Position, Color, Size and Show on, so the plate is front-matter or class only.
       where     — docs/src/components/studio/StudioShell.tsx (the Logo SettingsScope, the axis map);
                   LOGO_FINISH_AXES already carries the `plate` axis and its labels.
       done when — the Inspector offers No plate / Soft plate and writes the `plate` word.
       evidence  — tools/screenshot.js at 1440, 820 and 390 px (a UI change owes all three).
       verify    — docs vitest for logo-finish.ts, plus the Studio e2e for the Logo section.
```
