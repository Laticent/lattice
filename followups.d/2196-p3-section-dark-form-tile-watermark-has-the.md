---
origin: 2196
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2196#issuecomment-5673067175
---

# `section.dark.form .tile-watermark` has the identical class-vs-ground bug that #2196 just fixed for the deck logo.

Backfilled verbatim from the continuation brief on #2196 (merged 2026-09-15).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P3 · [no ticket] `section.dark.form .tile-watermark` has the identical class-vs-ground
       bug that #2196 just fixed for the deck logo.
       why now   — same root cause, now fully understood; leaving it means the fix is
                   knowingly half-applied. Off-path for #2196 under HARD RULE #18, not
                   disputed.
       where     — grep `tile-watermark` under lib/; mirror what #2196 did for
                   `--deck-logo-filter` in lib/base/base.modifiers.css.
       done when — the watermark derives from the resolved ground on all 14 canvases.
       evidence  — a rendered PDF via SendUserFile on a `-dark` theme deck carrying a tile
                   form. The contrast gate does NOT audit a watermark, so a contrast
                   number is not proof here — you have to look at it.
       verify    — tier 1 checker, same shared-token surface as #2196. FILE A CARD before
                   starting, or this is deferred past the next session and will be lost.
                   It is an EXPORT-BYTES change, so it stops for the owner's sign-off.
```
