---
origin: 2436
priority: P1
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2436
---

# The shared PDF writer drops `text-decoration` and flattens a quadrant's fill

Found while checking the stale gallery PDF (followups.d/2436-p3-stale-baseline-pdfs.md): a fresh
CLI render of test/integration/baseline-decks/gallery.md, compared page by page with the committed
PDF and with a PNG render of the same deck (which shows the live layout), differs in two ways
that are not layout changes:

- **p.51, `compare-prose decision`**: the rejected option's tag ("BUY A VENDOR") loses its
  strikethrough. The HTML and the PNG render carry it (`text-decoration-line: line-through`, the
  rule in compare-prose.styles.css); only the PDF drops it. `lib/core/pdf-compose/read-slide.mjs`
  hides text from the background photo and redraws the glyphs as real text, and it never draws the
  decoration line. Every CLI PDF of a `rejected` or `decision` slide therefore shows a rejected
  option as if it were live, and so does any underline or strikethrough an author writes.
- **p.86, `quadrant`**: the four quadrant washes are visibly lighter and flatter than in the PNG
  render, which keeps the saturated corner gradient the committed PDF also shows.

```text
  P1 · [followups.d/2436-p1-pdf-writer-drops-text-decoration.md] draw text decorations in the PDF writer
       why now   — the strike carries meaning (a rejected option), and it is gone from every CLI PDF
                   since #2404 made the shared writer the CLI's export.
       where     — lib/core/pdf-compose/read-slide.mjs (text runs, and the SVG gradient path it
                   takes or refuses); tools/pdf-writer-parity.mjs to sweep the galleries.
       done when — a line-through / underline on any text reaches the PDF as a vector line in the
                   text's color, and the quadrant's washes match the PNG render; each with a test
                   that fails without the fix.
       evidence  — p.51 and p.86 of the gallery beside the PNG render, before and after; the parity
                   sweep's summary.
       verify    — tier 1 checker, and the owner's dark + light sign-off (it changes export bytes).
```

The two rebuilt PDFs were held back from the PR that found this, so the committed goldens do not
bake the defect in (and followups.d/2404-p1-rerender-goldens-through-shared-writer.md is still the
owner's call).
