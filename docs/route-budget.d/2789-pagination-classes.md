studio: +520
home: +650
Page numbers are now one rule shared by the engine, Export to Marp, the lint and the Studio: the
Studio switch and the deck-config panel read `paginate:` through `paginateOn` in
`lib/core/meta-keys.mjs`, so a `paginate: no` reads off in the Studio as it does in the engine. The
import moves `comment-directive` into the `meta-keys` chunk (-396 B there, +1,028 B in `meta-keys`
on home); CI measured home +615 B and studio +48 B against main at e2d9d3b (studio was +10 B on the
base before; `StudioIsland` moved +32 B with main), and the numbers above cover gzip variation. Given back first: a separate `paginate-on.mjs` module was tried and measured worse (home
+542 B but studio +92 B and playground +47 B, from the extra chunk), so it was reverted.
The Studio's +470 B (measured against main at 2026-10-20 22:40) is mostly the preview bar's new navigator
(`SlideNavigator` in chrome-parts.tsx: one pill for prev, count and next, and the slide-map
toggle moved up from the slide strip; `StudioIsland` +454 B). Given back in the same PR, on
the engine metric: Export to Marp now loads its bundle builder on demand
(`LatticePlayground.loadMarp()`), which takes 24 KB gz out of every route's engine boot
(getting-started engineJsGz 314.8 KB to 293.3 KB).
