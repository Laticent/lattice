---
group: Lint & audit
---
Truth gate for the manifest `render` field: renders every visualization component's own gallery through the export path (CLI HTML sidecar, mermaid baked) in headless Chromium, derives whether the picture is actually drawn in SVG / HTML / both, and fails when a declaration disagrees. `--report` prints the derived table, `--json` the raw counts. Skips loudly with no Chromium.
