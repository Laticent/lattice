---
origin: 2538
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2538
---

# A finish's frame keyline stays soft at 4K in the PDF writer's photo

#2538 drew the section's own gradient edge (the spectrum bar, the dark hairline) as a vector.
The other 1 px rules a finish paints at the slide's edge are not gradients: the `frame` edge's
keyline is an inset box-shadow ring (`--fin-frame`, `lib/base/base.finish.css` z4), and the
writer leaves it in the photo, which a 4K slide downsamples to 2560 px. It stays soft there.

```text
  P3 · draw a finish's inset keyline ring as a vector at 4K
       why now   — the last edge rule the 4K photo still softens; only `frame`-edge finishes hit it.
       where     — lib/core/pdf-compose/read-slide.mjs (readSectionEdges is the model: read the
                   section's inset spread-only box-shadows as rings, hide them in hideDrawn).
       done when — a `finish:` deck with a frame edge, at 4K, has its keyline within 6 levels of
                   the screen, and the 116-slide 4K gallery stays within ~10% of its time on main.
       evidence  — a third arm in test/integration/export/pdf-photo-hairline.test.js; gallery
                   timing main vs branch; dark + light renders for export sign-off.
       verify    — tier 1 checker, because it changes exported bytes.
```
