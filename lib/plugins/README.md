# lib/plugins — the plugin host

A **plugin** teaches Lattice something new — a syntax, a fence — that works on any slide, as one
folder with a manifest. A **component** (a slide class) may be designed around a plugin; the
component declares that dependency, and a plugin never names a component. The design, the decisions behind it and the order the rest of the integrations move in
are `engineering/decisions/2026-09-27-plugin-system.md`; the contract a plugin is written against is
`spec/LPM.md` (draft); this file is the working guide. Start a new plugin with
`lattice packages new plugin <name>`, which writes a folder that builds and passes the harness.

**Shipped plugins:** `math` (`$…$`, `$$…$$`, ` ```math `; the `math` slide class requires it),
`function-plot` (` ```functionplot `, drawn in the browser; `math` lists it as optional), `anima`
(` ```anima `; the `scene` slide class requires it) and `mermaid` (` ```mermaid `, drawn by the
runtime in a browser and by its bake on the CLI; the `diagram` slide class requires it) and
`chart-family` (the `kernel` extension point every chart fills; see "Extension points" below).

## A plugin is a folder

```
lib/plugins/<name>/
  <name>.manifest.json    required — what it contributes; validated by plugin.schema.json
  <name>.docs.md          required — the author's contract (HARD RULE #6)
  <name>.fixtures.md      required — the conformance cases the harness runs
  <name>.syntax.mjs       the GRAMMAR: markdown-it rules + detect(source). Pure; no library imports
  <name>.render.js        the RENDERERS: what each token and fence becomes. May load a library (math loads KaTeX)
  <name>.hydrate.js       the BROWSER half: hydrate(el, ctx) draws one placeholder. Self-contained.
                          Or, with render.exec.hydrate "pass", createPass(ctx): a document pass the
                          runtime drives (Mermaid's), bundled and never serialized
  <name>.bake.js          the CLI half: bake(source, ctx) draws the figures into the Markdown. Node-side
  <name>.highlight.js     highlight(hljs): a highlight.js grammar for the plugin's code fences
  <name>.dispatch.js      the module that calls an extension point's fillers (the chart family's
                          section dispatch and chart frame). Shipped exactly when the plugin offers a slot
  <name>.styles.css       token-only CSS, bundled into the plugin slot of dist/lattice.css
  shared/                 the plugin's own shared modules (.js/.cjs/.mjs, and a README.md) that its
                          role modules import — Mermaid's init directive, render worker, reorientation
                          and motion roles. IN-TREE ONLY: the one subfolder the plugin kind admits
                          (lib/packages/kinds.js `plugin.codeDirs`); the importers read top-level
                          files only, so a zip's copy is dropped, never installed
```

The grammar and the renderers are separate files on purpose: the boundary parser and the docs
site's pre-scan need the grammar without the library behind it.

## What loads a plugin

Every plugin is loaded **explicitly**, and the host decides it once per render, from the deck's
source (`host-grammar.mjs` `admitPlugins`; plugin-system §9 decisions 6 and 9):

- **the default set** — every shipped plugin, so a deck that lists nothing renders as it always
  did. A host may narrow it: `createEngine({ plugins: { defaults: [] } })`.
- **the deck's `plugins:` list** — an import list in the front matter, `plugins: [math, mermaid]`.
  It only adds: listing a default plugin changes nothing, and there is no removal syntax. A name
  no plugin has is a render diagnostic (`plugin/unknown-plugin`) and a `lint:deck` warning
  (`unknown-plugin`). `deck-plugins.mjs` is its one reader and writer; the Studio's Plugins tab
  (deck settings) writes it.
- **a component that requires it** — a slide class whose manifest declares
  `plugins: { requires: [...] }` loads those plugins for any deck that uses the class.

A loaded plugin loads what it `requires`. The host's `disabled` switch then turns a plugin off
whatever loaded it. Using a plugin's syntax loads nothing: `usesPlugin` (its `detect`, its fence
names) decides only when a loaded plugin's payload loads and its bake runs — and warns
(`plugin/used-not-loaded`) when the deck uses a plugin no route loaded.

