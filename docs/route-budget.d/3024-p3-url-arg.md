studio: +40
playground: +40
home: +40
The shared CSS reference reader (lib/core/css-ref-reader.js, in the eager remote-ref chunk) gains the opt-in `urlArg`
fact: one assignment that marks the string a `url(` holds when the `)` does not follow it, which the two player exports
read to embed `url("a.png" crossorigin(anonymous))`, `url("a.png" /*c*/)` and an end-closed `url("a.png`. Measured
minified and gzipped: 1,471 to 1,499 bytes (+28). The string check the exports also need (`isClosedString`) lives in
lib/export/css-closed-string.js, which only the exports load, so the eager chunk does not carry it.
