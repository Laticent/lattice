---
origin: 3183
priority: P4
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md §6
deferred: blocked — Markdown and Marp would re-encode photos under Smaller file, which changes exported bytes and waits for the owner's sign-off
source: https://github.com/Laticent/lattice/pull/3183
---

# Print, Markdown and the Marp bundle have no Smaller file / Original quality choice

why now   — The owner ruled (2026-11-13) that every export except .lattice offers the choice; PDF, PowerPoint, LibreOffice and
            the webpage have it (PicturesControl), the image set has its own controls, and these three copy the Library's
            stored files or slide pictures with no choice.
where     — docs/src/components/studio/PrintOptionsPanel.tsx, MarpOptionsPanel.tsx, the Markdown row in ShareSheet.tsx,
            bundlePhotos in deck-export.js; the CLI's --images for the same outputs.
done when — all three show the same Pictures control and honor it, on the Studio and the CLI, with Auto following `images:`.
evidence  — downloaded archives and print PDFs under both choices; the e2e on three engines.
verify    — tier 1 checker; the owner's export sign-off.
