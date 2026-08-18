- A deck with no math no longer downloads KaTeX's 20 math font files. The engine
  force-loads every declared `@font-face`, so the KaTeX faces baked into the base
  stylesheet cost ~254KB in the preview frame of every deck, math or not. They are now
  stripped from the docs-side registration and restored the moment a source contains
  math — gated on the engine's own detector, so the first math slide already has them.
  Preview fonts on a math-free deck: **39 → 19 files**; `@font-face` rules in the frame
  37 → 17. The published `dist/lattice.css` is unchanged, so exports still render math
  with zero network.
