---
origin: 2630
priority: P3
recorded: 2026-10-11
area: engine
severity: low
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §7
source: independent checker on #2630
---

# Route code-bundle.js's computed require of the chart registry through the dispatch table

why now   — lib/packages/code-bundle.js requires lib/plugins/chart-family/shared/chart-registry.generated.js
            through `path.join`, which no static reader follows, so the structure gate cannot see a
            layer-3 import into a plugin's folder. It predates #2630.
where     — lib/packages/code-bundle.js:45,63; lib/plugins/dispatch.generated.js.
done when — the import is static and goes through a generated table, or the reason it must stay
            computed is written beside it.
