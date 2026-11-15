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

## Apple's importer, main (pptxgenjs) against this branch (2026-11-15)

The office-quicklook suite rendered the same 35 slides (`--custgeom-only` gallery and inline-icons) from `main` at
`0ac483a4`, which still writes with pptxgenjs (run 43768439879, dispatched with `simulate: no-session`, so the iPhone half
skipped and nothing was filed), and from `f3ead5f` (run 43765111442). Quick Look had 0 failures on both.

- **Overflow: pre-existing, measured.** Apple ignores embedded fonts and sets text in a wider stand-in serif, so a few
  boxes sized to the browser's font overflow: "RECOMMENDATION" is clipped on gallery slide 100, the "AFTER —
  VERSION-FLOOR RECALIBRATION" pill wraps on slide 52, and the inline-icons slide 8 title wraps into its rule. main's
  pptxgenjs file does the same: slide 52 is pixel-identical (0 px), and on slide 100 and inline-icons slide 8 the
  clipped label and the wrapped title match, the only difference being the shift below. Parity on those shapes:
  boxes within 45 EMU, label insets within 62 EMU, `wrap="none"` on both, the same font, size, weight and letter
  spacing, and the same 18 embedded font parts, byte-identical (sha256 of all 18, `9947d1ce536c3532`).
- **A 1 pt shift: pptxgenjs's error, not ours.** 16 of 35 renders differ (10 gallery, 6 inline-icons). On 14 of
  them a shape on the slide has an edge that pptxgenjs wrote 0.0024 pt under a whole point, because it rounded through
  inches (x 304770 EMU, 23.9976 pt, where the deck says 32 px, 24 pt; this branch writes 304800). Measured on gallery
  slides 100, 104, 109, 58, 51 and 80: the difference is the text moved exactly 2 render px (1 pt) right in this
  branch's file. On 114 it is a card 1 pt lower. Apple truncates positions to whole points, so pptxgenjs's shapes landed 1 pt
  short of where the browser drew them, and this branch's land on them.
- **The other two.** Gallery 49 (272 px): a drawn chevron, whose line is now its exact width (26797 to 26756 EMU).
  Gallery 106 (97 px): the left accent edge of a card draws about 1 px narrower. The parity reader finds no box or
  stroke change on that slide. The one difference in its XML is `fill="none"` on the open path, which the spec gives an
  open stroke, so that is the likely cause, not measured.
- **Still open, and the reason this note exists:** PowerPoint, Keynote and Google Slides. Apple's importer is not
  PowerPoint: it substitutes fonts and truncates to points, so a clean Quick Look render says the package parses, not
  that PowerPoint shows it as the browser did.
