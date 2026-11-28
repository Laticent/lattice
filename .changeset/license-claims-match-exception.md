---
"@laticent/lattice": minor
---

The Lattice Output Exception now also covers HTML decks that Marp renders from the Marp kit or an Export-to-Marp bundle, and the README says exactly what the exception covers.

`LICENSE-EXCEPTIONS` goes to version 1.2. Its new "Marp renders" paragraph lets you publish an HTML deck that Marp CLI or Marp for VS Code renders from the Marp kit or an Export-to-Marp bundle, with the script and style files it loads from beside it, under terms of your choice. The kit's or bundle's CSS and JavaScript must be unmodified, and Marp Core or Marpit inside any other program does not count. The README's license section used to say every rendered deck was "yours outright"; it now lists what the exception covers and what it does not (a modified engine, extracted assets, the loose kit or bundle folder, and decks other tools build). The Marp kit's `NOTICE.md` and the comparison page say the same, and the comparison page no longer says the engine is at v1.
