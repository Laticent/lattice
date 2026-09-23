---
origin: 2314
priority: P2
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Build the package spine core (phase 1 of 2026-09-23-portable-packages.md)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — every later phase stands on it.
where     — new lib/packages/ (kinds, read, write, index); manifest `type`/`format` fields + schemas; identity gate for all kinds in tools/check-ownership.js; packages.generated.json.
done when — themes and components are discovered through the spine, one generated index exists, and the identity gate covers every kind.
evidence  — the identity gate's failing arm (a renamed folder) caught in a unit test.
verify    — unit + build:check; maker-checker (engine kernel).
```
