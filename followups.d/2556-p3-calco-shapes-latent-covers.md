---
origin: 2556
priority: P3
recorded: 2026-10-08
area: engine
severity: low
swimlane: engineering/decisions/2026-10-07-calco-native-shapes.md
source: https://github.com/Laticent/lattice/pull/2603
---

# Calco shapes: two ways a lifted box can still hide paint (latent)

why now   — #2603 built native shapes in parallel with #2597 and was closed as superseded.
            Its checker's fixtures, run against main's reader (readSlide with
            { hide: true, shapes: true }) on 2026-10-08, still reproduce two defects. Neither
            occurs in the engine's own CSS or in the galleries today, so both are latent: they
            bite an author's custom CSS.
            1. An ANCESTOR's positioned ::before/::after painted over a lifted card stays in the
               picture, and the native card is then drawn on top of it, so it vanishes from the
               office file. Fixture: a section with ::after { position: absolute; background: red }
               over a card; 10000 red px survive the hide, under the card's shape.
            2. A CSS transition on background-color, border colors or box-shadow defeats the
               inline !important hide for its duration: with `transition: all 2s` the box is
               still in the picture after the hide (bg rgb(240,240,250) at +0 ms, alpha 0.97 at
               +100 ms), so the picture holds the box AND the native shape is drawn over it
               (doubled shadow). The restore animates the box back in the same way.
               Engine and theme CSS transition only opacity today.
where     — docs/src/lib/calco/reader.ts: the paint-order check that refuses a box covering
            painted-above content (it compares elements, not an ancestor's pseudo-elements),
            and the shape hide near the end of readSlide.
done when — (1) a positioned ::before/::after on any ancestor up to the slide, whose box
            overlaps a lifted box and paints, keeps that box in the picture; (2) the hide sets
            `transition: none !important` on every element it touches, and the restore puts
            the colors back first, forces a style flush, then the transition.
evidence  — both fixtures as reader integration tests that fail on today's main and pass
            after; card-tags and the jargon gallery shape counts unchanged.
verify    — tier 0 (the gates) plus the two new tests.
