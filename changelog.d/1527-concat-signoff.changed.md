- **Investigated (no behavior change, and the flip is still NOT shipped): the palette/base concat
  sign-off sweep, and it changes the recommendation.** Three things are now measured that were
  not. **The blast radius** — all 32 themes in both modes, before and after, 576 slides a side:
  every one of the 64 grid states changes at least one slide. Sixteen of the 32 theme files are
  `-dark` wrappers that render identically to their parent at a fixed `color-mode`, so the honest
  distinct figures are 36 of 36 states and 99 changed renderings rather than 64 and 202 — the
  conclusion is unchanged and the earlier four-themes-light-only sample was still a wide
  underestimate. **The preview already renders the
  flipped order** — `lib/engine`'s `composeCss` inlines the base at the theme's own
  `@import 'lattice'` position, so the Studio, the docs site and the browser playground show the
  palette's value; driven on the real engine, 932 of 932 disputed tokens resolve exactly as the
  flip would and none as the export does. Preview and export therefore disagree *today*, on every
  theme, and the flip makes them agree rather than swapping which one is wrong. **And the flip is
  not purely an activation of better values**: across 960 contrast pairs (the twelve `--hljs-*`
  against `--code-bg`, the status trio against `--bg`), 684 change, 411 get worse, 11 cross below
  their floor and 3 cross above. Looking at those 11 rather than trusting them corrected the
  reading twice — `a11y-achromatopsia`'s dark checklist genuinely loses its rails and icons
  (the palette declares flat grays with no `light-dark()` pair, authored for a light canvas), while
  `a11y-deuteranopia`'s apparent regression is its intended blue encoding finally rendering and
  staying perfectly legible, which says the reference surface was wrong for that use rather than
  the palette. The flip stays the right direction; two masked authoring defects must be repaired
  first, and an `--hljs-* × --code-bg` AA gate should land with it.
  (`engineering/decisions/2026-08-11-palette-concat-signoff.md`)
