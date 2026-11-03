---
origin: 2998
priority: P3
recorded: 2026-11-01
area: website
severity: medium
swimlane: engineering/decisions/2026-07-20-nacre-preview-loader.md
deferred: large — needs the copy swap to stop re-rendering (and repacking) a collage mid-gesture: an in-place tile patch, or a swap deferred until the pointer is idle
source: https://github.com/Laticent/lattice/pull/2998
---

# Collage photos keep their full-size originals in the Studio preview

why now   — PR 2998 shows each photo in a preview frame as a preview-sized copy, but leaves a
            collage's photos alone. Each copy lands with a re-render, a collage repacks its tiles on
            every render, and that lost a hover or an open lightbox mid-gesture: the collage e2e went
            from 20/20 (main) to 16/20 on desktop with collage copies on. A collage is many photos,
            so its full-size decodes are a large share of a photo deck's memory on an iPhone.
where     — docs/src/lib/preview-image-scale.ts (`imageEdit`, the `inCollage` skip),
            lib/transformers/collage.js (`applyToDom`, the repack), docs/src/playground/collage-host.js
            (the lightbox reads the tile's `src`: give it the original's address beside the copy, so it
            enlarges the photo itself).
done when — collage photos show their copies and docs/e2e/collage-lightbox.spec.ts passes 20/20 on
            desktop with `--repeat-each=2`, as it does on main.
evidence  — the collage e2e, before and after, and the WebKit bench with a collage arm.
verify    — cd docs && npx playwright test e2e/collage-lightbox.spec.ts --project=desktop --repeat-each=2
