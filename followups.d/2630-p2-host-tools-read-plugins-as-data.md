---
origin: 2630
priority: P2
recorded: 2026-10-31
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 (one model for every plugin)
source: engineering/decisions/2026-10-11-codebase-structure.md §5
deferred: large — about 60 members across 8 plugins become manifest data, generic slot-driven host code or sandboxed calls; lint findings are shipped behavior and need their own review, and #2630 changes no behavior
---

# Host tools read a plugin through its manifest, not its code: empty every `hostApi` list

why now   — the owner's one-model decision (2026-10-17, followups.d/2749-…) says every plugin renders
            in the sandbox, returns a fragment, and the host sanitizes it. A third-party plugin is never
            imported by the host (npm-plugin-loader.js G5), so the linter and the inline editors can
            only support it through what its manifest declares (an inline kind's `slot` today). The
            first-party plugins are still read by CODE: lint-core, inline-editors, prose-budgets,
            review-core, bare-row-pill and code-format call their kernels, the Marp export calls the
            code and video plugins, and the Studio's export calls Mermaid's helpers. #2630 lets that
            through only for files a manifest lists in `hostApi` (tools/structure.js), and the gate
            fails on any import outside the list, on any entry nothing imports, and on the lists
            holding more files than `HOST_API_CEILING` (lower it with each entry emptied).
where     — the `hostApi` lists in lib/plugins/{pills,checks,sparks,avatars,icons,video,code,mermaid}/
            *.manifest.json; their importers (`npm run structure` names each one); the inline door's
            slot reading (lib/cli/code-door.js `inlineFields`, docs/src/lib/code-packages/door-run.ts),
            which already treats a third-party kind as data.
done when — no manifest has `hostApi`, the field is deleted from plugin.schema.json, and the gate's
            `viaHostApi` rule and `HOST_API_CEILING` are gone. Each member a host tool uses today becomes one of:
            · manifest DATA: vocabularies and constants (pill SHAPES/COLORS/SIZES, spark TYPES and
              SERIES_TYPES, avatar TRAIT_ORDER, check SPEC, code INDENTS and deck defaults);
            · GENERIC host code driven by the declared slot: read, edit, the element an editor shows
              (pills `resolve`/`editPill`/`pillElement`, sparks `read`/`editSpark`, checks `read`,
              icons and avatars `read`), as the door already does for a third-party kind;
            · a sandboxed call, for behavior that must stay the plugin's (Mermaid's init directive and
              label measure, the code plugin's shell grammar and Marp rewrite).
            Then a third-party inline kind gets the same lint, completion and editor as `pills`.
evidence  — the gate's report before and after; the authoring tests (lint, inline editors, code-format)
            unchanged; the docs route budget, since moving vocabulary into manifests changes what the
            Studio's eager chunk carries.
verify    — tier 2 checker. Lint findings are shipped behavior: any finding that changes stops for the
            owner.
