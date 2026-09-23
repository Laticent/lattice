---
origin: 2314
priority: P4
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Move themes into themes/<name>/ folders (phase 5) and seed a motion library

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — the owner chose one shape for every kind.
where     — themes/ (70 files), ~67 source files that reference theme paths, package.json exports remap ./themes/*.css -> ./themes/*/*.css; lib/motion/.
done when — no flat theme remains, the published import path still resolves, and example motion ships as packages.
evidence  — require.resolve of @laticent/lattice/themes/indaco.css from a packed tarball.
verify    — build:check + integration.
```
