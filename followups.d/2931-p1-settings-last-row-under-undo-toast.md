---
origin: 2931
priority: P1
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md
source: https://github.com/Laticent/lattice/pull/2931
---

# The Undo toast covers the last Settings row at phone width

Found while fixing `deck-register-gap.spec.ts` @crosswidth on #2931. At 390px, every
Settings write raises a 6-second Undo toast (`ACTION_DURATION`, `docs/src/lib/notify.ts`)
at the bottom center. In Deck ▸ Look it sits on **Fit**, the last row of the tab, and the
sheet cannot scroll that row any higher, so the row cannot be tapped until the toast goes.
Under a resting mouse pointer, Sonner holds the toast for as long as the pointer stays.

```text
  P1 · The Undo toast covers the last Settings row at phone width
       why now   — a phone user who changes Card rows waits 6 s before they can change Fit
       where     — the Settings sheet's scroll body (StudioShell / the Inspector panel);
                   docs/src/components/ui/sonner.tsx
       done when — the last row of every Settings tab can scroll clear of a live toast
                   at 390px (bottom padding the height of the toast lane, or the toast
                   lifts above the sheet), and deck-register-gap.spec.ts's `tap` helper
                   no longer needs its wait
       evidence  — tools/screenshot.js at 390 with a toast up, plus the spec without the wait
       verify    — tier 1, because it is a shared panel
```