**The browser half follows the engine's markup.** A fence the plugin draws later (`as: "code"`)
renders as the same code block either way, so for a deck that did not load the plugin the engine
marks its `<pre>`: `data-lattice-off="mermaid"`. The runtime's pass, the drawn-fence probes
(`drawn-probe.mjs`) and the preview's ink-withholding rule all skip a marked `<pre>`, so every
surface that shows the engine's render — the Studio's preview and export, `--fluid`, `--player` —
draws nothing of that plugin. Admission is deck-wide, so the Studio's one-slide renders take the
whole deck's answer (`LatticePlayground.pluginAdmission`). Two readers that do not run the engine follow it too: an Export-to-Marp bundle (Marp renders it)
records the plugins its producer left off in its settings block, `pluginsOff`, and the bundled
runtime marks them before any pass (`mark-off.mjs`); the Studio's lint and slide mapping point their
boundary parser at the deck's `off` set first (`docs/src/lib/plugin-admission.ts`), and so does the
Playground page's lint (`docs/src/playground/editor.js`), which re-lints when the host changes its
defaults. An author's raw HTML is held to the same answer (`author-markup.js`): the host's figure
marker names (`data-lattice-hydrate`, `-config`, `-settle`, `-final`, `-off`) are renamed
`data-author-…` wherever author markup spells them, so a deck cannot forge a pending figure
(`data-lattice-figure` is kept: a bake writes it into the Markdown the engine reads); and the `language-<fence>` class of an unloaded plugin becomes `language-off-<fence>`, so a
raw `<pre><code class="language-mermaid">` stays code like the fence. The CLI admits once per run and hands the answer to the engine, `bakeDeck`
and the boundary parser (`setBoundaryPluginsOff`). A host narrows the set with
`createEngine({ plugins: { defaults } })`, `--default-plugins` on the CLI, or
`LatticePlayground.setPluginDefaults` in a browser.

## The manifest says what, the modules say how

```jsonc
{
  "type": "plugin", "format": 1, "name": "math", "api": 1,
  "title": "Math", "description": "…",
  "requires": [], "optional": [],                     // other plugins, by name
  "contributes": {
    "syntax": {                                       // keyed by the TOKEN TYPE each rule emits
      "math_inline": { "kind": "inline", "anchor": { "after": "escape" }, "triggers": ["$"] },
      "math_block":  { "kind": "block",  "anchor": { "before": "fence" }, "triggers": ["$"], "opaque": true }
    }
  },
  "render": { "parity": "equivalent", "degradesTo": "source" }
}
```

`<name>.syntax.mjs` exports each rule **under the token type it emits**
(`export { mathBlockRule as math_block }`) plus `detect(source)`; `<name>.render.js` exports
`renderers`, one per declared token. The build checks that every declared token has both, and
that `renderers` holds nothing the manifest does not declare. Named rule exports let a bundler
keep only the rules a consumer imports — the boundary parser takes the block rules alone.

A renderer is `(token, ctx, env) → string`. `ctx` is frozen: `ctx.name`, `ctx.options` (this
plugin's `createEngine({ plugins: { options: { <name>: … } } })`), `ctx.family` (the deck's box
family). Keep no state in closures — the engine reuses its parser across renders.

## Fences

A plugin claims fence names in `contributes.fences` and exports a renderer per name from
`<name>.render.js` as `fences`:

```jsonc
"fences": { "functionplot": { "aliases": [{ "name": "latticeplot", "deprecated": true }], "body": "json" } }
```

The host owns `md.renderer.rules.fence` ONCE — a table from every fence name and alias to its
plugin's renderer, and everything else to the renderer that was there before. It replaced the old
wrapper chain, where each fence plugin wrapped the previous rule and registration order decided who
won. A fence renderer is `(token, ctx, env) → string`, `token.content` the body; a fence with a
browser half returns `<div class="…" ${ctx.hydrateAttrs(token.content)}></div>`. A name two plugins
claim, or one a code language owns (every highlight.js name and alias), fails the build — with one
exception: when a highlight.js upgrade later adds a language named like a fence the committed
registry already ships, that plugin keeps the fence and the build warns. A deprecated alias still renders and reports `<name>/deprecated-alias`, which the manifest
must declare. A fence counts as use: the host derives a plugin's `detect` probe from its fence names.

## Extension points

