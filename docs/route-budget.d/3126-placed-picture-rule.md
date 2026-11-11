studio: +1
The Studio's photo-contrast read now hands the deck source to the photo finder (`readBehindCard(chunk, at, sourceRef.current)`),
so a deck-wide `class: bleed` places the picture there as the engine places it: the one placed-picture rule
(lib/core/placed-picture.mjs). The extra argument and its ref cost 1 gzip byte in the eager StudioIsland chunk; the rule
itself loads with the card-ink module, off the eager path.
