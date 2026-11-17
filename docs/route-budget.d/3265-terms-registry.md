playground: +517
home: +517
Both routes share two chunks with the Studio: `front-matter.js` (+294) now carries the lossless nested-block writer that fixes #1257 (a Terms, Lexicon or Acronyms save no longer rewrites the rest of the front matter), and the narration resolver's chunk (+223) parses `terms:` and merges it with the older `acronyms:` / `lexicon:`. Given back first: the Terms editor and its icons load only when the Speech tab opens, so the Studio route is 1,271 bytes smaller than `main`.
