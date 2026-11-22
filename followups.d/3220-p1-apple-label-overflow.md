---
origin: 3220
priority: P1
recorded: 2026-11-15
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-13-native-pptx-writer.md §Right, not parity
deferred: blocked — needs #3220's native writer on main first; the owner chose a separate PR over reopening #3220's sign-off (2026-11-15)
source: https://github.com/Laticent/lattice/pull/3220
---

# Tight labels overflow in Apple's Office importer (Quick Look, iPhone Preview, Keynote)

owner     — the session that wrote #3220 picks this up as soon as #3220 merges; the owner asked for it to be fixed,
            not left as Apple's limitation.
why now   — Apple's importer ignores the fonts a .pptx embeds and sets text in a wider stand-in serif. Calco sizes
            each text box to the browser's own text with `wrap="none"`, so a tight label overflows: "RECOMMENDATION"
            runs past its tab on gallery slide 100 (the overflow is white on the cream page, so it reads as
            clipped), the "AFTER — VERSION-FLOOR RECALIBRATION" pill label wraps on slide 52, and the inline-icons
            slide 8 title wraps into its rule. main's pptxgenjs output does the same (measured, runs 43768439879 and
            43765111442; see 3220-p1-native-pptx-real-readers.md), so it is pre-existing, not a #3220 regression.
            The font class hints #3220 added (PANOSE, pitch and family) did not change Apple's renders.
where     — docs/src/lib/calco/pptx.ts: `txBody` / `textOf` (box width and `wrap`), and labels inside shapes
            (`labelInsets`, docs/src/lib/calco/shapes.ts).
done when — on the office-quicklook suite, slides 100 and 52 of the gallery and slide 8 of inline-icons keep every
            label inside its tab or pill, and the same files render unchanged (pixel-diff 0 at the golden-diff
            tolerance) in LibreOffice, which has the fonts, so readers that do have the deck's fonts see no change.
            Candidates to measure in Apple, one dispatch each: `normAutofit` on labels and pills only; letting a
            label's text box grow with the shape (`spAutoFit`); keeping `wrap="none"` but anchoring the label to
            its shape. Pick by measurement, not by spec reading alone.
evidence  — before/after Quick Look montages of the three slides, the LibreOffice pixel-diff, and the PowerPoint
            open the owner's sign-off asks for.
verify    — tier 1 checker on the montages.
