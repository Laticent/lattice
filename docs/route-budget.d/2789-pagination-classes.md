studio: +860
playground: +100
home: +60
Page numbers are now one rule shared by the engine, Export to Marp, the lint and the Studio: the
Studio switch and the deck-config panel read `paginate:` through `paginateOn` in
`lib/core/meta-keys.mjs`, so a `paginate: no` reads off in the Studio as it does in the engine
(`meta-keys` +92 B gz on studio and playground). A separate `paginate-on.mjs` module was tried
and measured worse (more chunks, more bytes), so it was reverted.
The Studio's growth is mostly the preview bar: `SlideNavigator` in chrome-parts.tsx (one pill for
previous, count and next, the slide-map toggle moved up from the strip), the slide-action group
that wraps to fit the strip, and the counter's minimum-font sizer; `StudioIsland` +687 B. CI
measured studio +810 B, playground +57 B and home +18 B against main at 405c145; the numbers above
cover gzip variation.
Given back in the same PR, on the engine metric: Export to Marp now loads its bundle builder on
demand (`LatticePlayground.loadMarp()`), which takes about 24 KB gz out of every route's engine
boot (getting-started engineJsGz 314.8 KB to 293.4 KB).
