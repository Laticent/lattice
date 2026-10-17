---
origin: 2354
priority: P5
recorded: 2026-10-16
area: website
severity: medium
swimlane: engineering/decisions/2026-09-24-lattice-studio-desktop.md §The Windows runner (2026-10-16)
source: https://github.com/Laticent/lattice/pull/2354
---

# Print deck to a printer comes out on Letter, with the browser's headers and footers

why now   — On a Windows runner, Print deck at 4-up opened the print dialog with Paper = Letter,
            Margins = Default and Headers and footers on, so each sheet carried the date, the
            window title and `tauri.localhost/studio/`. Edge 154 and Chrome on the same runner do
            the same to a plain page with `@page{size:5in 3in;margin:0}`, top-level or in an
            iframe, so this is how Chromium prints to a system printer, on the web as in the app.
            Older than #2354; the desktop app only made it visible.
where     — docs/src/components/studio/PrintOptionsPanel.tsx `printDoc` (its comment says desktop
            honors `@page`, true for Save as PDF only) and export/print-sheets.js `@page`.
done when — a printed deck carries no browser header or footer and fills the chosen paper, on a
            real printer destination; or the panel says plainly which dialog settings to change.
evidence  — the Windows print dialog screenshot on a real printer destination, before and after.
verify    — tier 1: a print-path change; show the owner the printed output (QUALITY BAR).
