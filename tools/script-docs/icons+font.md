---
group: Build & bundle
---
Build the Lattice Icons font from the curated icon drawings: assign each new icon a private-use codepoint that never moves (lib/plugins/_icons-source/codepoints.json), outline the strokes into three woff2 faces in assets/fonts/ (line weights 1.5, 2, 2.25), and write lib/fonts/icon-faces.js. Run it by hand when the icon list changes; it needs Python 3.10+ with `pip install -r tools/icon-font/requirements.txt`. `-- --check` fails when the font is stale, and `fonts:check` runs the same check in the build.
