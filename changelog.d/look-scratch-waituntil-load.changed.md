- **Changed: the image set's diagram re-bake no longer waits on `networkidle0`.** The
  scratch page that flattens Mermaid diagrams into a `--svg-background` look was the
  fourth and last navigation wait still on `networkidle0`. It is a document this process
  just built, and after the `@font-face` fix above it requests nothing at all, so the wait
  only ever bought Puppeteer's own idle floor: **1,986 ms → 154 ms**, with the emitted
  image set byte-identical under both waits (20 assets compared).
