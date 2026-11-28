# Per-layout measurement — 2026-11-20

Each layout's manifest `sample`, plus `> …` (key insight) and a trailing paragraph (below-note) or an italic-only one (annotation). Measured in Chromium by `.scratch` probes described in the parent note §2. **Engine** = `node lattice.js`. **Marp+JS** = marp-core with the kit's VS Code options, stubs and linked `lattice-vscode-min.css`, runtime loaded (VS Code security *Disable*, or marp-cli). **Marp, no JS** = the same page with no scripts (VS Code's default *Strict*). *offslide* / *covered* = the beat rendered but outside the slide or under another element, usually the sample at capacity. **JS diff** = percent of pixels that change when the runtime runs; above ~5 the layout reads as raw text without it.

| Layout | Bucket | Engine: insight · note · annotation | Marp+JS: insight · note · annotation | Marp, no JS: insight · note · annotation | JS diff |
|---|---|---|---|---|---|
| `closing` | anchor | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 4.7% |
| `divider` | anchor | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 3.7% |
| `title` | anchor | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 5.1% |
| `topic` | anchor | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 1.4% |
| `code` | code | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 43.2% |
| `compare-code` | code | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 30% |
| `compare-prose` | comparison | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 5.9% |
| `decision` | comparison | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.7% |
| `matrix-2x2` | comparison | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 5.7% |
| `pricing` | comparison | panel · note · annotation | panel · note · annotation | plain quote · body text, offslide · CSS spark only | 9.7% |
| `redline` | comparison | plain quote · note · annotation | plain quote · note · annotation | plain quote · body text · CSS spark only | 16% |
| `split-compare` | comparison | plain quote · body text · body text | plain quote · body text · body text | plain quote · body text · body text | 39.9% |
| `table` | comparison | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 5.6% |
| `verdict-grid` | comparison | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.1% |
| `contact` | connect | dropped · dropped · dropped | dropped · dropped · dropped | plain quote · body text · body text | 7.5% |
| `gift-card` | connect | dropped · dropped · dropped | dropped · dropped · dropped | plain quote · body text · body text | 9.8% |
| `wifi` | connect | dropped · dropped · dropped | dropped · dropped · dropped | plain quote · body text · body text | 7.1% |
| `diagram` | diagram | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 8.7% |
| `kpi` | evidence | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 5.2% |
| `stats` | evidence | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 4.5% |
| `collage` | imagery | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 4.5% |
| `image` | imagery | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 4.9% |
| `scene` | imagery | panel · note · annotation | panel · note, offslide · annotation, offslide | plain quote, offslide · body text, offslide · CSS spark only | 63.5% |
| `video` | imagery | panel, offslide · note, offslide · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 9.2% |
| `actors` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 7.4% |
| `agenda` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 5.2% |
| `cards-grid` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.1% |
| `cards-stack` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.4% |
| `checklist` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 25.2% |
| `glossary` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 4.4% |
| `inventory` | inventory | plain quote, covered · note · annotation | plain quote, covered · note · annotation | plain quote · body text · CSS spark only | 6.6% |
| `list-tabular` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 4.7% |
| `list` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.6% |
| `logo-wall` | inventory | panel · note · annotation | panel · note · annotation | plain quote, offslide · body text, offslide · CSS spark only | 5.3% |
| `q-and-a` | inventory | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 4.2% |
| `team-profile` | inventory | panel · note · annotation | panel · note · annotation | plain quote, offslide · body text, offslide · CSS spark only | 9.6% |
| `columns` | layout | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 8.9% |
| `rows` | layout | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 5.8% |
| `authority-chain` | legal | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 9.8% |
| `citation-card` | legal | plain quote, covered · note · annotation | plain quote, covered · note · annotation | plain quote · body text · CSS spark only | 9.3% |
| `obligation-matrix` | legal | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 9% |
| `policy-recommendation` | legal | plain quote · note · annotation | plain quote · note · annotation | plain quote · body text · CSS spark only | 30.8% |
| `regulatory-update` | legal | panel · note · annotation | panel · note · annotation | plain quote, offslide · body text, offslide · CSS spark only | 10.8% |
| `statute-stack` | legal | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 8% |
| `math` | math | plain quote · body text · body text | plain quote · body text · body text | plain quote · body text · body text | 4.3% |
| `cycle` | progression | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.1% |
| `list-steps` | progression | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 6.4% |
| `big-number` | statement | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 2.2% |
| `content` | statement | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 3.4% |
| `premise` | statement | panel · note · annotation | panel · note · annotation | plain quote · body text · CSS spark only | 9.3% |
| `quote` | statement | plain quote · body text, offslide · body text, offslide | plain quote · body text, offslide · body text, offslide | plain quote · body text · body text | 2.6% |
| `split-panel` | statement | plain quote · body text · body text | plain quote · body text · body text | plain quote · body text · body text | 47.1% |
| `bar` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 11.9% |
| `bullet` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 18.7% |
| `ep-curve` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 9.9% |
| `flowchart` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 11.9% |
| `funnel` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 7.5% |
| `gantt` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 19.7% |
| `heatmap` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 28.8% |
| `histogram` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 26% |
| `hub-spoke` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 18.5% |
| `journey` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 15.8% |
| `kanban` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 4.8% |
| `line` | chart | panel · body text · body text | panel · body text · body text | plain quote, offslide · body text, offslide · body text, offslide | 7.5% |
| `map` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 14.4% |
| `matrix-grid` | chart | panel · body text, covered · body text, covered | panel · body text, covered · body text, covered | plain quote · body text · body text | 12.8% |
| `piechart` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 14.4% |
| `progress` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 14.9% |
| `quadrant` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text, offslide · body text, offslide | 9.5% |
| `radar` | chart | panel · body text · body text | panel · body text · body text | plain quote, offslide · body text, offslide · body text, offslide | 7.1% |
| `risk-matrix` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 17.6% |
| `roadmap` | chart | panel · body text, covered · body text, covered | panel · body text, covered · body text, covered | plain quote · body text · body text | 16.7% |
| `scatter` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 9.3% |
| `slope` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 7% |
| `stacked-bar` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 16.8% |
| `state-chart` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 12.5% |
| `timeline-list` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 7.7% |
| `tower` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 22.1% |
| `waterfall` | chart | panel · body text · body text | panel · body text · body text | plain quote · body text · body text | 9.5% |
| `word-cloud` | chart | panel · body text · body text | plain quote · body text · body text | plain quote · body text · body text | 7.2% |
