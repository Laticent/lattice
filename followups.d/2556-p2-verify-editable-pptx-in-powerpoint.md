---
origin: 2556
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2556
---

# Verify the editable .pptx in PowerPoint itself

why now   — `--editable` .pptx and the Studio switch ship checked only in LibreOffice; PowerPoint's
            line-spacing model may place baselines differently, and PptxGenJS repeats `<a:pPr>`
            per run, which LibreOffice accepts and PowerPoint has never been asked about.
where     — docs/src/lib/calco/pptx.ts, layout.ts placeFrame (the baseline formula).
done when — a deck exported with `--editable` opens in desktop PowerPoint without a repair
            prompt, and its boxes sit on the picture's text within a few px on 3 decks.
evidence  — screenshots from PowerPoint side by side with the PDF of the same deck.
verify    — needs a machine with PowerPoint; the decision note §6 says UNVERIFIED until then.
