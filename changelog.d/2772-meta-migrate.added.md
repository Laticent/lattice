- **`lattice migrate meta <deck.md>` rewrites a deck's directive comments as slide records.** Each slide's comments
  become one record per scope on the same lines, so nothing below them moves: `<!-- _class: cards-grid dark -->` and
  `<!-- _footer: Q3 -->` become `<!-- {layout=cards-grid, class=dark, footer=Q3} -->`. A class that opens with a component is
  written as the typed `layout=` field. `--check` writes nothing and exits 1 when a deck would change; line endings and a
  byte-order mark are kept. A directive inside a list item or a blockquote is left as written and named, because a
  record there is not read. (`lib/cli/migrate-meta.mjs`, `lib/cli/meta-migrate.mjs`)
