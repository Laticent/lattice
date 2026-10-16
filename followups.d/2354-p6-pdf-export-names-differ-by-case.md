---
origin: 2354
priority: P6
recorded: 2026-10-16
source: https://github.com/Laticent/lattice/pull/2354
---

# Share > PDF and Print deck name the same deck's PDF differently

why now   — Share > PDF saves `markdown-for-the-boardroom.pdf` (lowercased) while Print deck >
            Download PDF saves `Markdown-for-the-boardroom.pdf` (case kept). On Windows and macOS,
            whose file systems ignore case, the second save lands on the first file. Found on the
            owner's Ubuntu run of #2354; older than that PR.
where     — docs/src/components/studio/PrintOptionsPanel.tsx `pdfFilename` (keeps case) vs
            `safeName` in docs/src/components/studio/export/deck-export.js (lowercases).
done when — both exports derive the name through one helper, and Print deck's file says what it is
            (e.g. `<deck>-print.pdf`), so the two never collide.
evidence  — a unit test on the shared helper, plus both saves in the desktop app landing as two files.
verify    — tier 0 gates: a naming change inside the Studio, no shared kernel touched.
