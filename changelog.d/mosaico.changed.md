- **Changed: the collage lays out about six times faster, with the same layouts.** The collage
  packer moved out of `lib/core/collage-pack.js` into a new workspace library, `@laticent/mosaico`
  (`docs/src/lib/mosaico`), and Lattice's side of it now lives beside the component in
  `lib/components/imagery/collage/collage.pack.js`. Six photos in free order pack in about 9 ms
  instead of about 58 ms; ordered collages in about 0.4 ms instead of 3.3 ms. Every collage lays
  out exactly as before: a golden file of 4,128 cases pins the output byte for byte to the old
  packer.
- **Changed: `logo-wall` draws every mark at the same area.** A mark used to fill as much of an
  equal cell as its shape allowed, so a 3:1 wordmark got 3.6× the area of a 1:2 crest (2.75× in
  `dense`). Now mosaico's new `rows` strategy gives each mark the same area, capped in height,
  in balanced, centered rows (ten marks break 4/3/3, not 4/4/2), in the CLI and the live preview
  alike. A wall of one shape keeps its old size, captioned or not, in `compact` too. The wall now also fits its stage: three rows
  under an eyebrow used to spill past the slide. Three sample marks of other shapes
  (`sample:logo-pinnacle.svg` 4:1, `logo-keystone.svg` 1:1, `logo-spire.svg` 1:2) and a demo deck,
  `examples/logo-wall-equal-weight.md`, show it. `@laticent/mosaico` now has both of the users
  its first npm release waits for; the owner triggers that release.
