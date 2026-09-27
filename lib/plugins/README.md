# lib/plugins — the plugin host

A **plugin** teaches Lattice something new — a syntax, a fence — that works on any slide, as one
folder with a manifest. A **component** (a slide class) may be designed around a plugin; the
component declares that dependency, and a plugin never names a component. The design, the decisions behind it and the order the rest of the integrations move in
are `engineering/decisions/2026-09-27-plugin-system.md`; this file is the working guide.

**Shipped plugins:** `math` (`$…$`, `$$…$$`, ` ```math `; the `math` slide class requires it),
`function-plot` (` ```functionplot `, drawn in the browser; `math` lists it as optional) and `anima`
(` ```anima `; the `scene` slide class requires it). Mermaid and the chart family move here next,
one phase at a time.

## A plugin is a folder

```
lib/plugins/<name>/
  <name>.manifest.json    required — what it contributes; validated by plugin.schema.json
  <name>.docs.md          required — the author's contract (HARD RULE #6)
  <name>.fixtures.md      required — the conformance cases the harness runs
  <name>.syntax.mjs       the GRAMMAR: markdown-it rules + detect(source). Pure; no library imports
  <name>.render.js        the RENDERERS: what each token and fence becomes. May load a library (math loads KaTeX)
  <name>.hydrate.js       the BROWSER half: hydrate(el, ctx) draws one placeholder. Self-contained
  <name>.styles.css       token-only CSS, bundled into the plugin slot of dist/lattice.css
```

The grammar and the renderers are separate files on purpose: the boundary parser and the docs
site's pre-scan need the grammar without the library behind it.

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
claim, or one a code language owns (every highlight.js name and alias, and `mermaid`), fails the
build. A deprecated alias still renders and reports `<name>/deprecated-alias`, which the manifest
must declare. A fence counts as use: the host derives a plugin's `detect` probe from its fence names.

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
its file name; injected by the CLI), times out a hydrate past `budgetMs` (default 4000), and keeps
the state in markup, where any capture can read it:

| `data-lattice-settle` | Meaning |
|---|---|
| `pending` | written by the ENGINE, so a capture that starts before any script ran still waits |
| `hydrating` | a host is drawing it; every other pass — and a second host on the page — skips it |
| `rendered` · `error` | drawn · failed, with the failure shown on the slide |
| `unavailable` | the library never came; the author's source is shown. Recoverable |
| + `data-lattice-final` | closed by a capture (or a budget); nothing touches it again |

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
  plugin that `requires` it; `optional` users keep running. (`math: false` still works.)

## Components that need a plugin

A component designed around a plugin declares it in its **own** manifest — the plugin never names
the component:

```jsonc
// lib/components/math/math/math.manifest.json
"plugins": { "requires": ["math"] }     // "optional": [...] for one it works without
```

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

`tools/build-plugin-registry.js` (a `npm run build` step) resolves every plugin and writes two
committed files — never edit them:

- `grammar.generated.mjs` — manifests + grammar, in dependency order (ESM; no renderer library)
- `registry.generated.js` — the grammar plus the renderers (what the engine installs)
- `blocks.generated.mjs` — the block rules as a straight-line installer, for the boundary parser
  (it ships in the Studio's startup JavaScript, so it skips the generic host)
- `hydrate.generated.js` — each browser half and the library it waits for (the runtime bundles it)
- `styles.generated.js` — the stylesheets, in dependency order, for `tools/build-css.js`

The resolver also holds the manifest to the files for the phase-B contributions: a declared fence
has a renderer and no renderer is undeclared, `hydrate` ⇔ a self-contained `<name>.hydrate.js`,
`styles` ⇔ `<name>.styles.css`, and `tokens` is exactly the set of `var(--…)` reads in it.

`npm run build:check` fails when they are stale, and `checkPluginMigration` in
`tools/check-ownership.js` fails when code outside `lib/plugins` hand-names a plugin's token, or a
fence wrapper re-grows in `lib/integrations/markdown-it/plugins.js` (budget 0 since phase B).
