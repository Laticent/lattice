studio: +1115
playground: +504
home: +529
The code plugin takes highlight.js out of the engine: grammars now load per deck, so
ensure-hljs-language.ts fetches the grammar manifest and follows each grammar's embeds
(about 490 bytes on every route that hosts the engine). The Studio adds the "Format code
blocks" command and the copy-button tap bridge (code-copy-host.js), which must run inside
the click handler to keep the click's user activation. DeckPreview's `thumbnail` flag
(about 40 bytes) keeps copy buttons out of the Studio's tile grids. Given back first: engineJsGz is
37 KB smaller on every one of these routes (38.8 KB on getting-started).
