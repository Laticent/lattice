---
origin: 2533
priority: P3
recorded: 2026-10-05
area: theming
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2533
---

# Pills in the PDF: what the size rule left off center

why now   — the export's Chrome 131 has no `text-box`, so pills take a fixed 0.05em label shift. Since
            2026-10-06 a pill at 18.5px and up takes none (lib/base/base.modifiers.css § Optical
            centering), which brought `h1`/`h2` pills from 1.4–2.3px low to within 0.63px. Left as
            measured in the PDF: an `h3` pill (15.3px) sits 0.69px low and would center unshifted; a body
            `:sm` sits up to 0.88px low; sketch slides keep the old shift everywhere, because their face
            moved the wrong way under the size rule (an `h2` pill 0.13px → 0.88px off); and each pill's
            place in its line moves it by about ±0.4px, which no fixed shift removes.
where     — the `@supports not (text-box…)` branch in lib/base/base.modifiers.css; the measuring probe
            the 2026-10-06 work used rasterizes the PDF at 8x and reads the label's ink against the box
            edge (pill colors overridden, rects from the HTML layout).
done when — every pill measured in the PDF (h1–h4 and body at sm/md/lg, Outfit and the sketch face) sits
            within 0.6px of center, or the residue is shown to be the line-position noise alone; or the
            export moves to a Chrome with `text-box` (133+), which retires the branch.
evidence  — the before/after ink table per context.
verify    — tier 1 checker.
