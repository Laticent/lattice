- **Fixed: the line-ending boundary gate now exists.** `checkLineEndingBoundaries` and
  `SANCTIONED_EOL_BOUNDARIES` were cited as shipped in twelve lines across ten files —
  including the agent-facing instruction for adding a markdown ingest — and neither had ever
  been written, so `build:check` enforced nothing. The gate has six arms: a listed boundary
  that stopped normalizing (fold or BOM strip), a stale entry, a pinned normalization count
  that moved, an unlisted fold, a fold spelled so it cannot match a lone CR, and a `utf8` read
  that anchors front matter on `^---` without normalizing at all.
- **Fixed: `export-marp` and `export-chart-svg` normalize author text at their ingests.** A
  BOM'd or Windows-saved deck exported to a Marp bundle, and exported its chart SVGs, in the
  wrong palette — the two ingests #1357 missed. `export-marp` was seeded from #1388; the
  chart-SVG one had no fold for the gate's other arms to inspect and was found by the arm
  written for exactly that blindness.
- **Fixed: three more line-ending sites that could not match a lone CR.** `tier-filter.js`
  (whose `^---` test decides whether a deck has front matter, and which stripped no BOM) plus
  the decisions and gotchas index builders were folding `\r\n`, which has no `\n` to anchor a
  classic-Mac lone CR on.
