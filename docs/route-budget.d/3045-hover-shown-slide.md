studio: +260
The Studio's preview hit-test now checks that the frame shows the slide the reader is on before it reads it, waits for a
loading write's `load`, and asks again on each committed render (collage-lightbox.spec.ts:211, #3045): +168 in
StudioIsland. A helper shared with pool-capture.ts cost 382 to 403 bytes (a chunk of its own, or the home route through
single-slide-render), so the six-line check stays local and names `slotShows` as its twin. The slide map's capture queue
puts a capture back when the reader scrolled while its code loaded (studio-map-posters.spec.ts): +42 in preview-pool.
Measured 210 against `main` d1a4704; declared with room for gzip variation.
