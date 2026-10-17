studio: +46
playground: +8
The Studio's Webpage export now makes the CLI's structural split (`splitLikeCli` in share-export.ts calls the browser bundle's `splitForPreview` with `settle: false`, and warns when a bundle lacks it), and `splitForPreview` takes that option. Both run where the render happens; the rest of the player-parity work (the diagram bake, the settings block) lives in the lazily loaded deck-export.js and costs the eager routes nothing.
Both lines carry a few bytes of headroom over the measured growth (studio +41, playground +4 on dcac19e): the gzip size of the same eager chunk moved by one byte between pushes as the code bundled with it changed, and a declaration set to the exact byte failed on the next push.
