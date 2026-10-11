---
status: shipped
summary: lib/ was one 13-part import loop and the docs site a 5-part one; both are now acyclic layers, plugins reach the engine only through lib/plugin-kit and generated tables (chart-family excepted, by name), and build:check holds it with tools/structure.js.
---

# Codebase structure: layered parts and a plugin boundary (2026-10-11)

**The answer.** Lattice looked like many parts but behaved as two lumps. Eleven `lib/` folders,
plus two plugins, could each reach every other through imports. The docs site's shared library,
UI kit, playground, components and Studio did the same. A loop like that has no bottom: nothing in
it can be built, tested, versioned or moved on its own, which is why `lib/` could not be released
in pieces. About 20 import lines held each loop together (21 in `lib/`, 23 in the site, on the
tool's first run). Each now points down a layer, and `build:check` fails on a new loop, a new upward import or a broken
plugin boundary (`tools/check-structure.js`).

The owner set the shape on 2026-10-11, in one round:

- **One engine package with enforced layers**, not a split into many npm packages now. A layer
  can become its own package later, once a real consumer needs one.
- **A plugin boundary**, because plugins are meant to move to npm (plugin-system phase G,
  `2026-09-27-plugin-system.md` §7).
- **The gate in build:check.** Asked at 5.7s per run. The trio measured the first version at 8–11s
  on a loaded sandbox, and found it also ran on every plain `npm run build`. It now runs only in
  `build:check` (pre-push and CI), with dependency-cruiser's cache: 6.6s on a cold run (a fresh CI
  checkout) and 1.2s on a warm one, measured on an idle 4-core sandbox.
- **Untangle the site too**, not just measure it.
- **This structure work first**, and the release pipeline (slice C, `2026-10-07-first-npm-release.md`
  §8) after it, in its own PR.

## 1. Words this note uses

- **Part**: a folder that should make sense on its own, such as `lib/core`, one plugin, one
  workspace library or the Studio. `PARTS` in `tools/structure.js` is the map.
- **Layer**: a part's height. A part may import parts on its own layer or below.
- **Loop**: a group of parts that can each reach the others. Its formal name is a strongly
  connected component, found with Tarjan's algorithm.
- **Ca / Ce**: how many other parts import this one (afferent coupling), and how many it imports
  (efferent coupling).
- **Instability** I = Ce / (Ca + Ce): 0 for a part everything leans on, 1 for a part nothing does.
- **Cohesion**: the share of a part's imports that stay inside it. A part at 0.9 mostly talks to
  itself; a part at 0.1 is mostly glue between other parts.
- **Seam**: a file a build step generates under `lib/` from the parts above, for the parts below to
  read by name: the plugin registries, the pane and coda catalogs, the reserved-class list. That is
  how a lower layer learns about a higher one without importing it, so imports through a seam are
  exempt from the layer and loop rules. The file name alone does not make a seam, or any file called
  `x.generated.js` would bypass every rule (the red team built exactly that). A generated JSON file
  is pure data and imports nothing, so it is a seam. A generated JS file is one only if its header
  names a `tools/` script that exists and whose source names the file. Through the registries the
  engine is still wired to its plugins at runtime, by design: the gate holds source-level
  dependencies, not runtime reachability.

## 2. What we measured first

`npm run quality` already existed, but it ran in no CI job and no hook, it excluded `docs/`
entirely, and its committed baseline was stale: it records 64 functions over the complexity
threshold, and the tree has 663. The folder rules in `.dependency-cruiser.cjs` therefore enforced
nothing, which is how the loop grew unnoticed. `tools/structure.js` reads the whole tree at the
level of parts. Its first run, on `f2e80a4b8`:

| Signal | Before | After |
|---|---|---|
| Part loops | 2: 13 parts in `lib/` (11 folders + chart-family + math), 5 in the site | 0 |
| Upward imports | 42 | 0 |
| Plugin imports past the kit | 26 | 0 |
| Imports into a plugin's folder from outside | 8 | 0 |

Change coupling over 1,006 commits since 2026-07-01 agreed with the graph. `lib/core` changed with
`lib/runtime` in 80% of the commits that touched either, with `lib/integrations` in 79% and with
`lib/engine` in 77%. Studio and the site's shared library changed together 91% of the time. The
ten workspace libraries were already good parts: 90–100% cohesion, and each depends on at most one
other part.

## 3. The layers

