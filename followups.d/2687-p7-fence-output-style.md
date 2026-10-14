---
origin: 2687
priority: P7
recorded: 2026-10-14
area: engine
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §5
source: https://github.com/Laticent/lattice/pull/2687
---

# A zip plugin's FENCE output keeps `style`, which can cover the whole slide

why now   — the red team on #2687 showed a renderer returning `<span style="position:fixed;inset:0;z-index:…">`
            paints over the viewport. #2687 closed it for inline spans (`doorFinishInline` keeps paint-only styles, and
            the root contains its paint); the fence door (`doorFinishFence`) keeps every style, as before. Off the path
            of #2687, so recorded here (HARD RULE #18).
where     — lib/core/door-attr.mjs `doorFinishFence`, lib/base/base.modifiers.css (`div[data-lattice-plugin]`).
done when — fence output cannot place anything outside its block: a style allowlist like `inlineStyle`, or the
            fence root's CSS containing its paint (`contain: paint`), with a test that a `position:fixed` box stays inside.
evidence  — a door-attr unit arm, and the real Studio for the containment.
verify    — tier 1 checker; the red team.
