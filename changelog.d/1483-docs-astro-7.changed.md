- The docs site now builds on astro 7.2 with `@astrojs/starlight` 0.41, replacing astro 6.3 and
  Starlight 0.39. The two can only move together — Starlight 0.41 is the first release to peer
  astro 7 — which is why #1483 sat blocked for three weeks. Nothing the Lattice package ships
  changes; the built site is the docs site only.
- `astro.config.mjs` names its Markdown processor explicitly —
  `markdown: { processor: unified({ rehypePlugins: [rehypeScrollableTables] }) }` — instead of the
  `markdown.rehypePlugins` shorthand astro 7 deprecates, and `@astrojs/markdown-remark` is now a
  direct dependency. The shorthand still works and still builds this same processor, but it does so
  by importing a package astro 7 no longer installs, which reached the tree only as a transitive
  dependency of Starlight's `@astrojs/mdx`. The WCAG 2.1.1 table tab-stop should not rest on another
  package's dependency graph. The rendered site is byte-identical across the change, all 1,427 files.
