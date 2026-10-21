playground: +248
Switching between Edit and Explore no longer flickers: `PlaygroundApp.tsx` gains the cover (`coverPreview`, its backstop), the reuse test (`reusableFrame`) and the reveal's wait for the Explore target (`openOnPendingRef`). That is +248 B gz in the Playground island and nothing anywhere else; the sync's hold (`playground-sync.ts`) is in the lazily loaded focus chunk.
