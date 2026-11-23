playground: +61

`applyWindow` in `docs/src/playground/deck-render.js` reads the frame's `scrollY` before a window move and writes it
back if a swap moved it. Under load Chromium dropped a reader's wheel scroll on the first `replaceChild` after it,
which was the `playground-map.spec.ts` rail flake (#2035, PR #3428). The 61 bytes are that read, the compare against
half the pane (a smaller move is the reader's own iOS scroll still in progress) and the `scrollTo` call. There is
nothing smaller to give back: the guard is one expression.
