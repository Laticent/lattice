---
origin: 2727
priority: P1
recorded: 2026-10-16
area: engine
severity: high
swimlane: engineering/decisions/2026-10-16-media-plugins.md §3 (D3)
source: https://github.com/Laticent/lattice/pull/2727
---

# A CLI export drops `![bg]` on an ordinary slide: the picture shows in the Studio and is blank in the PDF or PNG

why now   — An author who previews a deck in the Studio sees their background picture, then exports with the CLI
            and gets a slide with only the heading. Nothing warns.
where     — `lattice.js:2170` runs `liftBgImages` on every slide, turning `![bg](x)` into a `.lattice-bg` div; every
            `.lattice-bg` rule is scoped to `section.image` (`lib/components/imagery/image/image.styles.css:113`),
            so on any other slide the div has no size. The engine lifts only on `image` slides
            (`liftImageBgImages`, `lib/core/bg-image.js:172`) and paints the rest as a section background.
            HARD RULE #1: the CLI should call the same class-aware lift the engine does.
done when — `![bg](x)` and `![bg contain](x)` on a non-`image` slide render the same picture in a CLI PDF/PNG as in
            the Studio; a test pins both paths; the `image`-slide galleries do not move (golden-diff).
evidence  — rendered 2026-10-16: deck with `![bg](sample:photo-pano.jpg)` and `![bg contain](sample:photo-tall-rotated.jpg)`
            on plain slides. Studio (Playwright, production build): pictures shown, section `background-size: contain`.
            CLI PNG: heading only.
verify    — render that deck with the CLI and look at both PNGs; open the same deck in the Studio.
