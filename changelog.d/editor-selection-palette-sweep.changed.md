- **Changed: the editors' selection contrast is now read from a browser on all 18
  palettes, not one.** `editor-selection-parity.spec.ts` drove only the default
  palette, so 17 of 18 rested on a sweep of the token files — the kind of arithmetic
  this surface has twice shipped a wrong number from. It now loops every palette in
  both color modes on both editors, reading `::selection`, the caret, the active-line
  backdrop and the six inks these editors paint off the live DOM, and holds primary
  ink to AA (4.5) and secondary to AA-large (3.0).
- **Fixed: a contrast spec read `NaN` for any token the stylesheet minified to
  three-digit hex.** The helper sliced `#rrggbb` at fixed indexes, so `#fff` and
  `#000` parsed as `NaN` and every ratio built on them was meaningless. It only stayed
  invisible because cuoio — the one palette the spec drove — has no shorthand token.
- **Added: `tools/screenshot.js --storage k=v`** seeds localStorage before the first
  navigation, which is what it takes to photograph the docs site on a non-default
  palette (no route accepts one as a query parameter).
