---
origin: 2457
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# Portrait split-panel: the running footer has no width budget

Found while fixing the portrait pullquote footer's ink. Pre-existing on `main`. In portrait
the split-panel chrome budget (`split-panel.styles.css`, the block scoped
`:not([data-orientation="portrait"])`) does not apply, so the footer box spans the whole
frame. On a split page it runs under the k-of-N rail dots (`.lat-split-rail`, right: 12cqi)
and, when the caption is long, wraps to a second line instead of ending in an ellipsis. Seen
on a portrait `pullquote` with a 45-character footer: the last word sits under the dots.

```text
  P3 · Portrait split-panel footer overlaps the split rail and wraps
       why now   — the rail and the caption overprint on every long-footer portrait split page.
       where     — split-panel.styles.css chrome budget; base.modifiers.css `.lat-split-rail`.
       done when — a portrait split-panel footer holds one line and stops before the rail and
                   the page number, on split and unsplit pages.
       evidence  — a render of a portrait pullquote with a 60-character footer, before and after.
       verify    — tier 0: render and look; the overflow probe reports the cut.
```
