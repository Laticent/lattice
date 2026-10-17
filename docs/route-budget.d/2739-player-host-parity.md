studio: +46
playground: +2
The Studio's Webpage export now makes the CLI's structural split (`splitLikeCli` in share-export.ts calls the browser bundle's `splitForPreview` with `settle: false`, and warns when a bundle lacks it), and `splitForPreview` takes that option. Both run where the render happens; the rest of the player-parity work (the diagram bake, the settings block) lives in the lazily loaded deck-export.js and costs the eager routes nothing.
