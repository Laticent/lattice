- The `list` gallery golden shows what the engine renders again. Rebuilding the gallery PDFs
  this change's CSS made stale surfaced a slide whose committed baseline had gone out of date:
  `list principles bullet` renders as a bare `1. 2. 3.` with the whole `principles` register
  missing, while the golden still showed the styled version. **The regression is on `main`, not
  here** — the merge-base tree and this branch render that slide pixel-identically — and the
  cause is a name collision: `bullet` is both a declared variant of `list` and a standalone
  chart component, and only the chart's stylesheet guards against it
  (`:is(section.bullet:where(:not(.list)), …)`). Recorded in
  `engineering/decisions/2026-09-13-a-component-splits-its-variants-did-not.md`; the golden is
  left truthful rather than pretty.
