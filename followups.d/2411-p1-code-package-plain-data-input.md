---
origin: 2411
priority: P1
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2411
---

# Hand code packages the slide's plain facts beside its HTML

```text
why now   — the owner decided "both, in two steps" (contract note §9, 2026-09-27). Today a code package receives only the engine's rendered <section>, marked provisional, so a package that DRAWS from the author's content (a Gantt chart from dates, a map from place names) has to parse our markup and breaks when it changes. Cheap while no outside package exists; expensive after code packages are documented publicly.
where     — the door's slide input in both doors: lib/packages/code-door-core.mjs (captureHook claims), lib/packages/code-shape.mjs workerScript (the frozen `slide` object), docs/src/lib/code-packages/door-run.ts and lib/packages/code-door.js; the contract in engineering/decisions/2026-09-24-code-package-contract.md §8–§9.
done when — a package's `slide` carries a stable plain-data field (text, list items, directives, token names) beside `html`; the contract names that field the stable promise and `html` the tweak surface; a package using only the new field draws in the CLI and the Studio.
evidence  — a conformance package written against the new field only, drawing in both doors with 0 requests; the 29-package parity run unchanged.
verify    — tier 2 trio (the door is a security surface).
```
