---
origin: 2689
priority: P2
recorded: 2026-10-14
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-06-goldens-bot-blessed.md
source: https://github.com/Laticent/lattice/pull/2689
---

# themes/palette-audit.pdf renders two ways from one commit

```text
  P2 · [no ticket] Make themes/palette-audit.pdf render the same bytes every time.
       why now   — it flips between "unchanged" and exactly 6.58% moved on the same
                   commit: two bless runs on 6592eaa saw one state each, and so did
                   10-10 and 10-11 on 3bea7eb. Once the bless auto-merges (step 4),
                   rule 2 (1%) holds back any night it happens to drift on, and a
                   night it merges blesses one state for the next night to flip from.
       where     — themes/palette-audit.md and whatever renders it; the drift montages
                   in the golden-bless artifacts of runs 37742439244 and 38032839661
                   show which page moves. tools/golden-bless-nights.mjs lists the nights.
       done when — the root cause is named (font load, a race in a chart or mermaid
                   render, a timestamp) and fixed, or the deck is excluded from the bless
                   with the reason recorded; three renders of one commit are identical.
       evidence  — three same-commit renders, byte- or pixel-identical (pixel-check).
       verify    — tier 0 if the cause is local to the deck; tier 1 if the fix touches
                   a shared render path.
```