A plugin may OFFER a slot that components FILL (`contributes.extensionPoints`, one per plugin in
api 1). The chart family is the one in tree:

```jsonc
"extensionPoints": {
  "kernel": { "bucket": "chart", "role": "transform", "entry": "transformSection", "description": "…" }
}
```

A filler declares the slot's BLOCK (`block`, default the slot name), so a chart's existing
`"kernel": { … }` block IS the fill; the slot adds who may fill it (`bucket`) and what the plugin calls (`role`,
`entry`: `bar/bar.transform.js` exporting `transformSection`). The build writes the slot into
`extension-points.generated.json`, keyed by block, which the component loader (who may declare `kernel`),
`tools/build-chart-registry.js` (the dispatch table) and `tools/check-ownership.js` (each filler's
module and export) read instead of a bucket list of their own.

**Filling a slot is requiring the plugin.** The build adds every filler to `COMPONENT_PLUGINS`, so
a chart class loads the family on a narrowed host and reports `plugin/component-needs-plugin` when
the family is switched off. Switched off, the family passes each chart section through as written
and marks it `data-lattice-off="chart-family"`; the runtime's DOM pass skips a marked section.

The resolver fails a slot whose plugin ships no `<name>.dispatch.js` (and a dispatch with no slot), a block two plugins read, a bucket two slots claim, a block that is not an
object block of the component schema, and a component that declares the block outside the slot's
bucket. In api 1 only in-tree components fill a slot; a slot that plugins fill (an icon pack) is
reserved as a later, additive field.

## A fence rendered as code, and the bake

Mermaid's fence is declared `as: "code"`: the plugin owns the name (no other plugin may claim it,
and it counts as use), but the engine renders it as the highlighted code block it always was —
the host leaves it to the fence renderer installed before the table, so it has no renderer and no
aliases. The plugin draws it later, in two places:

- **In a browser, the plugin's PASS draws it** (`render.exec.hydrate: "pass"`):
  `mermaid.hydrate.js` exports `createPass(ctx)` rather than a per-placeholder `hydrate(el, ctx)`,
  because Mermaid's palette is global and every fence must be grouped by the palette its slide
  resolves and rendered on one serial queue. The runtime finds the pass through the registry
  (`passes.generated.js` `PASSES`) and drives it at three points — `boot`, `run` (every content
  pass) and `onMutations` (the observer's microtask) — and names no plugin. The pass is bundled,
  never serialized, so it may require the kernels it shares with the bake. It reads its fence
  names from `ctx.fences`, tags each fence's `<pre>` with the host's markup
  at boot (`data-lattice-hydrate="mermaid"` and the settle state below — `hydrating` while a draw is
  in flight), and asks the host for the library (`ensureLibrary`), which loads the plugin's
  `payload` from beside the runtime exactly as it loads a hydrator's. So no page threads a URL, and
  every capture waits on a diagram through the one barrier. A surface that must tell "this render
  still owes a drawing" before the runtime ran reads `drawn-probe.mjs` (the fence as a DOM
  selector, in rendered markup, in Markdown source, and the library's address beside a runtime
  URL) instead of naming Mermaid.
- **On the CLI, its bake draws it** (`contributes.bake`, `render.exec.bake: "subprocess"`):
  `<name>.bake.js` exports `bake(source, ctx)`, and `host-bake.js` runs every active plugin's bake,
  in dependency order, over the deck's Markdown before the engine renders — only for a deck that
  uses the plugin. `ctx` is frozen: the export's GENERIC services (`BAKE_SERVICES` — the palette
  readers, the Chromium to use, the deck's orientation, …; `bakeDeck` refuses any other) plus
  `name` and a fresh `state` the caller reads back — Mermaid's bake publishes the generic re-bake
  hook there, `state.rebake`, which the image-set export's cross-scheme look reads. On the CLI a bake that throws or returns no text fails the export, naming the
plugin (`strict`); a single diagram Mermaid rejects is degraded inside the bake, as before.

The resolver requires the bake of any plugin a pass draws: the CLI export page carries no
runtime, so nothing else would draw it there.

