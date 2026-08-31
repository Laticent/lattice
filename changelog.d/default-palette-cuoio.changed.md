- **Breaking: the default palette is `cuoio`, declared once and read by five of the six
  places that used to answer for themselves.**
  A deck that names no palette — no `theme:` front matter, no `--palette`, no
  `LATTICE_PALETTE` — rendered on `indaco` through the CLI and the tools that call it, while
  `dist/lattice-default.css`, the zero-config bundle a consumer can `<link>` directly,
  inlined **`cuoio`**. Same product, same "no palette specified" input, two different
  answers, and nothing held them together: `lib/core/resolve-palette.js` declared
  `DEFAULT = 'indaco'` and `tools/build-default-bundle.js` declared its own
  `DEFAULT_THEME = 'cuoio'` twenty files away. The docs-site Playground had already
  drifted to a third position — `sanitizePalette` returns `cuoio` while its own docblock
  said `indaco`. Two user-facing EXPORT paths hardcoded `indaco` of their own, and
  `tools/build-marp-kit.js` a sixth — `THEME = 'cuoio'` under the comment "The default
  palette", feeding the PUBLISHED kit, where a re-bless would have shipped the old pair
  with every gate green. The CLI now resolves `cuoio`, and the bundle builder, both export
  paths and the kit **import that constant** rather than restating it, so they cannot
  disagree again. The Playground keeps its literal: its code already returned `cuoio` and
  only its docblock was wrong.
  **What changes for you:** a deck with no palette now renders warm cream and leather
  instead of cool indigo. Nothing else moves — every committed deck in this repo already
  declares its `theme:`, so no committed PDF changes, and the gallery, bucket and showcase
  builders pin their palette explicitly (see below). To keep the old look, add
  `theme: indaco` to the deck's front matter; that has always worked and still does.
- **The gallery builders pin `indaco` on purpose, and now say so.** `build-galleries.js`,
  `build-bucket-galleries.js` and `build-showcase-galleries.js` pass the palette as an
  explicit positional, so promoting `cuoio` moved none of their output. That pin is
  deliberate — a gallery is a reference surface, and holding one palette fixed is what
  keeps a component diff readable across time — but it was a bare string literal that
  read like an oversight now that it names a non-default palette. Each of the four sites
  carries a comment saying it is deliberately NOT the default and must not be "fixed" to
  track it.
- **Fixed: a palette-resolution test asserted a literal where it meant "the default".**
  The path-traversal guard case checked `r.name === 'indaco'`, so it was really testing
  two things and would have failed on any default change for a reason unrelated to path
  traversal. It reads the exported `DEFAULT` constant now.
- **Added: a pin on the default's VALUE.** Reading the constant is right per case, but it
  left the value itself unpinned — a one-character edit changed what every palette-less
  deck, every Marp export and `dist/lattice-default.css` render as, with all 7544 tests
  green. The pre-change tree pinned `indaco` only by accident, through literals those
  cases have stopped using. One assertion restores it, matching the shape
  `docs/src/lib/site-chrome.test.ts` already uses for its own copy.
- The CLI's `--help` palette-resolution table and its short usage footer, plus the
  `export-chart-svg` and `preview-component` docstrings, named `indaco` as the default in
  prose. They now name `cuoio` or point at the single constant.
