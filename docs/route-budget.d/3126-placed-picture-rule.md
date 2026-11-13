studio: +25
The Studio's photo-contrast read now hands the deck source to the photo finder (`readBehindCard(chunk, at, sourceRef.current)`),
so a deck-wide `class: bleed` places the picture there as the engine places it: the one placed-picture rule
(lib/core/placed-picture.mjs). The extra argument and its ref cost 25 gzip bytes in the eager StudioIsland chunk, measured against main at f3c68706
(1 byte against the base before it: gzip prices the same change differently beside different neighbors); the rule
itself loads with the card-ink module, off the eager path.
