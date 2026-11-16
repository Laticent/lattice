studio: +66
playground: +66
home: +66
The Segno deck model gains `containers` (lists, items, quotes, tables and rows), which the lint-core rewrite's
`lattice-deck` tree nests every block in (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §10). The deck
model ships in the eager `slide-boundaries` chunk on all three routes, so the getter and its set of open-token kinds
ride there too. Nothing was given back: the reader is one range collector the model already had, extended by a branch.
