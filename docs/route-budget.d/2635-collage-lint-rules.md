studio: +1950
playground: +900
home: +900
The Studio's live lint is lint-core, and it now carries the six collage rules (`collage-count`, `collage-alt`, `collage-bg`, `collage-hint`, `collage-tail`, `collage-hero-dup`) with the photo and hint grammar they share. The collage lightbox adds the in-frame click and key guard in `deck-preview.js` (`linkGuardAgent`, which the Playground, the Studio and the home preview all import) and the small host `collage-host.js`. Measured locally against main: studio +1812, playground +778, home +755 bytes gz; the declared numbers leave room for gzip spread between builds.
Given back first: the opener `lib/core/collage-lightbox.mjs` is loaded on the first click (a dynamic import), so no route carries it at startup. CI measured +3036, +1993 and +1973 before that change. The hint grammar is also written once in lint-core and pinned against the transform's `parseHints` by a test, instead of importing the transform into the Studio bundle.
The home route grows because the frame guard lives in a chunk it shares with the Studio and Playground, not because home shows a collage.