| Layer | Parts | What lives there |
|---|---|---|
| 0 | the ten `@laticent/*` libraries, `lib/adaptive`, `fonts`, `finishes`, `exemplars`, `typography`, `motion`, `lib/schemas` (every `*.schema.json`) | leaves: they import nothing of ours |
| 1 | `lib/core` | the pure building blocks |
| 2 | `lib/theme`, `tokens`, `integrations` | contracts over core |
| 3 | `lib/components`, `forms`, `layout`, `packages`, `plugin-kit` | the catalog, the package format, and what a plugin may use |
| 4 | `lib/plugins` (host) and each `lib/plugins/<name>`, `lib/transformers` | adapters and plugins |
| 5 | `lib/engine` | assembles the render pipeline |
| 6 | `lib/authoring`, `cli`, `concepts`, `diagnostics`, `export`, `playground`, `runtime` | what uses the engine |
| 7 | `lattice.js` | the command line |
| 9–16 | site: bundles, `docs/src/lib` and styles, `ui`, `playground`, components, Studio, Craft lab, pages | the docs site, on top of the engine |
| 20 | `tools/` | build and gate scripts, which may import anything |

## 4. What moved in `lib/`

Half the edges were files filed in the wrong folder: foundation code with no dependencies of its
own, sitting in a high folder, so everything that used it appeared to reach up. The other half were
real inversions.

- **Into `lib/core`**: `theme/color.js`, `engine/sizes.js`, `plugins/services.js` (now
  `core/plugin-services.js`), and the four code-door kernels from `lib/packages`.
- **Beside its one user**: `engine/qr.js` is now `components/connect/_qr-card/qr.js`.
- **Into `lib/export`**: export-to-Marp (`marp-bundle*.js`, `marp-fidelity.js`).
- **Into `lib/cli`**: the package commands (`cli.js` is now `cli/packages.js`; also
  `package-render.js`, `package-gate.js`, `gallery-gate.js`). `lib/packages` is now the package
  format alone, on layer 3.
- **Into `lib/engine`**: `structural-split.js`. Only the CLI and the playground call it, and it
  runs the masthead transform, which sits on layer 3.
