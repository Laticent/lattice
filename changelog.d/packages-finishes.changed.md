- **Changed: shipped finishes are packages.** Each preset is now a folder,
  `lib/finishes/<name>/`, holding a manifest (label, blurb, picker swatch, order) and
  a recipe. The finish register, the deck linter's vocabulary, the Studio's finish
  picker and its "Start from preset" recipes are all generated from those folders.
  Adding a finish no longer takes a hand edit in four files. Its CSS is still
  written by hand, and the build fails when a package and its CSS rule don't match.
- **Fixed: "Start from preset" in the Finish faculty reproduces the shipped
  preset.** The Studio's copies of the recipes had drifted: `halo`'s spotlight sat in
  the top-right corner instead of the center, `loom`'s corner glow was on the wrong
  side, and `meridian`'s and `halo`'s line pitch was one pixel off. The recipes now
  come from the packages, measured pixel-equal to the shipped CSS for those three
  (layers only; a ghost glyph is still placed differently).
