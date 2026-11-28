---
origin: 3593
priority: P3
recorded: 2026-11-28
area: website
severity: low
deferred: off-path — 13 other docs pages, and the fix is a design call: one shared wrap rule breaks code mid-word in tables that fit today
swimlane: docs/src/styles/lattice.css
source: https://github.com/Laticent/lattice/pull/3593
---

# Docs tables hide their right edge on a phone, with no cue that they scroll

```text
  P3 · [no ticket] decide how a docs table that is too wide reads on a phone
       why now   — #3593 fixed the two clipped tables on /reference/cli/ by changing the page's
                   content. A sweep of every Starlight page with a table, on the built site, found
                   more (measured 2026-11-28):
                     - 390px: 13 more pages, 28 tables. Each scrolls inside its own box with
                       13 to 382px hidden, and nothing shows that it scrolls. The page itself
                       never scrolls sideways. The worst are /spec/diagnostics/ (12 tables),
                       /guides/status/marks-in-layouts/ (7 columns) and /spec/ltt/.
                     - 820px: 7 tables clip, because the sidebar narrows the column.
                   Tried and rejected: `.sl-markdown-content :is(td,th) code { overflow-wrap:
                   anywhere }` fixes 24 of 30 at 390px, but it changes min-content sizing. Code
                   then breaks mid-word in 358 table cells at 1440px and 518 at 820px. Limited to
                   max-width 50rem, it still rewraps 35 tables at 390px that fit today.
       done when — the polish desk picks a pattern (a scroll cue, stacked rows, or content
                   changes per page) and no table at 390, 820 or 1440px hides text without a cue.
```
