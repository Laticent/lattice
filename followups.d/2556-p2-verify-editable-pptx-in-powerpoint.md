---
origin: 2556
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2556
---

# Verify the editable .pptx in PowerPoint itself

why now   — `--editable` .pptx and the Studio switch ship checked only in LibreOffice; PowerPoint's
            line-spacing model may place baselines differently, and PptxGenJS repeats `<a:pPr>`
            per run, which LibreOffice accepts and PowerPoint has never been asked about. The
            fonts are now embedded as EOT, which LibreOffice 26.8 reads; PowerPoint has not
            been asked about that either.
where     — docs/src/lib/calco/pptx.ts, layout.ts placeFrame (the baseline formula).
done when — a deck exported with `--editable` opens in desktop PowerPoint without a repair
            prompt, and its boxes sit on the picture's text within a few px on 3 decks.
first look — `lattice test/fixtures/calco/baseline-check.md check.pptx --editable`, open it in
            PowerPoint: the flat letters should stand on the red lines, as in LibreOffice 26.8.
measured  — the .pptx states line spacing as spcPct over the face's natural line (Google
            Slides spread exact spcPts ~26%). LibreOffice 26.8 then lands body text within
            0.5pt of Chrome. If PowerPoint measures a line as 1.2em, its lines run a few
            percent tight: check a multi-line card on gallery-jargon slide 12.
schema    — (2026-10-07) the file is now schema-valid: PptxGenJS's repeated `<a:pPr>`, the
            notes-master order and the phantom slide-master overrides are mended by `tidyPptx`
            (decision note §6). A repair prompt that remains is something the schema does
            not catch, most likely the EOT font parts.
evidence  — screenshots from PowerPoint side by side with the PDF of the same deck.
verify    — needs a machine with PowerPoint; the decision note §6 says UNVERIFIED until then.
