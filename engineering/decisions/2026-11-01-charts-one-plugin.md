---
status: proposed
summary: >
  Charts become one plugin with many kinds, the way Mermaid is one plugin with many diagram types, and the plugin owns
  everything about a chart: reading it (the chart grammars and models), drawing it (28 transforms, the shared kernel,
  the frame and mark CSS), narrating it in Present mode, linting it, and its docs, galleries and catalog lines. The
  engine asks; the plugin answers, through declared roles (`narrate`, `lint`) gathered by generated tables, the way
  inline kinds' `diagnose` already reaches the linter. Host knowledge (the pill pass's row records, render ids, other
  plugins) arrives through ctx; pure HTML walking joins `@laticent/markup`. chart-family, its extension point, its
  28-transform registry and the structure gate's exception go away. Lattice is pre-GA, so nothing is kept for
  backward compatibility. Owner decisions 2026-11-01: design first, land in #2997; "no settling, no jank, no broken
  windows, no tech debt; we are not GA, so we don't need to be backwards compatible."
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
| **D. Chart grammars and models the engine also reads** | (a) a package, `@laticent/chart-models`; (b) the plugin owns them and answers through declared roles; (c) leave them in `lib/core` and pass them through ctx | **(b)**. The engine reads them for two jobs that are chart knowledge: Present-mode narration (`lib/core/chart-narration.js`) and chart lint. Both become plugin roles: `narrate(figure)` and `lint` (synchronous, pure, gathered into the linter by a generated table, exactly as inline kinds' `diagnose` is today). (a) was a workaround for lint's synchronous call, which the generated table already solves; (c) is the drift the alignment audit removed |
| **E. Host knowledge a transform needs** | ctx | The pill pass's row records (`chart-rows` `RECORD_ATTR`, `matrix-grid-cells`) as ctx **data**; render-scoped ids as `ctx.section.mark(…)` (Hollywood §2 `html` row); icons through `ctx.service` (as today) |
| **F. CSS** | (a) the plugin's styles slot, kinds concatenated in catalog order, then the generated marks CSS; (b) keep the component walk | **(a)**, holding today's order: kinds, then `marks.generated.css`, then `base.print-textures.css` (`build-css.js:245-250`). The bytes of the CSS bundle must come out identical |
| **G. Lazy kernels in the Studio** | keep per-kind lazy loading | The plugin's generated kind table replaces `chart-registry.generated.js`; `tools/build-playground.js` reads that table instead of regex-parsing the registry (`build-playground.js:157-194`), and each `esm/chart-<kind>.js` still registers one kind. `chartKernelGz`/`chartKernelsGz` budgets unchanged |

## 3. What moves where

Counts measured on `claude/codebase-structure-v2`: chart code imports 34 `lib/core` modules plus the kit.

| Group | Modules | Goes to |
|---|---|---|
| Chart-only (no importer outside chart code) | `html-tables`, `flowchart-html`, `lift-bracket-span`, `legend-limits`, `status-marks`, `callout-catalog.generated` | the plugin |
| Chart grammars and models the engine reads too (narration, lint) | `bullet-facts`, `journey-step`, `kanban-sizes`, `risk-matrix-model`, `state-graph-facts`, `tower-size`, `waterfall-markers`, `axis-member`, `cell-note`, `ep-curve-model`, `gantt-pill`, `histogram-model`, `hub-spoke-model`, `chart-point`, `gantt-time`, `flowchart-grammar`, `chart-values`, `chart-status` (18) | the plugin (read by its own `narrate` and `lint` roles) |
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
`design/skills/chart-component.md` step 9, and 94 test files that name a chart path. The chart parts of `chart-narration.js` and of `lint-core.js` move with them, into the plugin's `narrate` and
`lint` roles.

## 6. No backward compatibility

Lattice is pre-GA. Nothing in this design keeps an old spelling, an old path or an old contract alive: a moved file
is moved, not re-exported; a renamed thing is renamed everywhere in the same change.

## 7. A plugin may contribute lint rules (owner decision, 2026-11-01)

**A plugin may contribute lint rules.** HARD RULE #7 says lint rules live only in `lib/authoring/lint-core.js`, and
plugin-system §4.3 says a lint rule is never a contribution point. A charts plugin that owns its lint needs both to
change; the owner approved amending both (HARD RULE #7 now reads "every lint rule runs through `lint-core.js`"). What #7 protects stays: one pure, fs-free linter shared by the CLI, `validate()` and the browser. It would
gather plugin rules through a generated table, as it already gathers inline kinds' `diagnose`, and the rules stay
pure and synchronous, on the `lintCoreGz` budget.

## References

- `engineering/decisions/2026-11-01-plugin-contract-alignment-audit.md` (Q3).
- `engineering/decisions/2026-11-01-plugin-contract-hollywood.md` §2, §2a, §7 Q2.
- `engineering/decisions/2026-09-27-plugin-system.md` §4.1, §5.
- `engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md`.
