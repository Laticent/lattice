---
group: Test & verify
---
Table-kind detection bake-off: scores five detectors, the shipped `lib/core/table-shape.js` among them, by the narrow layout each would give 225 markdown tables from this repo, against labels an independent agent wrote before any detector existed (`tools/frame-lab/bakeoff/`). Prints right-layout and right-kind rates, all tables and deck tables separately; `-- --misses` lists the shipped detector's misses. The corpus is a frozen snapshot; `test/unit/core/table-shape.test.js` holds the shipped detector to a floor on it. On-demand.
