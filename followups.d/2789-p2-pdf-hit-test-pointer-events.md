---
origin: 2789
priority: P2
recorded: 2026-10-20
area: engine
severity: low
swimlane: engineering/pipeline.md
source: the checker's review of read-slide.mjs textCovered, 2026-10-20
---

# The PDF writer's image and SVG hit tests skip `pointer-events: none` elements

why now   — #2826 fixed this for text (`textCovered` in lib/core/pdf-compose/read-slide.mjs): a hit test skips `pointer-events: none`, so the element never finds its own box and reads as covered by whatever paints under it. `paintedAbove` (~line 1332, images) and the SVG `sample` (~line 1267) have the same blind spot. It errs safe: an author's `<img style="pointer-events:none">` stays in the photo and sets `needsSharpPhoto`; nothing is wrongly drawn as a vector. No shipped img/svg carries it today except the rough-ink layer.
where     — lib/core/pdf-compose/read-slide.mjs `paintedAbove`, the SVG `sample`; reuse the per-call force-and-restore from `textCovered`.
done when — an `<img style="pointer-events:none">` with nothing above it is placed as an original image, not kept in the photo.
evidence  — the writer's log line for a probe deck before and after (rebuild `dist/` with `npm run build` first: lattice.js loads the bundled writer, so an old `dist/` silently tests the old code).
verify    — tier 1 checker; this changes exported PDF bytes, so it needs the owner's export sign-off.
