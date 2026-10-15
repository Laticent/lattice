- **Changed: the Studio loads about half as much lint code after first paint.** The lint core now
  loads as part of the engine's own module build (`esm/lint.js`) instead of as a separate bundle, so
  it reuses the engine's markdown-it and core readers instead of shipping its own: 181.7KB to
  90.3KB gzipped. It keeps its own boundary parser, so narrowing the lint to a deck's plugins never
  changes how the engine splits slides. Lint findings are identical across 278 decks.
