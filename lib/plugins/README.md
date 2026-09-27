# lib/plugins — the plugin host

A **plugin** teaches Lattice something new — a syntax, a fence — that works on any slide, as one
folder with a manifest. A **component** (a slide class) may be designed around a plugin; the
component declares that dependency, and a plugin never names a component. The design, the decisions behind it and the order the rest of the integrations move in
are `engineering/decisions/2026-09-27-plugin-system.md`; this file is the working guide.

**Shipped plugins:** `math` (`$…$`, `$$…$$`; the `math` slide class requires it). Function-plot, Mermaid and
the chart family move here next, one phase at a time.

## A plugin is a folder

```
lib/plugins/<name>/
  <name>.manifest.json    required — what it contributes; validated by plugin.schema.json
  <name>.docs.md          required — the author's contract (HARD RULE #6)
  <name>.fixtures.md      required — the conformance cases the harness runs
  <name>.syntax.mjs       the GRAMMAR: markdown-it rules + detect(source). Pure; no library imports
  <name>.render.js        the RENDERERS: what each token becomes. May load a library (math loads KaTeX)
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
(`<name>.gallery.md`) uses a plugin's syntax without declaring it (the build runs every plugin's
rules over every component gallery).
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

`npm run build:check` fails when they are stale, and `checkPluginMigration` in
`tools/check-ownership.js` fails when code outside `lib/plugins` hand-names a plugin's token, or a
fence wrapper re-grows in `lib/integrations/markdown-it/plugins.js`.
