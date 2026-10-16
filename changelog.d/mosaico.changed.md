- **Changed: the collage lays out about seven times faster, with the same layouts.** The collage
  packer moved out of `lib/core/collage-pack.js` into a new workspace library, `@laticent/mosaico`
  (`docs/src/lib/mosaico`), and Lattice's side of it now lives beside the component in
  `lib/components/imagery/collage/collage.pack.js`. Six photos in free order pack in about 9 ms
  instead of about 58 ms; ordered collages in about 0.4 ms instead of 3.3 ms. Every collage lays
  out exactly as before: a golden file of 4,128 cases pins the output byte for byte to the old
  packer. `@laticent/mosaico` is not on npm yet; it publishes once `logo-wall` runs on it too.
