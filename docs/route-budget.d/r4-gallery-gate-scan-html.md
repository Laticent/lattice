studio: +650
playground: +650
home: +650
Segno R4 moves the package gallery gate onto remote-ref.js `remoteRefsInHtml` (scanHtml, refusing where it is unsure, and an exact read of a Mermaid diagram's text), so _astro/remote-ref.js grows by about 560 gzip bytes measured locally (7,313 to 7,871, esbuild minified); the number declared leaves room for CI's measure, which ran about 8% above the local one for R3. The parse5 and DOMParser walkers it replaces were in lazy chunks, so nothing on the eager path is given back. No ceiling moves.
