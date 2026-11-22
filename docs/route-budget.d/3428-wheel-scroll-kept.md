playground: +54

`applyWindow` in `docs/src/playground/deck-render.js` reads the frame's `scrollY` before a window move and writes it
back if a swap moved it. Under load Chromium dropped a reader's wheel scroll on the first `replaceChild` after it,
which was the `playground-map.spec.ts` rail flake (#2035, PR #3428). The 54 bytes are that read, the compare and
the `scrollTo` call. There is nothing smaller to give back: the guard is one expression.
