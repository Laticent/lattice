---
origin: 2404
priority: P1
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2404
---

# Decide whether the committed PDFs are re-rendered through the shared writer

#2404 made the shared writer (`lib/core/pdf-compose`) the CLI's PDF export, but the committed
golden and demo PDFs (`examples/*.pdf`, the gallery PDFs) were still printed by Chrome. The
next rebuild of any deck will re-render its PDF through the new writer, one deck at a time,
unless this is done as one deliberate pass.

```text
  P1 · [followups.d/2404-p1-rerender-goldens-through-shared-writer.md] ask the owner, then act
       why now   — until decided, each PR that rebuilds a deck's PDF mixes writers in the tree,
                   and the golden-diff reports writer changes as that PR's drift.
       where     — the PDF rebuild step (npm run build; the pdf-rebuild pre-commit hook) and the
                   committed examples/*.pdf; engineering/pipeline.md §4a0.
       done when — the owner has chosen (a) re-render every committed PDF in one PR, or (b) leave
                   them to re-render as decks change; and that choice is carried out or recorded.
       evidence  — for (a): tools/pdf-writer-parity.mjs over the re-rendered set (0 errors, the
                   thin-line sweep reviewed) and a before/after page-count and size table.
       verify    — tier 0 gates, because the writer itself is already reviewed; the decision is
                   the owner's (it changes committed artifacts).
```
