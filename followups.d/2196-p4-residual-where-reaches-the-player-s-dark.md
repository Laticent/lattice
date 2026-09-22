---
origin: 2196
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2196#issuecomment-5673067175
backfill: true
---

# Residual `:where()` reaches the player's dark block via `hoistRuleLightDark`, where a non-parsing engine would freeze the declaration light.

Backfilled verbatim from the continuation brief on #2196 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P4 · [no ticket] Residual `:where()` reaches the player's dark block via
       `hoistRuleLightDark`, where a non-parsing engine would freeze the declaration light.
       why now   — lowest impact and least certain of the four. Do not start before P1-P3.
       where     — lib/export/player-core.mjs `hoistRuleLightDark`. Count with
                   `themeDualMode(dist/lattice.css).darkBlock` — it MOVES WITH THE BUNDLE
                   (55 on the #2196 branch), so quote it with its base, never as a
                   constant.
       done when — either the guard distinguishes authored from emitted `:where()`, or the
                   decision to leave it is written up as an engineering/decisions/ note.
       evidence  — the count before/after plus a real `--player` export opened in a
                   browser.
       verify    — tier 1 checker. The naive fix is already known wrong — trap 4 above.
```
