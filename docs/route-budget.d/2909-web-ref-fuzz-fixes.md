studio: +700
playground: +700
home: +700
The web-reference scanner (lib/core/remote-ref.js, shipped in every route's eager chunk) now refuses eight more spellings of a web fetch that a seeded fuzz found: a web `<base>`, a refresh `<meta>`, `http:host` without slashes, nested `srcdoc`/`data:` documents, SMIL `href`, an unterminated comment before an image, `<select>` content and an `@import` string Firefox reads undecoded. CI measured +671 B gz on `_astro/remote-ref` for each of the three routes; +700 covers this head with room for gzip spread.
Given back first: nothing; the checks are the new code, and the scanner's earlier reads were already minimal.
