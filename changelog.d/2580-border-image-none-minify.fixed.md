- **Fixed: `accent` and `tone-edge` slides keep their solid top bar when a consumer bundles the
  engine CSS with Vite.** Vite 8's default minifier, lightningcss, rewrote the engine's
  `border-image: none` to an empty declaration that the browser drops, so those slides showed the
  spectrum gradient instead. The engine now resets `border-image-source`, which draws the same in
  every Lattice renderer and survives the minifier.
