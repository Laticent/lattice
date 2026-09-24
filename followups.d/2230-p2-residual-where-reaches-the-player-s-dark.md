---
origin: 2230
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2230#issuecomment-5679323232
---

# Residual `:where()` reaches the player's dark block via `hoistRuleLightDark`, where a non-parsing engine would freeze the declaration light.

Backfilled verbatim from the continuation brief on #2230 (merged 2026-09-15).
Triaged 2026-09-24 against `main` at 6110a1e: still open. Also carries #2196 P4, the same item (deleted as a duplicate). `player-core.mjs` has not changed this behavior since #2196.

```text
  P2 · [no ticket] Residual `:where()` reaches the player's dark block via `hoistRuleLightDark`,
       where a non-parsing engine would freeze the declaration light.
       why now   — lowest impact and least certain of the two. Do not start before P1.
       where     — lib/export/player-core.mjs `hoistRuleLightDark` (see its DARK_SLIDE_ARMS
                   docblock). Count with `themeDualMode(dist/lattice.css).darkBlock` — it MOVES
                   WITH THE BUNDLE, so quote it with its base commit, never as a constant.
       done when — either the guard distinguishes authored from emitted `:where()`, or the
                   decision to leave it is written up as an engineering/decisions/ note.
       evidence  — the count before/after plus a real `--player` export opened in a browser.
       verify    — tier 1 checker. The naive fix is already known wrong — trap 5 above.

  ALSO OPEN, not prioritized: #2224 — the page numeral's ink sits 3.98px higher on a
  chrome-hosting frame than a sovereign one (one mark is centered in the footer band, the
  other pinned at the frame inset). Pre-existing, measured, and it needs the footer band's
  alignment policy re-decided (2026-07-27-footer-band-allocation.md), so it is a design call
  before it is a code change. Do not fold it into P1 or P2.
```
