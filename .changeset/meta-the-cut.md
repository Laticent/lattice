---
"@laticent/lattice": major
---

**Breaking:** Lattice reads slide settings only from `<!-- @meta{…} -->` records; an old comment such as `<!-- _class: cards -->` or a bare `<!-- {layout=cards} -->` no longer sets anything, and `lattice migrate meta` converts a deck in one pass.

- The engine ignores every old setting comment: directive comments (`<!-- _class: … -->`, `<!-- footer: … -->`,
  `<!-- _paginate: … -->`, flags such as `<!-- hide -->`), pane markers (`<!-- _pane: bar -->`, `<!-- panes: 60/40 -->`),
  the bare marker `<!-- stress-slide -->` and the bare record `<!-- {…} -->`. A slide written that way renders the
  default layout, and the render reports one `meta/legacy` diagnostic with the count.
- Lint reports each one as an **error** with the whole-deck fix: `legacy-directive-comment` for an old comment and
  `meta-opener-bare` for a bare `{`. `lint:deck --fix`, the Studio's fix button and `lattice migrate meta` rewrite the
  deck; the migrated deck renders what the old one rendered before this release.
- Decks are never converted when they are opened or imported: a deck from Studio storage, a `.lattice` file or a Marp
  deck shows the lint errors until the author runs the fix.
- Export to Marp is unchanged: it still writes Marp's own comments, so an exported bundle opens in Marp. A Lattice
  source file is no longer a Marp deck as written, and the docs no longer say it is.
