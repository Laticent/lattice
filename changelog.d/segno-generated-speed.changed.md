- Segno's generated parsers read whole CSS, HTML and Markdown files about 1.3x–2x faster (CSS
  112 → 178 MB/s, HTML 117 → 156, Markdown 101 → 207), ahead of postcss's, css-tree's, parse5's
  and markdown-it's tokenizer layers on Lattice's own files. Trees and errors are unchanged.
  `npm run parser:bakeoff:languages` now also races those tokenizers like for like.
