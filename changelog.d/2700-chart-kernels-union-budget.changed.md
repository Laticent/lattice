- **Changed: the route budget watches every chart kernel, not only the largest.** A new
  Studio metric in `docs/route-budget.json`, `chartKernelsGz`, counts the union of all 24 chart
  kernels beyond the engine (195.6KB gzipped) with a 10% ceiling. Before this, a kernel smaller
  than chart-map could grow unseen until it overtook map. Now about 19.6KB of growth in any
  kernel fails the docs build.
