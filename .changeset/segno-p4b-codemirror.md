---
"@laticent/lattice": patch
---

The Studio's source editor now reads a deck with the engine's own parser, so its syntax tree agrees with the slide. Math, `~~strikethrough~~`, tables and front matter are read the way the engine reads them: `$a*b*c$` is no longer emphasis inside the math, and front matter is the block the engine takes as front matter.
