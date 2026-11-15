studio: +128
The Studio's hover now hit-tests a still pointer again when a collage in the preview packs: one MutationObserver on the
frame document, filtered to `data-collage` (`watchCollagePacks` in StudioShell.tsx). Without it the cursor and the pop
stayed off a photo that packed under the mouse, the likely cause of the collage-lightbox.spec.ts:254 flake. The growth is the
observer and its re-arm on a new document; there is nothing smaller that watches the pack.
Measured +109 on CI against `main` 42ec9c9; declared with room for gzip variation.
