---
origin: 3533
priority: P4
recorded: 2026-11-27
area: website
severity: low
swimlane: engineering/development.md
deferred: off-path — the shared dialog title style in docs/src/components/ui/dialog.tsx, used by every Studio dialog, not the ledger this PR changed
source: https://github.com/Laticent/lattice/pull/3579
---

# The dialog title's word space nearly closes in Playfair Display

```text
  P4 · [no ticket] give dialog titles a word space that reads as one
       why now   — PR 3579's ledger screenshots show "Show work" reading as "Showwork". The
                   source text has the space. Measured in the built Studio at 1440px: the title
                   is Playfair Display at 18px with letter-spacing -0.36px, and its space glyph
                   is 4px wide, so the gap between words is about 3.6px, close to the gap
                   between letters.
       where     — DialogTitle / SheetTitle in docs/src/components/ui/dialog.tsx (font-heading
                   with the heading tracking).
       done when — dialog titles set word-spacing (or drop the negative tracking at this size)
                   so a two-word title reads as two words, checked at desktop, tablet, mobile.
       evidence  — tools/screenshot.js of one dialog at all three widths, before and after.
       verify    — tier 1 self-review.
```