**Its grammar and its stylesheet are its own** (`contributes.highlight`, `contributes.styles`):
`installPlugins` registers `mermaid.highlight.js` on the engine's highlight.js under the code
fence (for every installed plugin, a switched-off one included — its fence is the one that stays
source), and `mermaid.styles.css` is bundled into the plugin slot like any plugin's CSS.

## The browser half: hydrate and the settle state

A plugin whose fence becomes a placeholder declares `contributes.hydrate` and ships
`<name>.hydrate.js` exporting `hydrate(el, ctx)`. ONE function for every browser surface: the
runtime bundles it (`hydrate.generated.js`), and the CLI export page — which runs without the
runtime — gets it serialized by `hydrate-script.js`. So it must be **self-contained**: no require,
no import, no module-level helper — the build refuses a require, an import, and anything in the
module outside `hydrate()` itself, and `test/unit/plugins/hydrate-host.test.js` runs every hydrator
on both surfaces over its own fixtures. A library global must be a function (`ctx.lib`). `ctx` carries what it needs:

| `ctx` member | What it is |
|---|---|
| `ctx.lib` | the library's global, from the manifest's `payload` (`functionPlot`) |
| `ctx.decodeConfig(el)` | the fence body the renderer packed |
| `ctx.settle(el, state)` | report `error` (after showing it); returning settles `rendered` |
| `ctx.token(el, name)` | a token's computed value on that element |

