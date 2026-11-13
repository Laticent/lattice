studio: +1200
playground: +100
home: +900
The Studio stops freezing on a deck of phone photos.

First pass: the slide-metadata memo skips a key longer than its cap, with a work counter the unit tests and bench read
(comment-directive, +44), and `splitSlideChunks` keeps its last answer instead of re-cutting a 16 MB deck 35 times per
edit (slide-boundaries, +41). The editor and Coach stamp the length of the text each pass answered for, so a test can
wait on it (StudioIsland, +26).

Second pass: the Studio's source checks read each photo's base64 as a short stand-in (`analysisText`, which puts
lib/core/payload-elision.js in the eager single-slide-render chunk, +756 after the give-back below), the editor's lint and
the Coach move to a worker whose client loads on demand (StudioIsland, +273 with the fold and the identity keys), and the
web-image blocker copies runs instead of characters (remote-ref, +42). Firefox's longest stall on that deck fell from
28.7 s to about 0.8 s. Home mounts the Studio island and pays single-slide-render; the playground pays remote-ref and
slide-boundaries.

Given back first: the image-line rule left the kernel for a module of its own, now lib/core/image-line-payloads.js (single-slide-render
+1,021 to +756), and putting lint findings back moved beside lint-core (lib/authoring/elided-findings.js). CI measured
studio +1,421, home +1,147 and playground +83 against main before that give-back; a local build against main measured
studio +708 and home +434 after it, with a chunk split CI did not show. Each line is CI's figure less the 265 bytes given
back, rounded up for build noise.
