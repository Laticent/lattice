---
origin: 2758
priority: P1
recorded: 2026-10-18
area: website
severity: medium
swimlane: engineering/decisions/2026-09-27-plugin-system.md
source: https://github.com/Laticent/lattice/issues/2758
---

# Finish #2758: the off-fence notice's action, and the notice in every export that draws diagrams

why now   — #2776 shows the notice in Share → Webpage (the options panel before the export, the completion message after). The issue's acceptance also asks for an action that turns the plugin on, and the same notice in PDF, images, PowerPoint, the Marp bundle and print.
where     — docs/src/lib/off-fences.ts (the shared reader), docs/src/components/studio/{WebpageOptionsPanel,PdfOptionsPanel,MarpOptionsPanel,PrintOptionsPanel}.tsx and the completion messages in share-export.ts. The action needs a Studio way to admit a plugin the host narrowed: today a deck's `plugins:` list only adds (lib/plugins/deck-plugins.mjs) and PluginsSettings.tsx writes that list.
done when — each Studio export that draws diagrams shows the notice when a fence's plugin is off, its action writes the deck's `plugins:` list so the next export draws the diagram, and an e2e spec drives both arms through the real Share sheet for each panel.
evidence  — tools/screenshot.js of each panel with the notice, at 1440/820/390; the e2e spec.
verify    — tier 0 gates plus the screenshots: one notice component reused per panel.