`host-browser.mjs` does the rest: it loads the library (`payload`, fetched beside the runtime by
its file name; inlined into the page by the CLI, so an `--html` or `--fluid` export draws on a
machine that is not the exporter's), times out a hydrate past `budgetMs` (default 4000), and keeps
the state in markup, where any capture can read it:

| `data-lattice-settle` | Meaning |
|---|---|
| `pending` | written by the ENGINE, so a capture that starts before any script ran still waits |
| `hydrating` | a host is drawing it; every other pass — and a second host on the page — skips it |
| `rendered` · `error` | drawn · failed, with the failure shown on the slide |
| `unavailable` | the library never came; the author's source is shown. Recoverable |
| + `data-lattice-final` | closed by a capture (or a budget); nothing touches it again |

A runtime-drawn fence carries the same markup on its `<pre>` (written by the runtime, not the
engine) and no `data-lattice-config`: its content already is the author's highlighted source, so a
release leaves it in place and the plugin's CSS shows it for `unavailable`. The runtime's host
leaves that `<pre>` to the runtime's pass; any other element carrying the plugin's name is an
author's, and is released at once. `drawn-library.mjs` gives a page the library's address beside a
runtime URL (the Studio's diagram checker, its warm-up) and the `<link rel="preload">` a frame
builder writes for a document with a drawn fence.

**The drawn figure carries the host's marker.** A plugin that draws a figure (its pass, its bake)
writes `data-lattice-figure="<name>"` on the container it draws into, beside its own classes
(declared as `render.figureClasses`). Everything outside the plugin — the Studio export's SVG bake,
the standalone-SVG export, the CLI player capture, Anima's diagram host, the Guide's figure
selector, the diagram layout's CSS, the fit and label gates — selects `[data-lattice-figure]`, never
`.mermaid` or `.mermaid-svg`; `checkPluginMigration`'s `drawnFigureClasses` arm holds that at 0.
`--disable-plugin <names>` switches plugins off for one CLI run, for the engine and the bakes alike.

Every capture waits until no placeholder is `pending` or `hydrating` — the CLI's PDF/PNG/PPTX and
`--player` bake (`settleBarrierScript`), and the Studio export (`deck-export.js`,
`PENDING_FIGURES`). The selector requires `[data-lattice-hydrate]`, so an author's own element
carrying the attribute is never waited on, and a placeholder naming a plugin the page has no
browser half for settles `unavailable` at once. A layout
that sizes a figure selects the host's marker, `[data-lattice-hydrate]`, never a plugin's class.

## What the host guarantees, so a plugin does not have to

- **Install order.** The host installs every rule, in dependency order. An anchor names a
  markdown-it rule (`escape`, `fence`, …), never another plugin's.
- **Collisions fail the build by name**: two plugins on one trigger character in one ruler, two
  emitting one token type.
- **Fail-soft at render.** A renderer that throws or returns a non-string becomes the manifest's
  `degradesTo`; the rest of the deck renders.
- **The boundary parser agrees.** Every block rule is installed there too, so a plugin block's
  body can never become a slide break.
- **Disabling cascades.** `createEngine({ plugins: { disabled: ['x'] } })` turns `x` off and every
  plugin that `requires` it; `optional` users keep running. (`math: false` still works.) A deck's
  `plugins:` list cannot turn a disabled plugin back on.

## Components that need a plugin

A component designed around a plugin declares it in its **own** manifest — the plugin never names
the component:

```jsonc
// lib/components/math/math/math.manifest.json
"plugins": { "requires": ["math"] }     // "optional": [...] for one it works without
```

A required plugin is LOADED for every deck that uses the class (see *What loads a plugin*).
The build fails when a component requires a plugin that does not exist, and when its own gallery
(`<name>.gallery.md`) uses a plugin's syntax or fence without declaring it (the build runs every
plugin's rules over every component gallery).
At render, a slide whose required plugin is switched off still renders — the layout, and the
plugin's fallback — and `render()` returns a `plugin/component-needs-plugin` diagnostic.

## Fixtures

````markdown
## inline math typesets

```markdown
The area is $\pi r^2$.
```

- renders `class="katex"`
- omits `<h1`
- detect true
````

`test/unit/plugins/conformance.test.js` runs every case, and on every case also checks that
`detect` finds whatever the parser turned into the plugin's tokens, and that each declared token
is exercised by some case. `npm run test:plugins` runs the harness and the resolver tests.

## The build

`tools/build-plugin-registry.js` (a `npm run build` step) resolves every plugin and writes its
committed files — never edit them:

- `grammar.generated.mjs` — manifests + grammar, in dependency order (ESM; no renderer library)
- `registry.generated.js` — the grammar plus the renderers (what the engine installs)
- `blocks.generated.mjs` — the block rules as a straight-line installer, for the boundary parser
  (it ships in the Studio's startup JavaScript, so it skips the generic host)
- `hydrate.generated.js` — each browser half and the library it waits for (the runtime bundles it)
- `passes.generated.js` — each document pass (`render.exec.hydrate: "pass"`) and its fence names;
  only the runtime requires it
- `styles.generated.js` — the stylesheets, in dependency order, for `tools/build-css.js`
- `bake.generated.js` — each Node-side bake, required lazily (`host-bake.js` runs them)
- `drawn.generated.mjs` — the code fences a browser runtime draws, and each such plugin's
  `payload` (plain data; `drawn-probe.mjs` is the hand-written reader browser surfaces import)

The resolver also holds the manifest to the files for the phase-B contributions: a declared fence
has a renderer and no renderer is undeclared, `hydrate` ⇔ a self-contained `<name>.hydrate.js`
(or, for a pass, one exporting `createPass`), `highlight` ⇔ `<name>.highlight.js` and a code
fence to register it under, `styles` ⇔ `<name>.styles.css`, and `tokens` is exactly the set of
`var(--…)` reads in it.

`npm run build:check` fails when they are stale, and `checkPluginMigration` in
`tools/check-ownership.js` fails when code outside `lib/plugins` hand-names a plugin's token, or a
fence wrapper re-grows in `lib/integrations/markdown-it/plugins.js` (budget 0 since phase B), and
counts the three hand idioms a runtime-drawn plugin's browser half grew before the host could
answer for it: `language-<fence>` rosters (`drawnFenceClasses`), a hand-threaded library URL
(`drawnLibraryUrls`, `mermaidUrl`) and a private settle state in code or CSS
(`drawnSettleStates`, `data-mermaid-state`). All three are 0 since phase D's browser half, and
the budget only falls. Three more count the plugin doing its own work rather than the engine doing
it by hand: a browser plugin named in `lib/runtime` code (`runtimePluginNames` — 139 before the
pass moved, 0 since), a plugin's stylesheet or grammar left in `lib/integrations/<plugin>/`
(`pluginAssetsOutside`, 2 → 0) and a plugin's bake record read by name (`bakeContextByName`,
`contexts.get('mermaid')`, 1 → 0), and a drawn plugin's own figure class used as a selector
outside it (`drawnFigureClasses`, read from each manifest's `render.figureClasses`, 36 → 0).
