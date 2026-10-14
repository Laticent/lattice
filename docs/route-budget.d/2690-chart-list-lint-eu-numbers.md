studio: +3800
playground: +1100
home: +1100
CI measured, on 92fae2e against main: Studio +3304 B, Playground +885 B and Home +886 B of eager JS, gzipped. Each declaration adds about 15% for gzip spread.
- **The Studio's lint.** The live lint is lint-core itself, and it now carries `chart-list-split-quote` (a margin `>` that ends a chart's list and drops its rows) and `chart-row-quote-unread` (a `>` under a radar series or a quadrant group, which draws no mark).
- **The row description's narrator view.** `lib/core/chart-row-detail.js` turns an indented `>` into the nested bullets the narration reads, following markdown-it's list rules.
- **The two number readers.** Segno and lib/core/chart-values.js carry the European-number guard and the ISO space-grouping collapse.
- **The hover card.** It renders a row's rich description in a shadow root styled by the deck: the stylesheet cache, the ancestor-chain copy, author-style stripping and paint containment. Every route that hosts a preview carries it, which is why Playground and Home grow by the same amount.
- **Compose.** The tight-list serializer, and the chart-slide read that heals a loose list of chart rows.
Given back first: nothing was cheaper to move. The lint must live in lint-core (HARD RULE #7, one lint kernel for the CLI, `validate()` and the Studio), and both rules share one slide scan over the boundary parser lint-core already loads. The narrator reads source without markdown-it so that the narration bundle stays small, and the card's guards are the security fixes from the adversarial review (HARD RULE #22).
