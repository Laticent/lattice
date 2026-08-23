- **The background-shorthand hoist (#1528) is now verified on PPTX and the exported HTML
  player, not just the PDF/PNG path.** Both are inert: 14 PPTX slide rasters and 14 HTML-player
  slide screenshots byte-identical before and after, across all six hoisted sites at two
  geometries, and the player's DOM outside its inlined `<style>` byte-identical too. The
  player's file bytes do change — by exactly 5,060 in each geometry — which is the inlined
  `lattice.css` and nothing it paints. One result corrects a sentence worth not repeating: the
  computed background is **not** identical. The shorthand is two layers (the decoration, plus a
  final layer whose color is the canvas and whose image is `none`) and the longhands are one
  layer plus `background-color`, so all 11 site-by-geometry cells differ 2 layers to 1 while
  nothing that paints differs. Reaching the sixth site needed a geometry no sweep had used:
  auto-split is off for the `wide` aspect family, so `section.compare-code-block` cannot exist
  in a 16:9 render at all. (`engineering/decisions/2026-08-11-hoist-pptx-html-player.md`)
