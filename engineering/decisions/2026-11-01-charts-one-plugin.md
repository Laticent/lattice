---
status: proposed
summary: >
  Charts become one plugin with many kinds, the way Mermaid is one plugin with many diagram types. Authors keep
  writing `_class: bar`; each kind keeps its own docs, gallery, catalog line and lint. The plugin owns rendering
  (the 28 transforms, the shared chart kernel, the frame and mark CSS). What the engine also reads goes where the
  Hollywood rule sends it: chart grammars and models (which present-mode narration and the linter read) become a
  package named for its job, `@laticent/chart-models`; host knowledge (the pill pass's row records, render ids,
  other plugins) arrives through ctx; the HTML walkers join `@laticent/markup`. chart-family's extension point,
  its 28-transform registry and the structure gate's one exception all go away. Owner decided 2026-11-01 (alignment
  audit Q3) to design this first and hold #2997 until it is built.
---

# Charts are one plugin with many kinds (2026-11-01)

**Answer.** Make `lib/plugins/charts/` one plugin whose kinds are the 28 charts. A kind is a folder inside the plugin
(`kinds/bar/`: its manifest block, transform, styles, docs and gallery). Authoring does not change: `_class: bar`
still picks the bar kind, and every kind keeps the docs page, catalog line and lint it has today. The plugin
**owns its rendering code**; the code the engine itself also runs moves to a package or arrives through ctx, so the
plugin imports nothing from `lib/`, and nothing in `lib/` imports the plugin.

This replaces two older records: plugin-system §5 ("each chart stays a component; its `kernel` block fills the
chart-family slot") and the Hollywood note's §2 `charts` row (reclassify chart-family as engine code).

## 1. Why

Today chart code lives in three places: 28 components (`lib/components/chart/<kind>/`), a shared kernel
(`lib/components/chart/_chart-family/`), and a dispatcher plugin (`lib/plugins/chart-family/`) whose generated
registry imports all 28 transforms (`chart-registry.generated.js:5-32`). The dispatcher is a plugin that reaches
into the engine, which is why the structure gate carries a named exception for it. Moving the dispatcher into the
engine would remove the exception but leave charts as engine code. Making charts one plugin removes it and makes
charts a capability the engine hosts, like Mermaid.

## 2. The axes

| Axis | Options | Pick |
|---|---|---|
| **A. How an author writes a chart** | (a) `_class: bar`, unchanged; (b) one `chart` class with `type: bar` | **(a)**. 28 kinds are what authors and agents choose between (one line each in `components.pick.md`); (b) breaks every chart deck for no reader benefit |
| **B. Where a kind's files live** | (a) inside the plugin, `lib/plugins/charts/kinds/<kind>/`; (b) stay in `lib/components/chart/` with the plugin owning only transforms | **(a)**. A kind's transform, CSS, docs and gallery change together; splitting them across two trees keeps the reach the move exists to remove |
| **C. How the catalog sees a kind** | (a) the plugin declares its kinds as catalog entries (`contributes.kinds`), and the catalog build reads them as it reads components; (b) a single "chart" catalog entry like Mermaid's `diagram` component | **(a)**. The catalog keeps 28 lines, so picking stays a one-line decision (HARD RULE #6 still opens the kind's docs) |
| **D. Chart grammars and models the engine also reads** | (a) a package, `@laticent/chart-models`; (b) the plugin serves them (`ctx.service('charts', …)`) and the engine asks; (c) leave them in `lib/core` and have the plugin receive them through ctx | **(a)**. They are pure (source in, data out), and the engine does its own work with them: present-mode narration (`lib/core/chart-narration.js`) and lint (`lint-core.js`, synchronous, so a service call does not fit). (c) is the drift the alignment audit just removed |
| **E. Host knowledge a transform needs** | ctx | The pill pass's row records (`chart-rows` `RECORD_ATTR`, `matrix-grid-cells`) as ctx **data**; render-scoped ids as `ctx.section.mark(…)` (Hollywood §2 `html` row); icons through `ctx.service` (as today) |
| **F. CSS** | (a) the plugin's styles slot, kinds concatenated in catalog order, then the generated marks CSS; (b) keep the component walk | **(a)**, holding today's order: kinds, then `marks.generated.css`, then `base.print-textures.css` (`build-css.js:245-250`). The bytes of the CSS bundle must come out identical |
| **G. Lazy kernels in the Studio** | keep per-kind lazy loading | The plugin's generated kind table replaces `chart-registry.generated.js`; `tools/build-playground.js` reads that table instead of regex-parsing the registry (`build-playground.js:157-194`), and each `esm/chart-<kind>.js` still registers one kind. `chartKernelGz`/`chartKernelsGz` budgets unchanged |

