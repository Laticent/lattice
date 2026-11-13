---
origin: 3101
priority: P3
recorded: 2026-11-10
area: website
severity: low
swimlane: engineering/decisions/2026-11-09-steps-as-a-behavior.md §4
deferred: large — the Print drawer's desktop path prints the vector deck through the browser from a sanitized srcdoc (a HARD RULE #22 preview-builder sink), so a page per step there means expanding inside that frame, and the drawer's live preview, n-up layout, handout notes and raster cache all key on one page per slide
source: https://github.com/Laticent/lattice/pull/3101
---

# "One page per step" in the Studio's Print drawer

why now   — PR #3101 built the page-per-step export: `--steps` on the CLI (PDF, PowerPoint, LibreOffice, images) and a
            switch in the Studio's PDF, PowerPoint, LibreOffice and image-set sheets. The Print drawer is the one Studio
            export that does not offer it, so a deck printed from the drawer always prints each stepping slide once, at
            rest, while the same deck through Share → PDF can print a page per step.
where     — docs/src/components/studio/PrintOptionsPanel.tsx: the desktop path (`printDoc`, through `buildSrcdoc` and
            `printHtmlDoc`), the raster path (`buildPdf`, through deck-export.js `rasterizeDeckImages` and
            `assembleSheetPdf`), the preview's section list, and `imgCache`'s key. The raster path already expands when
            its render carries `steps` (deck-export.js `createCaptureFrame`); the desktop path does not run the kernel.
done when — the drawer offers "One page per step" on a deck that steps (export-options.ts `deckSteps`), and both its
            paths print one page per step with each page keeping its slide's page number; the handout prints each
            slide's notes under each of its pages; the preview shows the pages; a cached raster set is never reused
            across the switch.
evidence  — the e2e pattern in docs/e2e/export-steps.spec.ts, extended to the drawer's Download PDF.
verify    — a printed PDF of examples/build.md from the drawer, desktop and the raster path, dark and light, to the
            owner (an export-bytes change).
