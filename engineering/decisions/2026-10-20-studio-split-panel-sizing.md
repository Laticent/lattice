---
status: shipped
summary: >
  Studio docks opened at their minimum, the editor share drifted to 41%, and at 1100px desktop
  and 820px tablet every panel squeezed under its own floor. One contract in dock-layout.ts now
  sets every dock to min 280 / default 320 / max 480, the editor to 46% of the pair, and folds
  the editor to its rail when four columns cannot fit.
---

# Studio split panels: one size contract (2026-10-20)

**Decision.** `docs/src/components/studio/dock-layout.ts` owns every docked width and the
ideal layout of the group. All four docks (Settings, the Assistant slot, Library, the tablet
Inspector) are **min 280 / default 320 / max 480**. The editor takes **46%** of the
editor|preview pair, never under 300px. When the pair cannot fit at its minimums, docks
shrink toward 280 first; if that is not enough the editor folds to its 46px rail.

## What was measured (real Studio, Chromium, Craft stop, advanced settings)

| Window | Panels open | Before (px) | After (px) |
|---|---|---|---|
| 1100 | Settings + Chat | 256 / 197 / 296 / 296 (all under their mins) | 280 / 280 / 46 (rail) / 439 |
| 1280 | Settings + Chat | 260 / 200 / 302 / 462 | 312 / 312 / 300 / 301 |
| 1440 | Settings + Chat | 260 / 200 / 384 / 541 (41:59) | 320 / 320 / 343 / 402 (46:54) |
| 1920 | Settings + Chat | 260 / 200 / 620 / 785 | 320 / 320 / 564 / 661 |
| 2560 | Settings + Chat | 265 / 200 / 928 / 1117 | 320 / 320 / 858 / 1007 |
| 820 tablet | Inspector | 285 / 285 / 247 (all under mins) | 46 (rail) / 492 / 280 |
| 1024 tablet | Inspector | 334 / 428 / 260 | 323 / 379 / 320 |

## Causes

- Docks declared px defaults (296, 232) next to `46`/`54` percent defaults. The library
  normalizes the mix, so each dock fell to its minimum and the pair's share drifted.
- At 1100 and 820 the minimums summed past the group (1215 and 880), so the library squeezed
  every panel under its floor. The chat composer needs 196px with Regenerate showing and got
  197px minus borders at 1100: a 2px clip.
- The Library header's actions wrapper was `shrink-0`, so the 177px search field plus Import
  needed ~400px; Import clipped at the old 380 default.

## Why these numbers

- **280 min:** composer floor 196, Settings rows stop wrapping at 220; 280 leaves chat about
  32 characters per line. A judgment on top of those floors, not a measured minimum.
- **320 default:** Settings' natural width; Library header fits Import at 320 once the search field shrinks.
- **46%:** the existing `defaultPreviewFrac` complement, now held at every width.
- **Fold, not squeeze:** reuses the collapse-to-rail the split already has.

## Mechanics

`useResizableSplit({ freshLayout, onFoldedExpand })` applies the ideal layout to any panel set
with no saved layout, once the group holds the panel set the shell is rendering. A dragged
layout still wins on widths and persists per panel set, but a saved layout never outranks the
group's width: if the panels leave the pair no room, the fold applies and the saved widths stay
saved. The fold is not persisted or toasted as the person's collapse, and it reverses on the
next panel toggle or settled window resize that leaves room. Clicking "Expand editor" on a
folded editor closes the assistant panel (or the tablet Inspector) to make room, because the
library would otherwise refuse and the button would do nothing.

Not changed: the Playground split (280/320 at 45:55), and the pre-paint shell, which models
only the dock-free pair.