## 3. What moves where

Counts measured on `claude/codebase-structure-v2`: chart code imports 34 `lib/core` modules plus the kit.

| Group | Modules | Goes to |
|---|---|---|
| Chart-only (no importer outside chart code) | `html-tables`, `flowchart-html`, `lift-bracket-span`, `legend-limits`, `status-marks`, `callout-catalog.generated` | the plugin |
| Chart grammars and models the engine reads too (narration, lint) | `bullet-facts`, `journey-step`, `kanban-sizes`, `risk-matrix-model`, `state-graph-facts`, `tower-size`, `waterfall-markers`, `axis-member`, `cell-note`, `ep-curve-model`, `gantt-pill`, `histogram-model`, `hub-spoke-model`, `chart-point`, `gantt-time`, `flowchart-grammar`, `chart-values`, `chart-status` (18) | `@laticent/chart-models` |
| HTML walking, pure, used across the engine | `section-walk`, `html-lists`, `find-matching-close` | `@laticent/markup` (Hollywood §2 `html` row) |
| Pure, used by non-chart components too | `plain-text`, `bracket-list`, `label-set`, `legend`, `legend-key`, `lift-label-set` | Sorted one by one in the build by the three-question rule: text and bracket readers to `@laticent/markup`; the label-set and legend model with the chart models if only charts and the linter read them, otherwise they stay engine and their output reaches the plugin as ctx data |
| Host-dependent | `render-ids`, `plugin-services`, `chart-rows`, `checks-leading`, `matrix-grid-cells`, `axis-catalog.generated` | ctx (data or capability) |
| The shared chart kernel `_chart-family/` (axes, legends, callouts, label placement) | 21 files | the plugin, except `standalone-svg.js` and `svg-label.js`, which two tools read: they read them from the plugin's folder as build tools do |
| chart-family | dispatcher, frame CSS, fixtures | the plugin; the extension point and the generated 28-transform registry are deleted |

Reverse edges to cut: `lib/runtime/index.js:51,57` (the state-chart and flowchart layout engines) and
`lib/playground/index.js:61` (`callout-place-load`) import chart folders directly; each becomes a plugin role
(`hydrate`/`pass`) or a lazy plugin module the host loads through the plugin table.

## 4. What stays the same, and how it is checked

- Every chart deck renders byte-identical engine HTML, CSS bundle and exports (PDF, PPTX, the player). Any
  byte change is an export change and comes to the owner (QUALITY BAR).
- `lint:deck --all` output is identical.
- The 28 docs pages, galleries and catalog lines are unchanged in content.
- Route budgets: `engineJsGz`, `chartKernelGz`, `chartKernelsGz`, `lintCoreGz` do not rise.

## 5. Cost

224 files move (`lib/components/chart/**` and `lib/plugins/chart-family/**`, galleries and their PDFs included),
plus the wiring the scout listed: `build-chart-registry`, `build-css`, `build-marks-css`, `build-component-docs`,
`build-stage-catalog`, `build-playground`, `ensure-charts.ts`, the runtime and playground entries, the kit's three
docs-site importers, `structure.js`, `component-manifest.test.js` and the hand rosters in
`design/skills/chart-component.md` step 9, and 94 test files that name a chart path. A new package
(`@laticent/chart-models`, 18 modules) joins `@laticent/markup` and Segno.

## 6. Questions for the owner

1. **The package for chart models.** `@laticent/chart-models` holds pure chart grammars that narration and lint
   read. The alternative is narration and lint asking the plugin through a service, which does not fit lint
   (synchronous, on the `lintCoreGz` budget). Package recommended.
2. **One PR or two.** The owner held #2997 until charts are built. #2997 already touches 692 files against `main`;
   building charts on the same branch adds the 224 chart files and the wiring above. A second PR stacked on #2997 is barred (HARD RULE
   #17). The alternative is to land #2997 with chart-family's named exception kept for exactly one follow-up PR,
   which the owner's no-tech-debt rule argues against. Same branch recommended, as decided.

## References

- `engineering/decisions/2026-11-01-plugin-contract-alignment-audit.md` (Q3).
- `engineering/decisions/2026-11-01-plugin-contract-hollywood.md` §2, §2a, §7 Q2.
- `engineering/decisions/2026-09-27-plugin-system.md` §4.1, §5.
- `engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md`.
