---
origin: 2640
priority: P3
recorded: 2026-10-12
area: engine
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# `asset:` inside raw HTML (single-quoted `src`, `srcset`, `<video>`) is not resolved

why now   — The checker on PR #2640 rendered `<img src='asset:gone'>`, `<img srcset="asset:hero 1x">` and
            `<video src="asset:hero">` with a map: all three keep the dead `asset:` text (DOMPurify then drops
            it, so the slide shows no picture rather than the drawn stand-in). Markdown images, `![bg]`,
            double-quoted `<img src>` and style `url()` all resolve.
where     — `lib/core/bg-image.js` `IMG_SRC_RE` (double quotes only) and the inline-media passes.
done when — Each of the three shapes renders the photo, or the stand-in, with a map; a unit test per shape in
            `test/unit/core/asset-images.test.js`.
