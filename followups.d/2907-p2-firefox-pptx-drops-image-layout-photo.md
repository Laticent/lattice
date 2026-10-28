---
origin: 2907
priority: P2
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2907
---

# The PowerPoint export in Firefox drops an `image` slide's picture, and the toast names photos that are present

why now   — Found while building the export sign-off package for the WebKit fix (PR 2907). It is older
            than that PR: Firefox's slide pictures are byte-identical on `main` and on the branch.
where     — The Studio's PowerPoint export (`docs/src/components/studio/export/deck-export.js`) in
            Firefox. `examples/bg-on-any-slide.md` slide 4 (`<!-- _class: image -->` with
            `![bg right](sample:photo-wide.jpg)`) comes out with an empty picture frame, in light and in
            dark. Slides 2, 3 and 5 (`![bg]` on a `content dark` slide) keep their photos. The toast reads
            "could not load every image, so the file ships without: …/samples/photo-wide.jpg,
            …/samples/photo-pano.jpg", so it also names `photo-pano.jpg`, which IS in the file.
done when — Slide 4's photo is in the Firefox slide picture, and the toast names only images that are
            missing. Chromium and WebKit already draw it.
evidence  — Real Playwright Firefox (`gecko` project), 2026-10-26: slide pictures extracted from the .pptx,
            light and dark, on `main` and on PR 2907's branch (identical bytes). The same deck in Chromium
            and WebKit shows the photo.
verify    — Export `examples/bg-on-any-slide.md` to PowerPoint from the Studio in Firefox; open slide 4.
