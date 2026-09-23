---
origin: 2314
priority: P3
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Move the Studio store and zip onto the spine (phase 3)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — makes a Studio zip the same folder as a repo package.
where     — docs/src/components/studio/asset-bundle.ts, library/asset-store.js, *-library.ts, Library.tsx.
done when — a zip exported from the Studio unzips to a folder the build accepts; old lattice-asset/1 zips still import.
evidence  — round-trip test: repo package -> zip -> Studio -> zip -> identical files.
verify    — unit + a real Library import/export on the Studio.
```
