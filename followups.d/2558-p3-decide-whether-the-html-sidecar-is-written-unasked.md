---
origin: 2558
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# Decide whether the CLI should write the `.html` sidecar when nobody asked for one

why now   — #2558's P1 decided a plain `.html` keeps the deck's raw HTML live by design and made the CLI
            warn (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 10). The inversion
            pass's strongest point stands: every PDF, PPTX and PNG export also leaves a live `deck.html`
            the author never asked for, and it can travel with the PDF.
where     — lattice-emulator.js `outHtml` (written for every format; the raster loads it from disk);
            the CLI help's "For every format EXCEPT .html, an HTML sidecar is written alongside".
done when — the owner picks: keep the sidecar (the warning stays the guard), write it to a temp path and
            delete it after the raster unless `--keep-html` asks, or keep it but sanitized. Changing the
            default changes what every export leaves on disk, so the number of files is the owner's call.
evidence  — the files an export leaves, before and after; a script that read the sidecar still finds it.
verify    — tier 1 checker.

measured  — 2026-10-07, for the owner's pick (no behavior changed yet):
            · what a PDF export leaves today: `node lattice-emulator.js deck.md out.pdf` → `out.pdf` and
              `out.html`, two files; the live-HTML warning fires only when the deck carries script.
            · who reads the sidecar: 46 files in the tree render through the emulator and then open the
              `.html` beside the PDF (17 in tools/, 22 under test/integration/, the rest in lib/ and
              test/helpers). Temp-and-delete breaks every one of them until each passes `--keep-html`.
            · sanitizing the sidecar BEFORE the raster changes the PDF of any deck whose script paints
              (design/skill.md § "Raw HTML in a deck"); sanitizing it AFTER the raster keeps the PDF and the
              file count, and changes only the sidecar of a deck that carries script.
options   — (a) keep, the warning is the guard: no change, nothing breaks.
            (b) temp-and-delete, `--keep-html` to keep: one file fewer per export; 46 callers to update.
            (c) keep but sanitize after the raster (the `--player` sanitizer, no CSP rewrite): file count
                and PDF unchanged; the file that travels runs nothing. Recommended: it closes the travel
                risk at the lowest blast radius. UNVERIFIED: whether any of the 46 readers depends on a deck
                script having run in the sidecar; a deck with no script gets a byte-identical sidecar.

