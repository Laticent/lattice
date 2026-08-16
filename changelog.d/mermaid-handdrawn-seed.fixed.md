- **Fixed: hand-drawn (`mode: sketch`) diagrams rendered a different picture on every
  render.** Mermaid's `look: handDrawn` paints through rough.js, whose jitter is seeded
  from `handDrawnSeed` — and Mermaid's default of `0` means "no seed, use
  `Math.random()`". So the same deck, unchanged, exported two different SVGs on two
  consecutive runs. Measured on `examples/sketch.md`: 32 of 161 SVG lines differed
  between back-to-back renders of the same commit, every one a jittered path.
- The seed is now pinned in the shared init config, so the CLI export and the live
  preview both draw the same hand. **A sketch-mode diagram now changes only when the
  diagram changes** — which is also what makes its committed golden meaningful, since a
  re-render previously rewrote the bytes whether or not anything moved.
- **Sketch-mode goldens move once in this change** and are stable from then on. Classic
  decks are byte-identical: the seed is emitted only alongside `look: handDrawn`, so a
  deck that never asked for the hand-drawn look sends the same directive it always did.
