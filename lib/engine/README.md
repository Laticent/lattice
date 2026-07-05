# lib/engine — the owned render engine

THE canonical Markdown→slides engine (it replaced marp-core). Turns Lattice
Markdown into the same `<section>`-per-slide HTML contract Marp produced,
so everything downstream (CSS, transforms, export) is renderer-agnostic.

- `index.js` — `createEngine()` / `render()`, the entry.
- `slides.js` — markdown-it core rulers producing the slide/directive
  token contract.
- `directives.js` — front-matter and `<!-- key: value -->` parsing.
- `css.js` — per-render scaffold + theme CSS emission.
- `themes.js` — the theme store.
- `math.js` / `qr.js` — synchronous KaTeX / QR renderers.
- `background-image.js`, `video-providers.js`, `render-guard.js`.

Consumed by `lattice-emulator.js` (CLI/PDF), `lib/playground` (browser),
and `tools/export-marp.js`. History: `engineering/marp-independence.md`.

**Gotchas:** the engine's built-in `css` is a minimal stub — callers supply
the real `dist/lattice.css` + theme. And `math.js`/`qr.js` are synchronous
BY DESIGN: the headless-Chromium PDF path has raced on async reflow before.
Do not make a substance renderer async.

*(File lists here are a snapshot — `ls` is the truth if they ever disagree.)*
