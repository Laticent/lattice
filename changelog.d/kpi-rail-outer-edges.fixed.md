- **Fixed: `kpi` draws a rule between its rows, never around them.** The support
  rail bracketed itself — a heavy rule above the first support and another below
  the last — and `compliance` carried the same defect one modifier over, a border
  under every row plus a heavy one under the last. Those are outer edges, not
  separators; `2026-09-03-table-outer-edge-rules.md` retired the same thing across
  the table family and `inventory` had already dropped it from its own ledger.
  Interior separators are unchanged at 1px `--border`. At `tall` and `strip`, where
  the rail linearizes into one ledger, the demoted hero loses the same outer top
  edge and the first support gains the separator that now divides it from the lead
  row.
- **Fixed: the `kpi compliance` status pill reaches the right edge of its row.**
  The pill declared `grid-column: 3` but sat one level too deep to be a grid item,
  so the reserved track resolved to 0px and the pill trailed its meta text — 65-67%
  of every row empty. The meta line is now a flex row that pushes the pill to the
  row's edge; a row's ink goes from 274.8px wide to 1026.3px.
- **Fixed: `kpi spotlight` supports sit under the rule that heads them.** Each
  support centered in a row taller than its content, stranding its own hairline
  37.3px above the number it introduces.
- **Fixed: `kpi trajectory` sizes its columns to the metrics authored.** The grid
  was pinned at four, so a 3-metric slide — the count the docs recommend — left an
  empty 270px track, 23% of the stage.
