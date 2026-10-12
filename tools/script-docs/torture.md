---
group: Test & verify
---
Reusable memory/leak torture profiler (`tools/perf-torture/`): hammer a built site with repeated per-action cycles; verdict per metric (RISING via Mann-Kendall + idle-calibrated Sen slope); `--snapshot`/`--retainers` walk the heap to name the pinning GC root. `-- --scenario studio --cycle …`. On-demand diagnostic; see its README + the Scenario typedef to torture another app.
