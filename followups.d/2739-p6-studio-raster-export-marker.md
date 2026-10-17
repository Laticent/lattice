---
origin: 2739
priority: P6
recorded: 2026-10-16
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.8
source: https://github.com/Laticent/lattice/pull/2739
---

# Check whether the Studio's PDF, PNG and PowerPoint exports show a reader the authoring overflow marker

why now   — #2739 found the Studio's Webpage export baking in a capture frame with no export-settings block, so the runtime drew the AUTHOR marker (red ring, "OVERFLOWS", "Fix Me") into a file for a reader. The PDF, PNG and PowerPoint exports rasterize through the same `createCaptureFrame` and still pass no level.
where     — docs/src/components/studio/export/deck-export.js `createCaptureFrame` callers (the rasterizers); `buildSrcdoc`'s `exportSettings` option and `stripMarkerForLevel` are the mechanism the Webpage bake now uses.
done when — an overflowing deck exported from the Studio as PDF, PNG and PowerPoint shows the marker the export setting names (reader by default), asserted by an e2e test per format, or the note records why a format is exempt.
evidence  — a rendered page of each format for an overflowing deck, before and after.
verify    — tier 1 checker; the change alters export bytes, so it stops for the owner's export sign-off.
