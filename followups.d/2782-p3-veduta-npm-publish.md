---
origin: 2782
priority: P3
recorded: 2026-10-19
area: veduta
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2782
---

# Publish @laticent/veduta to npm after the Playground adopts it unchanged.

```text
  why now   — ruled: library trappings now, publish later. @laticent/fuoco is not on npm either,
              so the publish path is shared work.
  where     — docs/src/lib/veduta/package.json (AGPL-3.0-only), RELEASE.md.
  done when — a release publishes the package and the catalog status line changes.
  evidence  — an install of the published tarball in a clean directory.
  verify    — tier 0.
```
