---
origin: 3220
priority: P1
recorded: 2026-11-15
area: engine
severity: high
swimlane: engineering/decisions/2026-11-13-native-pptx-writer.md §How it is proven
deferred: blocked — no runner here or in the platform suites opens PowerPoint, Keynote or Google Slides; the owner's export sign-off is the next chance
source: https://github.com/Laticent/lattice/pull/3220
---

# Open Calco's native .pptx in PowerPoint, Keynote and Google Slides

why now   — PR #3220 replaced pptxgenjs with Calco's own writer on every .pptx path, the plain picture-per-slide
            file included, whose pptxgenjs bytes many readers had opened for years. The new bytes pass the ISO 29500
            schema, the Open XML SDK, LibreOffice 24.2 (round trip) and Apple's Office importer suite, but no real
            PowerPoint, Keynote or Google Slides has opened them. The design note calls a failed open or a repair
            prompt a blocker (§How it is proven 4).
where     — docs/src/lib/calco/pptx.ts (the package), lib/export/pptx-export.js (the plain .pptx). Likeliest triggers,
            which no schema check catches: the EOT font parts (and a family name past 31 characters, such as
            "Playfair Display SemiBold Italic", which Windows may refuse to use), the title placeholder with no idx,
            the slide-number placeholder at idx 12.
done when — the gallery deck, light and dark, as a plain and an --editable .pptx, opens without a repair prompt in
            PowerPoint for macOS, PowerPoint for Windows, Keynote and Google Slides (import), each with a screenshot
            of slide 1 and of one card slide.
evidence  — the screenshots, the app versions, and for any failure the part it names.
verify    — tier 1 checker on the screenshots against the LibreOffice renders on PR #3220.
