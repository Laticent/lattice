studio: +200
playground: +200
home: +200
The shared CSS reference reader (lib/core/css-ref-reader.js, in the eager remote-ref chunk) reads CSS whitespace as CSS
defines it: `isValidUrlToken` and the unquoted-url trim used JavaScript's `\s` / `trim()`, which also swallowed a
no-break space, so an address holding one read wrong in the Studio's Webpage export too. The trim is a loop rather
than a backtracking regex, and the reader keeps a small block-stack hook for the CLI export's `image-set()` fact.
Given back first: the function-name check behind that fact (about 280 bytes gzipped) moved to
lib/export/css-image-set-block.js, which only the Node CLI export loads. The first push cost 380 bytes; this one about 153.
