---
origin: 2630
priority: P3
recorded: 2026-10-11
area: engine
severity: low
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §7
source: independent checker on #2630
deferred: off-path — predates #2630 and #2997; the fix changes how the code-package bundle is assembled, so it needs its own byte check of the bundle
---

# Route code-bundle.js's computed require of the chart registry through the dispatch table

why now   — lib/packages/code-bundle.js requires lib/plugins/chart-family/shared/chart-registry.generated.js
            through `path.join`, which no static reader follows, so the structure gate cannot see a
            layer-3 import into a plugin's folder. It predates #2630.
where     — lib/packages/code-bundle.js:45,63; lib/plugins/dispatch.generated.js.
done when — code-bundle.js finds each kind's file from the kinds' manifests (lib/components/index.js
            `componentDir`) instead of the registry's source text, and the computed path is gone. The reason
            it is computed today is written beside it (#2997).
