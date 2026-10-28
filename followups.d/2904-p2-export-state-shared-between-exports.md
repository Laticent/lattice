---
origin: 2904
priority: P2
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-fonts-policy.md
source: https://github.com/Laticent/lattice/pull/2904
---

# `pictureImages` is module state shared by every Studio export, and a hidden slide exports as a blank 1x1 picture without an error

why now   — Found by the red-team pass on PR 2904. A double click past the stale `busy` closure can start a PowerPoint and an Office export in one frame; each sets `pictureImages` for the length of its export and the other overwrites it. A hidden or zero-size section returns a blank 1x1 canvas.
where     — `docs/src/components/studio/export/deck-export.js` (`pictureImages`, `officePicturePolicy`, `shootSection`) and `lib/core/slide-camera.mjs` (`captureSlideCanvas` reads `offsetWidth`).
done when — The picture setting is passed down the call instead of held in a module variable, and a zero-size section throws a named error that the export reports.
evidence  — Reasoned from the source, not reproduced on a device.
verify    — A vitest case that starts two exports with different `images:` settings and checks each file's encoding.
