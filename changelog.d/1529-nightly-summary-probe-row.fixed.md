- **Fixed: the integration nightly's summary no longer drops a gate's per-row
  failure line.** Both the job summary and the rolling issue body build their
  "what failed" block by grepping the report for failure markers, and the list
  knew only markers that start a line or carry a count. `check-family-tiers`'s
  probe half reports as a table — one row per `@size`, with the verdict inside the
  row — so its `FAIL (want …)` line matched nothing and the issue carried a bare
  `1 FAILURES` with no indication of which tier broke. `FAIL (want ` is now in the
  pattern at both sites.
