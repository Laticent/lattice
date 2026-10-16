- **Changed: `npm run parser:bakeoff:segno` now times the inline dispatcher Lattice ships.**
  The arm compared Segno against the retired pre-Segno kernel and its own copy of the
  dispatcher, so no figure said how fast `lib/core/inline-code-directives.js` is. Every row now
  reports the shipped dispatcher's time per span as well, including the 386 spans written in
  Segno's notation, and the Segno README's § Speed quotes the 2026-10-07 run. The shipped path
  costs 136 ns on ordinary code, against 31 ns for the retired kernel. That gap is recorded as
  a followup.
