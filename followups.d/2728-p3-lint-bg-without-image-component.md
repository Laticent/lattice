---
origin: 2728
priority: P3
recorded: 2026-10-16
area: imagery
severity: low
swimlane: lib/components/imagery/image/image.docs.md
source: https://github.com/Laticent/lattice/pull/2728
---

# `lint:deck` does not warn when `![bg]` sits on a slide without the `image` component

Found while authoring the #2728 sign-off deck. A `![bg](sample:photo-wide.jpg)` on a plain content slide renders a `.lattice-bg` that is `position: static` with zero height, so the photo silently draws nothing, in the plain HTML export and in the player. `npm run lint:deck` reported no error or warning.

where — a rule in `lib/authoring/lint-core.js` (HARD RULE #7): a `bg` image on a slide whose class carries no component that positions `.lattice-bg` (`image`, `scene`, …).
done when — the lint warns, with the fix ("add `<!-- _class: image -->`"), and a test covers it.
