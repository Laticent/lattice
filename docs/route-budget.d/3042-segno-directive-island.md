studio: +2337
playground: +1383
home: +1369
The Segno P3 directive island (lib/core/directive-island.mjs) and the scan that reads it (lib/core/meta-scan.mjs) now
ride with the deck model in startup JavaScript: the class scan and the boundary reader every route loads read their
comments and boundaries from one model instead of a regex line walk, and the deck model gained its per-kind range
lists and the tape-growth and quadratic fixes. The Studio adds the outline's held model (deck-outline.ts), and its forward-scan check, kept so unit ids stay as `main` assigns them.
Given back first: the lint core went from 149.0 KB to 148.4 KB, under its ceiling, by moving the linter's scan out of
meta-record (whose editing helpers it no longer carries) and writing the island smaller.
