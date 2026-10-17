---
origin: 2749
priority: P3
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6
---

# Move in-tree plugins that run code in the viewer's browser or in Node onto the sandbox model.

why now   — the owner decided on 2026-10-17 that one model applies to every plugin: it renders in
            the sandbox, returns a fragment, and the host sanitizes and shows it. Mermaid does not
            follow it today: its `bake` runs in a Node-driven page and its `hydrate` runs
            `mermaid.min.js` in the exported file's browser, both outside the sandbox.
where     — lib/plugins/mermaid/mermaid.manifest.json (`hydrate`, `bake`, `payload`);
            lib/plugins/math/math.render.js (loads KaTeX into the engine's Node process); lib/plugins/function-plot/ (hydrate + payload); lib/core/code-sandbox.js;
            engineering/decisions/2026-09-27-plugin-system.md §4.7 and §4.10.
done when — a list of every in-tree plugin that ships `hydrate`, `payload` or `bake`, with a
            migration plan or a recorded exception for each; no new plugin ships browser code.
evidence  — the list, produced by grepping every `*.manifest.json`; the cost of moving mermaid
            measured before the plan is chosen (diagram quality, export size, offline use).
verify    — tier 2 checker; mermaid is shipped output, so an export change needs owner sign-off.