- **A new `lib/core/list-shapes.js`**: the component catalog imported ten pure list-shape
  detectors from the linter, and the linter imported the catalog. The detectors moved below both.
  `lint-core.js` re-exports them unchanged, so every lint rule still lives there (HARD RULE #7).

## 5. The plugin boundary

A plugin that will publish on npm can depend only on what we publish beside it. So a plugin
(`lib/plugins/<name>/`) imports only its own folder and **`lib/plugin-kit/`**, and nothing outside
a plugin imports its folder except the generated tables.

**One plugin is excepted by name.** chart-family is the chart bucket's dispatcher: its generated
registry (`shared/chart-registry.generated.js`) names all 24 chart components' kernels, so it cannot
leave the repo without them. It is in-tree by nature, and `SANCTIONED_PLUGIN_REACH` in
`tools/structure.js` admits its reach into `lib/components` with that reason. A seam inside a plugin
folder exempts nothing: the first version of the gate let this registry pass silently, and the trio
caught it. The plugins meant to move to npm are the others: math, Mermaid, function-plot, icons and
anima.

**The kit is in-tree scaffolding, not yet phase G's public API.** The plugin-system contract
(`2026-09-27-plugin-system.md` §4.6) says a plugin reaches the engine only through `ctx`, and
`spec/LPM.md` does not mention the kit. The kit records exactly what plugins import today, so that
lib/core can change behind it, but three parts of it are not fit to publish. `plugin-data.js` holds
module-level state: two copies would silently disagree. `payload-path.js` assumes the repo's
folder layout. And `charts.js` re-exports `_chart-family` internals, which serves only the in-tree
plugin. Choosing between `ctx` and a published kit is the owner's call before phase G
(`followups.d/`).

The kit has one small module per concern, and each names exactly the functions plugins use today:
`html.js`, `charts.js`, `slots.js`, `diagram-theme.js`, `deck-walk.js` and `fonts.js`. It also holds
the two contract files that were host-side, `plugin-data.js` and `payload-path.js`. It is split by
concern, not one index file, for a measured reason: Mermaid's hydrate step ships in the browser
runtime, and an index that also exported the slide walker would have pulled the whole boundary
parser into that bundle. 

Kernels that only one plugin used moved into that plugin: `render-diagrams.js` and
`diagram-scope.js` to `mermaid/shared/`, and `tex-linebreak.js` to `math/shared/`.
`slide-class-spans.js` and `diagram-band.js` stayed in core, because moving them would have dragged
13 core dependencies into the plugin's surface.

The eight imports into a plugin's folder, and Mermaid's one import out of its folder into the
engine, each now go through a mechanism that already existed, or one small generated table:

| Was | Now |
|---|---|
| `transformers/chart-family.js` → the chart-family dispatch | a new generated `lib/plugins/dispatch.generated.js` |
| `export/marp-bundle-math.js` → `math.render.js` | the plugin registry, which hands back the same renderer objects |
| five docs files → `math.syntax.mjs` `sourceHasMath` | math's `detect` from the generated grammar: the same function |
| `lattice.js` → Mermaid's `motion-roles.js` | the bake publishes `state.motionTagger`; the player capture runs every published tagger |
| `mermaid.bake.js` → `engine/index.js` | a generic `paneOrientations` bake service, which `lattice.js` supplies |

## 6. The site

- `single-slide-render.ts` lived in `docs/src/lib` but imported nine playground modules. It moved
  into `docs/src/playground` with its eleven tests, and joined the stylesheet-sink census
  (HARD RULE #22) now that it sits under a scanned root.
- Pure modules with no dependencies moved down into `docs/src/lib`: `front-matter`,
  `slide-directives`, the deck lint (`studio/lint.ts`, now `lib/deck-lint.ts`), `mode-catalog`,
  `architect-knowledge`, `render-metrics` and `editor-diagnostics`.
- The lesson list split from the Studio's lesson loader into `lib/lesson-catalog.ts`, so the
  command menu searches lessons without reaching into the Studio.
- The Craft lab builds on a Studio widget (the code field), so it sits on its own layer above the
  Studio.
- The docs front-matter reference (`FrontMatterReference.astro`) read the Studio's completion
  tables. The front-matter keys and value lists moved down into `docs/src/lib`. This loop was
  invisible until the gate learned to read `.astro` files.
- The math plugin's browser KaTeX provider moved into `lib/plugins/math/shared/`, and a prototype
  page reaches chart-family through the dispatch table. Both edges were hidden before: the
  provider's import of the vendored KaTeX fell inside an excluded `vendor/` path.

## 7. What the gate does and does not see

- It reads `lib/`, `lattice.js`, `docs/src` and `tools/` through dependency-cruiser, with the docs
  site's `@/` alias and the libraries' `@laticent/source` condition resolved
  (`tools/structure.tsconfig.json`). It reads the imports in every `.astro` file's front matter
  itself, since dependency-cruiser does not.
- **It fails on a file it could not read.** dependency-cruiser exits 0 on a parse error and reports
  the file with no imports, which would hide its edges, so a file listed with none whose source has
  some is a problem.
- **It cannot see a computed path.** `lib/packages/code-bundle.js` reaches the chart-family registry
  through `path.join`, which no static reader follows; that edge predates this work.
- **Type-only imports count.** A type is coupling at design time even when it vanishes at runtime.
- **Tests, e2e specs and built output are left out.** They are not part of the structure. Vendored
  library copies are recorded as import targets but never parsed.
- **A file in no part fails.** A new folder under `lib/` or `docs/src/` must be placed on a layer
  before it merges. `tools/` is one part, so a new folder there joins it.
- Per-part size, coupling and cohesion are a record (`test/quality/structure.json`, refreshed by
  `npm run structure:bless`), not a gate. They move with every honest change, and gating them
  would tax good work.

## 8. What this does not fix yet

These are measured, not guessed, and none of them blocks anything:

- **`lib/core` is large, and it is the gate's easiest way out.** Same-layer imports are free, and
  the cheapest fix for an upward edge is "move it into core", which is how §4 fixed half of them.
  Core is 223 files and 58,797 lines, imported by 23 parts. Its 89% cohesion says only that core
  rarely imports leaves; a layer-1 part scores high by construction. Measured inside, it is **61
  islands** (groups of files with no import between them; the largest is 136 files, and 49 files
  stand alone), and **34 files have exactly one importer, in one other part**. `npm run structure`
  now prints both numbers for every part of 50 files or more. The rule from here: a file moves down
  only when two or more parts use it; otherwise it goes beside its one user, as `qr.js` did. The
  core split, and moving the 34, are follow-ups. `site/lib` shows the same pattern early: 57
  islands across 95 files.
- **Some parts are glue, not parts**: `lib/integrations` and `lib/plugin-kit` (cohesion 0.00, by
  design for the kit), `lib/runtime` (0.03) and `lib/cli` (0.07) are thin shells over the parts
  below them. That is honest for a facade or a composition root. It is worth a look anywhere else.
- **`npm run quality`'s baseline is stale**, and its folder rules duplicate what this gate now
  enforces. Re-bless it, or fold its boundary rules into `tools/structure.js`. That is an owner
  call, because it changes what an on-demand check reports.
- **The Studio is 252 files and 73,802 lines in one part.** It is a leaf, nothing imports it, so
  its size costs only itself. It would be the place to look if the site ever needs splitting.

## 9. Verification

- **Gates on every commit:** lint, `npm run build`, the root unit suite, the docs typecheck and the
  docs test suite (404 files, 6,193 tests).
- **The moves change no behavior.** The independent checker rendered all 266 decks in `examples/`
  and `test/integration/baseline-decks/` through `main`'s engine and this branch's: identical
  output, byte for byte, and identical lint findings. The red team exported a `motion: on` Mermaid
  deck and `examples/panes-mermaid.md` with `--player` on both trees: identical apart from the
  timestamp. The registry and grammar routes return the identical objects (checked with `===`).
- **The gate fails on each shape it exists to catch:** `test/unit/tools/structure.test.js`,
  including the seam bypass the red team built.
- **The trio** (red team, Munger inversion, independent checker) reviewed the branch. Every finding
  is fixed above or recorded in `followups.d/`.
