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
