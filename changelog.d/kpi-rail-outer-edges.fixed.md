- **Fixed: the `kpi` support rail draws a divider only BETWEEN its rows.** The
  rail bracketed itself — a heavy rule above the first support and another below
  the last — so three numbers read as a closed table frame. Those two are outer
  edges, not separators, and `2026-09-03-table-outer-edge-rules.md` retired the
  same thing across the table family; `inventory` had already dropped it from its
  own ledger citing that record. Affects the bare/`briefing` default, `attention`
  and `spotlight`. Interior separators are unchanged at 1px `--border`; the 1.5px
  `--text-heading` weight existed only on the two edges now removed. At `tall` and
  `strip`, where the rail linearizes into one ledger, the demoted hero loses the
  same outer top edge and the first support gains the separator that now divides
  it from the lead row.
