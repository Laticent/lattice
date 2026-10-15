- **Changed: the route budget watches the code that loads on demand.** Two new metrics on the
  Studio route in `docs/route-budget.json`: `chartKernelGz`, the largest chart kernel beyond the
  engine (chart-map, 77.4KB gzipped), and `lintCoreGz`, the lint core beyond the Studio's startup
  JavaScript (181.7KB gzipped). Each has a soft target and a 10% ceiling, so a kernel or the lint
  core growing past it fails the docs build.
