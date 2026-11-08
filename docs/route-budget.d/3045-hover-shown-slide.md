studio: +168
The Studio's preview hit-test now checks that the frame shows the slide the reader is on before it reads it, waits for a
loading write's `load`, and asks again on each committed render (collage-lightbox.spec.ts:211, #3045). That is the
whole growth, in StudioIsland. A shared helper with pool-capture.ts cost 382 to 403 bytes (a chunk of its own, or the
home route through single-slide-render), so the six-line check stays local and names `slotShows` as its twin.
