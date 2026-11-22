---
origin: 3321
priority: P2
recorded: 2026-11-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-19-deterministic-authoring-audit.md
source: https://github.com/Laticent/lattice/pull/3321
deferred: large — DECK_SETTINGS has 101 rows read by the engine, lint, the Studio and the front-matter reference page; moving it is its own PR
---

# The base manifest generates the registers, not just checks them

```text
  P2 · W5's second slice: the base manifest becomes the source the registers are built from
       why now   — #3321 declared every register in lib/base/base.manifest.json with the groups it
                   stamps, and a test holds the two lists equal. They are still written twice.
       where     — lib/core/deck-settings.js, lib/base/base.manifest.json, lib/components/index.js
                   (UNIVERSAL_GROUPS), lib/authoring/lint-core.js (list-modifier-inert)
       done when — (1) DECK_SETTINGS' register and axis rows, and the front-matter reference
                   page, are generated from the base manifest plus the plugin manifests;
                   `spark:` and `callout:` are in the result. (2) UNIVERSAL_GROUPS is retired:
                   the core set `effectiveVariants()` and the agent kit read is a flag on the
                   manifest's groups. (3) `list-modifier-inert` reads `variantKinds` (`requires`)
                   from list's manifest instead of its own word list.
       evidence  — the register test in test/unit/components/base-manifest.test.js turns into a
                   generated-file freshness check; `rg UNIVERSAL_GROUPS lib` finds no definition
```
