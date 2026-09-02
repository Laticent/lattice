- **Changed: `engineering/development.md` now records what the `@visual` baselines' margin
  actually is.** The sandbox re-renders all three of them pixel-identically, at zero
  per-pixel tolerance, so the whole `maxDiffPixelRatio: 0.01` is available for the
  sandbox-to-CI divergence. The CI-side half stays unmeasured, with the reason written
  down: a passing `toHaveScreenshot` emits no comparison image, and neither way of running
  these specs in CI is free of a cost outside the change.
