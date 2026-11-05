studio: +600
playground: +360
home: +500
The measured split (`fit: pack`, engineering/decisions/2026-10-28-fit-everywhere-model.md §16, §17) runs on
every preview surface, so each one carries its eager entry point: a one-line check for a `fit:` line
(`src/lib/fit-pack-wanted.ts`), the lazy `import()` of `src/lib/measured-split.ts`, and the call that
hands it the render, the frame builder and the engine's verdict config. Since §17 the Studio's call also
hands over its host, slide key and layout key, so the lazy `studioPlan` can reuse a slide's plan while
the author steps through its pages and measure only when they pause; and DeckPreview listens for the
`lattice:measured-split-ready` event that settles the preview. Measured by CI against main at 158a43c:
+478 B gz on studio (+365 single-slide-render, which home also loads: +401 there; +16 DeckPreview),
+307 on playground (+270 the Playground's render bridge). Given back first: the exact `fit:` reader,
the Studio's per-slide memory, the plan cache, the pause timer and the frame code all live in the lazy
module; a deck without a `fit:` line never loads it. Declared with headroom for gzip variation.
The checker's fixes (§17) add the call that cancels a pending measurement when the shown slide
stops taking the measured split, and hash the stylesheets into the layout key: CI on e01dea7 measured
+546 B gz on studio (+427 single-slide-render) and +463 on home.
