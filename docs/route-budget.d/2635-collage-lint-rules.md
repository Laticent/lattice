studio: +1100
home: +8
The Studio's live lint is lint-core, and it now carries the six collage rules (`collage-count`, `collage-alt`, `collage-bg`, `collage-hint`, `collage-tail`, `collage-hero-dup`) with the photo and hint grammar they share. CI measured +1,041 B gz against main on `280f96e`; +1100 leaves room for gzip spread between builds.
Given back first: the hint grammar is written once in lint-core and pinned against the transform's `parseHints` by a test, instead of importing the transform into the Studio bundle.
The home route read +3 B: gzip variation on a route this PR does not change. No real growth is being declared there.
