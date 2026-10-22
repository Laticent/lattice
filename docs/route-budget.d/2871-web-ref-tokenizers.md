studio: +3300
playground: +3300
home: +3300
`lib/core/remote-ref.js`, which every route loads to keep a deck's web images from loading until the reader allows them, now reads CSS with one tokenizer (`cssRefSpans`) and HTML tags with a linear scanner (`scanHtml`) instead of regexes. The regexes let 23 spellings of a web fetch through and took 25-50 s on crafted input. The entity decoder also keeps an offset map, so a rewritten style attribute keeps its other characters. Measured locally, bundled and minified with esbuild: 5,363 → 8,434 bytes gzipped (+3,071); the first CI run of this PR measured +1,223 before the scanner landed. The declared figure leaves room for gzip spread in the Vite build.
