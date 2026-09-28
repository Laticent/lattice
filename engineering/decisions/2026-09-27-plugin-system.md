---
status: in-progress
summary: The plugin system, designed whole and hardened by the adversarial trio before any code. A plugin is a package (`type: "plugin"`) — one folder, one manifest that declares WHAT it contributes and whom it depends on, and role-named modules that say HOW — so the in-tree folder, the exported zip and the Studio record hold the same files. In-tree plugins are resolved at build time into one frozen code registry every render path reads; installed plugins join at render time as an interpreted data layer. Plugins stand alone or declare `requires` / `optional` on others. Math and function-plot are the pilots; Mermaid and the chart family are mapped onto the contract so it is designed for them, not retro-fitted. Reconciles LPM (2026-06-14), the plugin architecture (2026-09-13) and portable packages (2026-09-23), and amends the last one's "no dependency resolver".
---

# The plugin system — one package shape, declared dependencies, two registry layers

**Date:** 2026-09-27 · **Decision owner:** Sharmarke · **Status:** in progress — the owner settled §9 on
2026-09-27; phase A is being built.

**Continues** three notes and replaces none of their shipped parts:
[`2026-06-14-plugin-extension-system.md`](2026-06-14-plugin-extension-system.md) (**LPM**, the
Lattice Plugin Model — the render contract: render paths, parity, fail-soft adapters),
[`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) (contribution **tiers** —
T0 provider table, T1 leaf renderer, T2 section transform, T3 deck-wide pass — and trust set by the
delivery channel) and [`2026-09-23-portable-packages.md`](2026-09-23-portable-packages.md) (the
package spine). **Amends** one line of the last: §7's "no per-package versions and no dependency
resolver" (§4.5 says what replaces it and what it costs). **Bounded by**, and does not reopen, the
transformer threat model
([`2026-06-29-component-transformer-threat-model.md`](2026-06-29-component-transformer-threat-model.md))
and the code-package contract ([`2026-09-24-code-package-contract.md`](2026-09-24-code-package-contract.md)).

## 1. The answer

A **plugin** is a folder that teaches Lattice something new: a syntax (`$…$`), a fence
(` ```functionplot `), or a figure that a browser draws — a **capability that works on any
slide**. A component (a slide class such as `math`) is a layout that may be designed around a
plugin, and it is the component that declares the dependency, never the plugin (§4.1). A plugin
carries

- **one manifest** that declares *what* it contributes, *whom* it depends on, *which* payload it
  loads, *which* tokens it paints with and *what* it degrades to — all readable without running
  any of its code; and
- **role-named modules** that supply *how*, one function per declared contribution.

**Two registry layers**, because two kinds of plugin arrive at two different times:

- **The code layer** — every in-tree plugin. `tools/build-plugin-registry.js` reads the manifests,
  resolves the dependency graph, checks manifest and modules agree one-to-one, and writes
  `lib/plugins/registry.generated.js`: static `require`s, deterministic, committed, checked by
  `--check` — the pattern `chart-registry.generated.js` already proves. The engine, the runtime,
  the CLI export and the Studio all read it. None of them names a plugin in its own code.
- **The data layer** — plugins a user installs (`~/.lattice`, the Studio Library). They carry data
  only (§4.10), so the engine *interprets* them at render time and never `require`s them. This
  is the layer `lattice-emulator.js:1033` and the Studio's Library already are for themes and
  components; plugins join it.

The package is the same folder in the repo (`lib/plugins/<name>/`), in a zip and in the Studio,
because a plugin **is** a portable package — the fifth kind row in the spine that already carries
themes, components, finishes and motion.

**The pilots are math and function-plot, and both stand alone.** Math is the hard shape — syntax
on every slide, a sync renderer, install options, a CSS and font payload — so it goes first and the
host is shaped by the hardest case, not the easiest. Function-plot is the other shape — a fence, a
browser renderer, a library loaded only when used. They share a slide layout, not a dependency
(§6). The first real dependency edges are the 23 chart kernels on the chart family (§5).

## 2. What the owner asked for, as testable requirements

| # | Requirement | How this design meets it | Where |
|---|---|---|---|
| R1 | A manifest and a self-contained package | a `type: "plugin"` package; the folder, the zip and the Studio record hold the same files | §4.1–4.2 |
| R2 | Import and export | the spine's `lattice packages add / check / export` and the Studio Library, with one kind row added; what a zip may carry is §4.10 | §4.11 |
| R3 | Stand alone or depend on other plugins | `requires` / `optional`, resolved and ordered at build time; cycles and misses fail by name | §4.5 |
| R4 | Easy to create | `lattice packages new plugin <name>` writes a working plugin that passes the build untouched | §4.13 |
| R5 | Easy to use | the author types the fence or syntax; the plugin loads because the deck uses it | §4.8 |
| R6 | Works today and tomorrow | an `api` field, one conformance harness, a deprecation rule for aliases, and a draft spec frozen only after Mermaid and the charts prove it | §4.12 |
| R7 | No jank | derived rosters, a deletion ratchet so no phase leaves two systems, host-owned fail-soft, one settle barrier before any capture | §3, §4.6–4.7, §7 |
| R8 | Mermaid, the chart family and the rest become plugins | each mapped in §5; the contract carries what they need without a breaking change | §5 |

## 3. The audit — what exists, and what is broken today

Measured at `cb32dbf`. Footprints are `git grep -l` counts over tracked non-Markdown files.

### 3.1 What is built, and what this design keeps

| Piece | State | Role here |
|---|---|---|
| Package spine `lib/packages/` | shipped: `kinds.js` (4 kinds), `read.js`, `write.js`, `gate.js`, `import-gate.js`, CLI `list/add/check/export/remove`, `~/.lattice` store, `packages.generated.json` (33 themes, 71 components, 9 finishes) | **the delivery vehicle**; `plugin` is the fifth row |
| Manifest-driven code dispatch | charts only: `KERNEL_BUCKETS = ['chart']` (`lib/components/index.js:934`), 23 kernels frozen into the committed `chart-registry.generated.js` | **the code-layer pattern** |
| Projection catalog | shipped: one `projection` block per component → `projection-catalog.generated.mjs`; `checkProjectionCoverage` fails a chart that forgets it | proof that "declare once, derive the rosters" works here |
| Code sandbox + bundler | built, test-only: `lib/core/code-sandbox.js` (a locked Chromium page), `lib/packages/code-bundle.js` | the door a *zip* plugin's fence code could use (§9 decision 3) |
| Transform DSL | built and reviewed; the manifest loader validates it (`lib/components/index.js:741`), no render path runs it | not a v1 contribution point (§4.3) |
| On-demand loaders | `ensure-katex.ts`, `ensure-hljs-language.ts`, `load-engine.ts` — one idiom three times | collapse into one host loader (§4.8) |

### 3.2 What is missing: a spine for code

Seven registries grew separately and none of them knows about the others: the component walk,
the chart kernels, `TRANSFORMERS` (20 hand-ordered `require`s, `lib/transformers/registry.js:69`),
`LATTICE_PLUGINS` (19 markdown-it functions, `lib/engine/index.js:123`), `lib/integrations/` (four
folders, each bespoke), the fence **wrapper chain** (`plugins.js:1889` function-plot, `:1917` anima —
each wraps `md.renderer.rules.fence`, so registration order decides who wins and nothing checks it),
and `lib/core/boundary-parser.mjs`, which installs `math_block` by hand (`:65`, `:77`) so slide
boundaries survive `$$` blocks. There is no config file, no enablement and no host API.

Hand-kept rosters that name the pilots outside their own code — each one a place a new plugin
would also have to be added by hand, silently:

| Roster | Names |
|---|---|
| `tools/build-docs-portal.js:1130` | the `functionplot` grammar row |
| `docs/src/lib/compose/fence-catalog.ts:77` | the fence in the Compose picker |
| `docs/src/components/studio/export/deck-export.js:522-582` | the capture's wait selectors, Mermaid and function-plot by name |
| `lib/core/marp-fidelity.js:150-153` | function-plot as "unmirrored" in the Marp export |
| `lib/core/carousel.js:921` | `p > p > div.functionplot` in the canvas scaffold |
| `lib/authoring/lint-core.js:2140-2149` | `math_block` as an opaque token |
| `tools/check-ownership.js:1825-1833` | the `functionplot` and `.math-error` monospace sanctions |
| `docs/scripts/sync-playground-assets.mjs:18-21,70-89` | staging `function-plot.js` and `lattice-katex.js` |

### 3.3 The pilots, audited — six defects a plugin contract would have prevented

1. **Function-plot has two browser inflaters, and they have drifted.** `lattice-emulator.js:2958-2992`
   and `lib/runtime/index.js:4309-4419` both turn the placeholder into SVG. The runtime copy sets
   `data-fp-state`, marks errors (`fpInflated = 'error'`) and releases the config text when the
   library fails to load; the emulator copy does none of it. (The Studio export, not the runtime,
   sets `data-fp-final`: `deck-export.js:578`.)
2. **Math's delimiter rules live twice.** `lib/engine/math.js` parses `$…$`; `lib/engine/math-detect.mjs`
   re-implements the rules as a pre-scan so the browser knows whether to fetch KaTeX
   (`2026-07-10-landing-perf-katex-defer.md` §4b made the copy on purpose). A parity test
   (`test/unit/engine/math-detect.test.js:56`) checks the two agree **on its fixtures**; between
   fixtures they can drift.
3. **KaTeX's stylesheet reaches a page from three sources**: vendored into `dist/lattice.css`
   (`build-css.js:526`), a `file://` link in the emulator (`:2945`), and inlined by
   `player-core.mjs:2643`. The docs site then re-registers `dist/lattice.css` with KaTeX's
   `@font-face` rules stripped until math appears (`theme-fetch.ts:108-156`).
4. **`.math-error` has no emitter**, and **`.katex-error` has no style.** `math.styles.css:114`
   styles a class no code writes; `check-ownership.js:1831` sanctions it. KaTeX writes
   `.katex-error` with an inline `color:#cc0000` (its default `errorColor`, `math.js:216`) — a hex
   color on a slide, outside the token system. An inline style beats any stylesheet rule without
   `!important`, so the fix is KaTeX's `errorColor` option, not a rule (§6).
5. **The math component knows about function-plot.** `math.styles.css` carries function-plot's
   canvas sizing (`:752`, `:767-790`, `:1180-1186`) and its stroke overrides (`:1188-1250`). The
   host names its guest.
6. **Function-plot has no manifest.** Its contract is the grammar row above plus 43 files; both
   libraries are hard `dependencies`, installed whether a deck uses them or not. (The runtime
   *bundle* is already disciplined: both contribute 0 bytes to `dist/lattice-runtime.js`.)

**Measured use:** function-plot fences appear in 6 Markdown files in the repo (galleries, examples,
docs); math appears on nearly every math-bearing deck. The pilot order in §7 follows from that.

Open issues this design absorbs: **#299** (function-plot's home and honest render paths). **#287**
(LPM Phase 1 — a uniform chart kernel adapter) is related but independent (§5).

### 3.4 Doc drift found by the audit

`2026-09-13-plugin-architecture.md` cites `KERNEL_BUCKETS` at `:730` (now `:934`), `LATTICE_PLUGINS`
at `:112` (now `:123`), "18 hand-ordered requires" (now 20), "21 kernels" (now 23), and calls
`lattice-asset/1` shipped (now read-only legacy; package-folder zips replaced it).
`lib/engine/index.js:319` and `lib/core/boundary-parser.mjs:34` say "15 LATTICE_PLUGINS" (19).
The first slice that touches each file corrects it.

## 4. The model

### 4.1 A plugin is a package

```
lib/plugins/function-plot/
  function-plot.manifest.json    required — owns the name; declares type, contributions, deps
  function-plot.syntax.mjs       the GRAMMAR: markdown-it rules and detect(source). Pure, library-free, ESM
  function-plot.render.js        the RENDERERS: what each token or fence becomes. May load a library
  function-plot.hydrate.js       the browser half: turns placeholders into figures. ONE source for every surface
  function-plot.styles.css       token-only CSS
  function-plot.docs.md          what an author reads (the HARD RULE #6 contract)
  function-plot.gallery.md       a live example deck
  function-plot.fixtures.md      conformance cases (§4.12)
```

Every file is `<name>.<role>.<ext>`, the spine's rule. A plugin carries only the roles it needs.

**Grammar and renderers are separate roles** (found building phase A). The boundary parser needs a
plugin's block rules and the docs site's pre-scan needs its `detect`, and neither may pull in the
library behind the renderers — math's KaTeX is 76 KB gzip. The boundary parser is also bundled by
the docs site's Rollup, which does no named-export interop on a CommonJS file under `lib/`, so the
grammar is ESM (`.mjs`) and the build writes it into its own registry, `grammar.generated.mjs`,
which imports no renderer.
The kind row requires `manifest.json`, `docs.md` and `fixtures.md`: docs because #6 makes them the
author's contract, fixtures because a plugin with no case cannot show it works. Role modules are
CommonJS like the rest of `lib/`.

**Why a new kind rather than a bigger component manifest.** LPM put a `render` block on the
component manifest. That fits one slide class with one transform — a chart — and does not fit
math, whose syntax works on *every* slide: `$$…$$` on a plain content slide typesets exactly as it
does on a `math` slide. So a plugin is the unit of **capability**, and a component is a **layout**.
**Charts stay components** (§5): each is one slide class, which is exactly what the component
manifest already describes.

**Components depend on plugins; plugins never name components** (owner, 2026-09-27). The `math`
slide class is a stage designed for equations — a legend, a derivation column, a theorem card —
so it declares the plugin it is a stage for, in its own manifest:

```jsonc
// lib/components/math/math/math.manifest.json
"plugins": { "requires": ["math"] }        // or "optional", for a component that works without
```

The first draft had it backwards — the math plugin listed `components: ["math"]` — and the owner
caught it. The direction matters three ways. A plugin stays a pure capability: a later
`derivation` component, or someone else's, can depend on math without editing the math plugin.
The plugin package is self-contained on disk, because nothing it names lives elsewhere. And the
declaration does work, because it is checked and it is read:

- **The build fails** when a component requires a plugin that does not exist, and when a
  component's **own gallery** (`<name>.gallery.md`) parses into a plugin's tokens but the manifest
  does not declare that plugin (`tools/build-plugin-registry.js` runs each plugin's rules over each
  gallery). So a declaration is checked against the one deck every component ships. It is not
  checked against the bucket galleries or the baseline decks, and the reverse — proving a declared
  plugin is really used — is not checked, deliberately. Both are for in-tree components; a user
  component's declaration joins with the data layer (phase E).
- **At render,** a slide whose component requires a plugin that is switched off still renders (the
  layout, and the plugin's own fallback: math shows its TeX), and `render()` returns a
  `plugin/component-needs-plugin` diagnostic naming both. A normal render carries no
  `diagnostics` key at all, so its shape is unchanged.
- **On export** (phase E), a user component carries the non-shipped plugins it requires.

### 4.2 The manifest

Function-plot's manifest as phase B ships it:

```jsonc
{
  "$schema": "../plugin.schema.json",
  "type": "plugin",
  "format": 1,
  "name": "function-plot",
  "api": 1,                                     // the host contract this plugin is written for (§4.12)
  "title": "Function plots",
  "description": "Plot y = f(x), parametric and polar curves from a JSON config fence.",

  "contributes": {
    "fences": {
      "functionplot": { "aliases": [{ "name": "latticeplot", "deprecated": true }], "body": "json" }
    },
    "hydrate": { "selector": ".functionplot" },
    "styles": true,
    "diagnostics": {
      "function-plot/bad-json":    "The functionplot fence body is not valid JSON.",
      "function-plot/lib-missing": "function-plot could not load; the config is shown as text."
    }
  },

  "payload": {
    "function-plot": { "from": "npm:function-plot/dist/function-plot.js", "global": "functionPlot", "when": "used" }
  },

  "tokens": ["--accent", "--cat-4-mark", "--cat-7-mark", "--muted-mark", "--border",
             "--text-muted", "--text-heading", "--font-mono", "--font-body", "--fs-meta"],

  "render": {
    "exec": { "hydrate": "browser" },           // where each code contribution runs (§4.7)
    "surfaces": {                               // what each surface EMITS for this plugin
      "engine": "placeholder", "preview": "figure", "pdf": "figure",
      "player": "figure-baked", "marp": "source"
    },
    "parity": "progressive",
    "degradesTo": "source"
  }
}
```

**The manifest says what; the modules say how; the build checks they agree.** A fence declared in
`contributes.fences` must have a renderer exported by `render.js` under the same name; a declared
`hydrate` must have a `hydrate.js`; a diagnostic an adapter reports must be declared; and anything
exported but not declared is an error too. That one-to-one check is what stops a manifest from
lying — the failure mode of every hand-kept roster in §3.2.

The schema, `lib/plugins/plugin.schema.json`, is closed at every level (`additionalProperties:
false`). A field a later plugin needs is a reviewed schema change, and adding one is **additive**:
no v1 plugin changes when v2 grows a field.

**Relation to LPM's fields.** LPM's `renderPaths` array becomes `render.surfaces`, an object of
**products** (what each surface emits: `placeholder | figure | figure-baked | source | none`),
because a list of path names could not say *what* each path produces. LPM's single `exec` enum
(`sync-node | subprocess | browser-inflate`) becomes **per contribution** (`render.exec.hydrate`,
later `render.exec.bake`), because Mermaid runs in two places. `parity` (`equivalent |
progressive`) and `degradesTo` keep LPM's meaning. `tokens` moves to the top level because it is
about the whole plugin's CSS, not one render path.

### 4.3 Contribution points — five in v1

| Point | The author writes | The plugin supplies | Host owner |
|---|---|---|---|
| `syntax` | delimiters in prose (`$…$`, `$$…$$`) | a markdown-it rule, its **trigger characters**, its host anchor, and `detect(source)` | the engine's parser, **and** the boundary parser |
| `fences` | ` ```name ` | `render(body, ctx) → html` | one host fence table |
| `hydrate` | nothing | `hydrate(el, ctx) → Promise` over a declared selector | one host hydrator on every browser surface |
| `styles` | nothing | token-only CSS | `build-css.js`, in a named slot (§4.9) |
| `diagnostics` | nothing | namespaced IDs (`<plugin>/<id>`) and messages | the diagnostic protocol (`spec/diagnostics.md`) |

**Added later, each in the phase whose plugin needs it** (§7), as additive schema changes:

- `bake` and `exec.bake: "subprocess"` — Mermaid (phase D) renders in a Node-driven page before
  the deck renders.
- `services` — a plugin calling another plugin's named function, declared in the manifest
  (`contributes.services: ["tex"]`) so the one-to-one check covers it. v1 has no consumer (§6).
- `extensionPoints` — a plugin offering a slot others fill; the chart family is the consumer.
- `providers` — declarative tables. **Templates and validated-id patterns only, never functions**:
  today's `lib/core/video-providers.mjs` rows are functions (`id`, `watch`, `oembed`, `embed`),
  and `embed` builds an iframe `src`, so the video table is code, not a T0 data table.

**Never a contribution point:**

- **Section transforms (T2)** stay first-party and hand-ordered in `lib/transformers/`. Their order
  is semantic (2026-09-13 §Axis 1), and an `after: [...]` list would hide that behind a field that
  looks checked.
- **Deck-wide passes (T3)** — the progress rail, auto-split, pagination — stay engine-owned.
- **Lint rules.** HARD RULE #7 keeps every rule in `lib/authoring/lint-core.js`. `lint-core` must
  stay pure and bundle into the browser, so it cannot `require` the code registry. The build
  writes a **data-only vocabulary projection** (fence names, trigger characters, slide classes,
  diagnostic IDs — the way `grammar.json` works) and `lint-core` reads that.

This table replaces LPM's five one-per-plugin `kind`s. A real plugin has several surfaces — math has
inline syntax and block syntax — so the surface belongs to each *contribution*. (LPM's `component`
kind is gone from the plugin side entirely: a component is its own package that depends on
plugins, §4.1.)

### 4.4 Syntax: triggers, anchors and install order

markdown-it's `ruler.after(name, …)` inserts **directly after** the anchor, so two rules registered
after the same anchor run in **reverse** registration order (the red team ran it: A then B after
`escape` became `escape, B, A`). A dependency order fed straight into `ruler.after` would let a
dependent's rule outrank the rule it depends on. So:

1. **The host installs every plugin rule itself**, never the plugin. It walks the plugins in
   *reverse* dependency order, so after markdown-it's insertion, rules run in dependency order.
2. **A `syntax` contribution declares its trigger characters** (math: `$`). Two plugins claiming
   one trigger is an error that names both, exactly as for fence names. A trigger that markdown-it's
   `text` rule does not stop at is refused, because `text` would swallow it mid-word and the rule
   would never fire.
3. **Anchors name host rules only** (`escape`, `fence`, `lattice_slide`), never another plugin's.
4. **Block rules are installed in the boundary parser too.** `boundary-parser.mjs` hand-installs
   `math_block` today so a `$$` block containing a lone `=` line is not read as a slide break; the
   registry feeds every plugin block rule to it, and the block-rule parity test covers all of them.
5. **Fences need no anchor.** The host owns one fence table keyed by name and alias. The wrapper
   chain (function-plot and anima) is deleted. Collisions are errors, and fence names are checked
   against highlight.js language names and aliases: claiming `json`, `tex` or `graph` would hijack
   every code block in that language, so those names are reserved.

### 4.5 Dependencies

```jsonc
"requires": ["chart-family"],     // cannot load without it
"optional": ["mermaid"]           // uses it when present; must work without it
```

**v1 checks names, presence and cycles — not version ranges.** In-tree plugins ship in lockstep
with the engine, so a hand-kept `version` would never be bumped and a range would check nothing a
name check does not. So in-tree plugins carry no `version`, and `requires` / `optional` are name
lists. When the npm door opens (§7 phase G), both become name → range maps; the list form stays
valid as "any version", so no v1 manifest changes.

`tools/build-plugin-registry.js`:

1. reads every in-tree manifest;
2. **fails the build** on a missing requirement or a cycle, naming every plugin on the path;
3. orders plugins topologically, ties broken by name, and freezes the order into the registry. The
   order decides parse-rule installation (§4.4), the CSS order inside the plugin slot (§4.9) and
   hydrate order — nothing else.

**What "disabled" means.** `createEngine({ math: false })` exists (`lib/engine/index.js:307`) and
keeps working: it disables the math plugin, which disables every plugin that `requires` math and
reports a diagnostic, while a plugin that lists math under `optional` runs without it.

**What this costs, against portable-packages §7.** That note declined a resolver because a theme's
`extends` was the only edge. Plugins add real edges — each chart's kernel and the family, and
function-plot and math. The cost stays bounded: build-time only, names only until npm, one copy of
each plugin per build, no network. A theme's `extends` keeps resolving by name.

### 4.6 The host API (`api: 1`)

A plugin's code reaches the engine only through `ctx`:

| `ctx` member | For | What it is |
|---|---|---|
| `ctx.options` | `syntax`, `fences` | install-time options (math's `output`, `reflow`); part of the parser memo key, so `buildMd`'s cache stays correct |
| `ctx.env` | `syntax`, `fences` | per-render state; plugins keep none in closures (`parser-memo.test.js` pins determinism) |
| `ctx.escape`, `ctx.escapeAttr` | `fences` | the host's HTML escaping for author text |
| `ctx.encodeConfig(text)` / `ctx.decodeConfig(el)` | `fences`, `hydrate` | the placeholder payload (base64 UTF-8, `lib/core/base64-utf8.js`) |
| `ctx.report(id, detail)` | all | emits a declared diagnostic; `detail` renders as text, never markup |
| `ctx.token(el, name)` | `hydrate` | a token's computed value **on that element**, so a slide's own `_class: dark` wins; prefer CSS paint where the library allows it |
| `ctx.settle(el, state)` | `hydrate` | the one state machine: `pending → rendered \| error \| unavailable → final` |

**Fail-soft is the host's job, at the step where it means something:**

- a `fences` renderer that throws or returns a non-string → the declared `degradesTo`, a
  diagnostic, and the rest of the deck unaffected;
- a `syntax` rule is **not** wrapped in the tokenizer — a throw mid-rule leaves markdown-it's
  position half-moved, and "degrade" has no meaning there. The host wraps the rule's **render**
  step, and the conformance harness feeds each rule its malformed fixtures;
- a `hydrate` past its time budget is settled `final` with the fallback, and a late draw is
  discarded, because `final` is terminal.

### 4.7 One hydrate source, three artifacts, one settle barrier

"One module for every browser surface" needs a build step, because the CLI's export page
deliberately runs **without** `lattice-runtime.js` (its overflow watcher would paint into the
print, `lattice-emulator.js:3383-3400`) and today injects its browser code by `fn.toString()`,
which cannot carry imports.

- **Runtime (Studio preview, Playground, `--fluid`):** the runtime bundle `require`s every
  in-tree `hydrate.js` through the registry.
- **CLI export page:** ~~`tools/build-plugin-registry.js` also compiles each `hydrate.js` with
  esbuild into a standalone script (IIFE)~~ — **as built (phase B): serialized, not compiled.** A
  `hydrate.js` is SELF-CONTAINED (no require, no import; everything through `ctx`), and so is the
  browser host (`host-browser.mjs`), so `lib/plugins/hydrate-script.js` writes the page's one inline
  script from the very functions the runtime bundles, by `toString()`. The build refuses a hydrate
  that requires or imports, and `test/unit/plugins/hydrate-host.test.js` runs both copies. Chosen
  over esbuild because a committed esbuild bundle would go stale on every esbuild upgrade (a
  `--check` flap on a Dependabot bump) and an uncommitted one is a build step the emulator would
  need at render time; serialization has neither cost, and the one thing it forbids — imports — is
  exactly what `ctx` exists to replace. The script is marked with `ENGINE_SCRIPT_ATTR` so the
  player's prune step treats it like the engine's own, and the emulator injects it only when the
  deck uses the plugin.
  **Its limit, recorded so phase D does not find it mid-build** (HARD RULE #25 inversion lens):
  serialization carries a hydrate that is one self-contained function. Function-plot's is 25
  lines. Mermaid's browser half is ~2,160 lines of kernels (`render-diagrams`, `mermaid-theme-map`,
  `diagram-scope`, …) that HARD RULE #1 keeps shared with the Node side, and it cannot be one
  function. Phase D picks one of two ways out, and neither reopens this frame: (a) a manifest flag
  marking a hydrate **runtime-only** — the CLI bakes that plugin instead (`exec.bake`, which phase
  D adds anyway), so the resolver exempts it from the no-import rule; or (b) an esbuild IIFE built
  into `dist/` beside `dist/lattice-emulator.js` at `prepare`, never committed, which answers this
  paragraph's staleness objection. (a) is the likelier: Mermaid already bakes on the CLI.
  **As built (phase D): (a).** `render.exec.hydrate: "runtime"` marks a plugin whose browser half
  is the runtime's own pass, with no hydrate module to serialize; the resolver then REQUIRES a
  `bake`, and the CLI draws the plugin there (`lib/plugins/host-bake.js`). Mermaid's fence is
  declared `as: "code"`, so the engine's bytes did not move (§11, phase D).
- **HTML player:** ships no plugin code; it bakes the hydrated page.

**The settle barrier.** Today's PDF is correct only because the function-plot inflater runs
synchronously before `load`. An async `hydrate` would be captured half-drawn. So every capture — the
CLI's PDF/PNG/PPTX and the Studio's export (`deck-export.js`) — waits until no element carries
`data-lattice-settle="pending"`, bounded by the budget. The wait selector comes from the registry;
the hand-named Mermaid and function-plot selectors are deleted.

**What a hydrate may emit.** SVG or HTML inside the slide sanitizer's allowlist. A `<canvas>` loses
its pixels when the player clones the page, and the player strips `<foreignObject>`, so a plugin
that needs either must declare a `bake` (phase D) or `player: "source"`.

**HARD RULE #22.** A `hydrate` writes markup inside the preview frame after the builder sanitized
it — shape 4 of #22. `checkRuntimeMarkupSinks` scans `lib/runtime` plus named files
(`check-ownership.js:7611-7620`); phase A adds `lib/plugins/**/*.hydrate.js` to its roots, so moving
an inflater into a plugin never takes it out of the census.

### 4.8 Payload: loaded because the deck uses it

A payload entry declares a file and `when`: `"always"` (part of the engine's CSS or bundle) or
`"used"`.

**"Used" comes from the same declarations that parse the deck.** For a fence, the host derives the
probe from the fence names and aliases. For `syntax`, the plugin's `detect(source)` is the probe,
and the harness requires it to be a **superset** of the parser — it must find every case the parser
parses and may find more. Math's detector over-matches on purpose (`math-detect.mjs` header), so
equality would be the wrong rule. **"Used" is transitive:** when a used plugin names another in
`requires` or `optional`, the other's payload loads too.

One host loader, `ensurePayload(plugin, base)`, replaces the three `ensure-*` loaders: their
per-URL promise cache, their retry after a failure, their poll for the declared `global`.
**As built (phase B):** it replaced function-plot's loader only — KaTeX's and Mermaid's move with
their phases — and a failed load is NOT retried: it stays failed for the page's life, and the
placeholders show their source as `unavailable`, which a later pass still recovers if the global
turns up by other means. The global must be a function. The CLI
emits a payload tag only when the deck uses the plugin; the player bakes; the CSP script hashes are
computed from the assembled bytes as today (`player-core.mjs`). `from: "npm:…"` points an in-tree
plugin at its npm dependency instead of vendoring a copy. Moving those dependencies to
`optionalDependencies` is phase F, because it changes what `npm i` installs.

### 4.9 Theming and CSS

`tokens` lists every token the plugin paints with. The build checks each against the **token
vocabulary** — `base.tokens.css`, plus the theme contract, plus the generated `--fs-*` roles — not
against one file: seven of function-plot's ten tokens are theme-supplied or generated. Plugin CSS
goes through `build-css.js` and every gate component CSS already passes: no hex (#3), the
`--fs-*` roles (#4), no margin (#20), no partial `@layer` (#26), no typed glyphs (#29).

Plugin CSS lands in **one named slot** in `build-css.js`'s source order, where `lib/integrations`'
CSS sits today, in dependency order inside it. Any phase that moves CSS carries a pixel check of the
affected gallery.

### 4.10 Trust follows the channel

Unchanged from `2026-09-13` §Axis 2, applied per contribution:

| Channel | May carry | When |
|---|---|---|
| **In-tree** (`lib/plugins/`) | every contribution | phase A |
| **Zip / Studio / AI-generated** (the data layer) | `styles`, `diagnostics` (a component without a transform is already its own data package, and may declare the plugins it needs) | phase E. **Refused:** `payload`, any `exec`, `syntax`, `hydrate`, `bake` — and every script file by extension, which `lib/packages/read.js:35` already does. `fences` code through the code-package door (consent + sandbox) once it ships, §9 decision 3 |
| **npm** (`lattice-plugin-*`, resolved at build time) | every code contribution | phase G, after the `LICENSE-EXCEPTIONS` plugin grant (contribution model, finding 6). Discovery by an explicit list, not by name prefix, so a transitive dependency named `lattice-plugin-*` gets no code into a deck |

**A `bake` (phase D) runs with full Node privileges** — it is required into the CLI's own
process and may start others — so no sandbox the code-package door has can hold one. Only an
in-tree plugin, or an npm plugin after the grant, may carry `bake.js`.

**Names.** Shipped plugin names are reserved, per the spine's `<name>-custom` rule. A data-layer
plugin that collides with a shipped one, or with another installed plugin, is **disabled with a
diagnostic** — it never fails every build on the machine, including builds of decks that do not use
it.

**Reproducibility.** An installed plugin changes how decks render on that machine. So every export
records the non-shipped plugins the render used (name + SHA-256 of the package) in its metadata,
and a render that names a slide class or fence it cannot find says which plugin provides it.

### 4.11 Import and export

`plugin` becomes the fifth row in `lib/packages/kinds.js` (root `lib/plugins`, layout `folder`,
required `manifest.json`, `docs.md`, `fixtures.md`; code roles `syntax.mjs`, `render.js`, and
`hydrate.js` from phase B):

- `lattice packages list --type plugin` · `add <zip|folder>` · `check` · `export plugin/<name>` ·
  `remove plugin/<name>` work through the existing CLI.
- An export carries the plugin's non-shipped dependencies, as portable-packages §4 carries a user
  theme's parent. An import checks the whole graph before it installs anything, so a
  half-installed plugin never exists.
- The Studio Library imports and exports the same zip through `package-zip.ts`.

### 4.12 Stability — how it survives time

- **`api` names the host contract a plugin was written for.** An `api` the host does not know is an
  error that names the plugin and the Lattice version that supports it. A compatibility promise
  across majors waits for the first out-of-tree plugin; before that there is nobody to keep it for.
- **The contract is a spec**, `spec/LPM.md`, next to `spec/LFM-1.0.md`, and it stays a **draft
  (0.x) until Mermaid and the chart family run on it** (phases D and F). Freezing it after two
  plugins would freeze a contract two easy cases shaped. LFM §10–11 deferred out-of-tree
  vocabulary "to a registration path"; this is that path.
- **One harness runs every plugin's `fixtures.md`**: input → expected markup; malformed input →
  the declared fallback and diagnostic; `detect` ⊇ parser. The engine surface runs in the unit
  tier; the browser surfaces run in the integration tier. A plugin author writes cases, never a
  harness.
- **No discovery at render time for code.** The code registry is generated and committed under
  `lib/plugins/`, so the runtime pays nothing to find plugins and a bundler can follow every
  `require`.
- **Aliases carry renames.** `latticeplot → functionplot` becomes the general pattern
  (`aliases[].deprecated`); a deprecated alias reports its replacement.

### 4.13 Creating a plugin

```
lattice packages new plugin sparkline
```

writes a folder with a manifest, a `render.js` exporting one fence renderer, a stylesheet using two
tokens, a docs page, a one-slide gallery and two fixtures — and the build and the harness pass on it
untouched. `lattice packages check <folder>` runs the schema, the resolver and the fixtures.

## 5. The future plugins, mapped onto the contract

| Plugin | Contributes | `exec` | Depends on | Moving it deletes |
|---|---|---|---|---|
| **math** | `syntax` (`$`, `$$`), `styles`, payload (KaTeX CSS, fonts, the browser provider); the `math` slide class requires it | parse-time, sync | — | the hand install in `boundary-parser.mjs`, `installMath`'s special case, `ensure-katex.ts`, two of three KaTeX CSS sources |
| **function-plot** | `fences.functionplot`, `hydrate`, `styles`, payload | `hydrate: browser` | — (§6) | the second inflater, the fence wrapper, four hand rosters (§3.2), function-plot CSS in the math component |
| **anima** | `fences.anima` | — | — | the last fence wrapper (phase B moves its registration into the fence table; the full move is later) |
| **mermaid** | `fences.mermaid`, `bake` (the render worker), `hydrate` (the runtime `renderDiagrams`), `styles`, a highlight.js grammar, payload (`mermaid-v11.min.js`, 3.1 MB, `when: used`) | `bake: subprocess`, `hydrate: browser` | — | `mermaidUrl` threaded through 22 files; the capture's hand-named wait |
| **chart family** | `extensionPoints.kernel`, the chart frame, `styles` | parse-time | — | `KERNEL_BUCKETS` and its mirror `KERNEL_BUCKETS_GATED` |
| **each chart** (23) | stays a **component**; its manifest's `kernel` block (+ #287's adapter) is the slot fill | parse-time | the family, by bucket | nothing moves; the plugin registry reads kernels as a second source |
| **highlight.js languages** | `providers` (grammar files) | `browser` | — | the fourth loader idiom; code, so in-tree only |

**#287 is not on this path.** The uniform `transformSection` adapter is a refactor inside
`lib/components/chart/`. It needs no plugin system and can land first as its own PR; phase F then
only teaches the plugin registry to read chart kernels.

## 6. The pilots

**Math stands alone, and goes first.** It contributes the most kinds of thing, sits on the hottest
path (every paragraph of every slide passes its inline rule), and carries install options into the
parser memo. If the host carries math without a special case, the easy shapes follow. Moving it
must be **invisible**: the evidence is byte-identical HTML for every gallery and example deck
before and after, plus `npm run bench` before and after (§7).

The `.katex-error` color (§3.3 defect 4) moves to **phase B**, where it can ride that phase's
export sign-off: it changes what an erroneous formula looks like, so it is not part of a move
whose evidence is byte identity. The fix passes KaTeX an `errorColor` that resolves through a
token (whether KaTeX accepts `var(--…)` there is the first thing to measure) and either wires
`.math-error`'s designed error surface to it or deletes the dead rule and its sanction.

**Function-plot stands alone too, and goes second.** The two were thought to be linked because
they appear together, and they are not: neither library calls the other. On a `math canvas` slide
the author writes the function twice in two languages — TeX for the equation KaTeX draws,
function-plot's own calculator notation (`"fn": "1 / (1 + exp(-x))"`) for the curve — and the
`canvas` variant places them side by side. Panes (`lib/core/panes.js`) let an author put any figure
beside any equation, so the pairing is a layout, not a relationship. **Owner, 2026-09-27: they are
independent.**

What that changes in the code: math's canvas CSS names `.functionplot` (§3.3 defect 5). The
canvas stage sizes whatever figure it holds, through a class the stage owns, and function-plot's
own styling moves into its plugin. Neither plugin names the other.

The resolver's failure arms — a missing requirement, a cycle, a disabled dependency — are proven in
phase A with synthetic fixture plugins, which is what fixtures are for. The first real `requires`
edges are the chart kernels on the family (phase F).

**Dropped from the first draft: typesetting a plot's title with KaTeX.** It was invented to give the
pair an edge, and it breaks anyway: the title lives inside the fence's JSON, so JSON escapes run
before KaTeX sees it. `"$\frac{1}{x}$"` parses to a form feed plus `rac{1}{x}`, `\beta` to a
backspace plus `eta`, and `\alpha` makes `JSON.parse` throw — the red team ran all three.

## 7. Order of work

Each phase ships on its own, leaves the tree green, and **deletes what it replaces in the same
PR**. A `build:check` ratchet, `checkPluginMigration` in `tools/check-ownership.js`, counts what is
left of the old mechanisms — entries in `LATTICE_PLUGINS`, fence wrappers in `plugins.js`,
hand-named plugin selectors in the rosters of §3.2 — against a budget that only falls. (As
built, it counts fence wrappers and plugin token names from phase A, and the `language-<fence>`
rosters of a runtime-drawn fence from phase D; `LATTICE_PLUGINS` entries and other selectors are
not counted yet.) So a
stalled phase leaves fewer idioms, never three. **The resting state if phase D never ships**: math
and function-plot on the host; Mermaid and the charts on their current, working paths; the ratchet
recording exactly what is left.

- **A. The host core, and math on it.** `lib/plugins/` with the schema, the resolver, the code
  registry (+ `--check`), the host fence table, rule installation (§4.4), `ctx`, the harness, the
  vocabulary projection for `lint-core`, the `plugin` kind row, the #22 census root, the ratchet.
  Math moves on, byte-identical, benched. Synthetic fixtures prove the resolver's failure arms.
- **B. Function-plot on it.** One hydrate source compiled to the three artifacts (§4.7), the settle
  barrier, the payload loader, the wrapper chain deleted (anima registered through the table), the
  four rosters derived, function-plot CSS moved out of the math component. **Closes #299.** The
  settle barrier changes when the PDF is captured, so this phase carries **export sign-off**: the
  math gallery rendered in dark and light, sent before merge (QUALITY BAR).
- **C. `lattice packages new plugin`**, the draft `spec/LPM.md`, and the author docs.
- **D. Mermaid** — adds `bake` and `exec.bake`. **Done for the engine and the CLI** (§11); the
  browser half — the payload loader, the settle state, the `language-mermaid` rosters — is
  counted by the ratchet's `drawnFenceClasses` and recorded in
  `followups.d/2417-p5-plugin-phase-d-browser-half.md`.
- **E. The data layer** — zip import/export of plugins in the CLI and the Studio (§4.10).
- **F. The chart family** — `extensionPoints.kernel`; the registry reads chart kernels; renderer
  libraries move to `optionalDependencies` (export sign-off: it changes what installs).
- **G. The npm door**, after the legal grant; version ranges switch on. `spec/LPM.md` → 1.0.

## 8. Adversarial review of this note (HARD RULE #25)

The first draft went through the red team, Munger inversion and an independent checker before any
code. What changed because of them:

- **Blockers fixed:** the TeX title (JSON escapes; dropped, §6); a registry frozen at build time
  cannot hold user-installed plugins (two layers, §1).
- **High, fixed in the design:** one `hydrate` source needs three artifacts and a settle barrier
  (§4.7); markdown-it's `ruler.after` reverses same-anchor order, and syntax triggers had no
  collision check (§4.4); "data-only" zips could carry code by reference through `payload`,
  function-valued `providers` and slot selectors (§4.10, §4.3); hydrate files would leave the #22
  census (§4.7); the token check would have failed the pilot's own manifest (§4.9); the phase-A
  manifest contradicted the phase-A plan (§4.2).
- **Scope cut on the inversion lens's evidence:** eleven contribution points down to six (five once the owner moved the component relationship to the component side, §9 decision 5);
  versions down to names until npm; the spec a draft until D and F; charts stay components;
  math before function-plot; a deletion ratchet against the repo's record of half-built systems.
- **Claims corrected:** `data-fp-final` (Studio export, not runtime); math-detect parity *is*
  tested, on fixtures; three KaTeX CSS sources, not four; `mermaidUrl` in 22 files, not six;
  function-plot's footprint counted (43 files) instead of estimated; the video table is code.

## 9. Owner decisions (settled 2026-09-27)

1. **Scope and order: the lean in-tree core, math first.** Six contribution points, names-only
   dependencies, a draft spec until Mermaid and the charts run on it; math, then function-plot;
   #287 as its own PR.
2. **Math and function-plot are independent.** No edge between them, and no TeX title (§6).
3. **Zip plugins may carry fence code through the code-package door** once that door ships:
   consent pinned to the code's hash, then the locked sandbox. A fence renderer is `body → html`,
   the same shape as a package `transform.js`, so it fits the door the owner already admitted
   (portable-packages §9 Q4). `syntax` and `hydrate` stay refused: a parser rule and viewer-page
   code have no sandbox boundary. §4.10's zip row gains this at phase E.
4. **Portable-packages §7 is amended** to admit a build-time resolver over plugin names (§4.5) —
   implied by the owner's requirement that plugins may depend on plugins.
5. **Components depend on plugins; a plugin never names a component** (owner, 2026-09-27, after
   phase A's first review). A plugin is a capability that renders on any slide; a component is a
   layout that may be designed around one, and it declares `plugins: { requires | optional }` in
   its own manifest. The declaration is checked against the component's gallery and reported at
   render when a required plugin is off (§4.1). This replaces the first draft's
   `contributes.components`, and with it decision 1's count: five contribution points, not six.

## 10. Non-goals

- **No runtime discovery or network loading of code.** The export has to work offline, forever,
  under `script-src 'sha256-…'`.
- **No third-party section transforms or deck passes** (§4.3).
- **No marketplace, remote registry, `install` from a URL, or signing.**
- **No per-deck `plugins:` front matter.** A deck uses a plugin by using its syntax; an explicit
  list is a second place to keep in sync. The export's plugin record (§4.10) covers
  reproducibility.

## 11. Progress

- **Phase A, the host core and math: done, on this branch.** `lib/plugins/` holds the schema
  (`plugin.schema.json`, registered as a `tools/manifest-schemas.js` family), the resolver
  (`resolve.js`), the grammar host (`host-grammar.mjs`, the engine's path; the boundary parser
  installs the same block rules through the generated `blocks.generated.mjs`), the engine host
  (`host.js`), and `math/` — manifest, `math.syntax.mjs` (the inline and
  block rules and `detect`, merged from `lib/engine/math.js`, `lib/core/math-block-rule.mjs` and
  `lib/engine/math-detect.mjs`), `math.render.js` (KaTeX, moved from `lib/engine/math.js`),
  docs and fixtures. `tools/build-plugin-registry.js` writes `grammar.generated.mjs`,
  `registry.generated.js` and `blocks.generated.mjs` and is a `build:check` step. `lib/engine/index.js` names no plugin;
  `createEngine({ math, mathOutput })` map onto `plugins: { disabled, options }` in
  `pluginConfigFor`, whose key replaces the old math fields in both parser memo keys.
  `lint-core` reads `OPAQUE_BLOCK_TOKENS` instead of naming `math_block`. `plugin` is the
  spine's fifth kind, refused at every import door by name until phase E.
  **Evidence.** Byte identity: every tracked Markdown file under `examples/`, `lib/`,
  `test/integration/`, `docs/src/content/` and `spec/` (452), rendered by the engine at 16:9, 9:16
  and 21:9 with default, `math: false` and `mathOutput: 'html'` — 4,068 renders, of which the
  only 9 that changed are the one doc this phase moved and rewrote; the boundary parser's token
  stream for all 452 files, identical but that one. Bench, same machine, interleaved base/branch
  runs: the math dataset rendered in 96.2 / 96.5 ms on `main` and 94.1 / 101.5 ms on the branch
  (noise), with 0 re-typesets per keystroke both ways. The real Studio's
  `math-typeset-edit-cost.spec.ts` passes on the built site (5 cold typesets, 0 per keystroke).
  Mutation-proved: installing `after` rules forwards fails the install-order arm; a `detect`
  that misses inline math fails the superset arm; a hand-named `math_block` in `lib/core` fails
  the migration ratchet, and so does a budget left above the real count; a `innerHTML` write in
  a plugin folder is caught by `checkRuntimeMarkupSinks`.
  **Cost, and how it was brought down.** The first cut grew the Studio's startup JavaScript by
  584 bytes gzip, and after a rebase onto `706847f` by 1,427 (618,220 → 619,647, a pair): the
  boundary parser ships TWICE at startup — its own `slide-boundaries` chunk and the lint
  bundle's copy — and each copy carried the generic grammar host, every plugin's data and math's
  inline rule, none of which it uses. `main` had just set that budget at the owner's pick
  (618,500), so raising it was not this PR's call. Two changes gave the bytes back: the build now
  writes `blocks.generated.mjs`, a straight-line installer of the block rules in the host's order,
  which the boundary parser imports instead of the host (a unit test holds the two to one
  sequence); and a syntax module exports each rule under its token type instead of in one `rules`
  object, so a bundler keeps only what a consumer imports. Measured as a pair after both:
  618,220 → **618,330 (+110 bytes)**, inside the budget, which is unchanged.
  **A second checker pass, on that commit alone,** confirmed the install order holds for
  several plugins mixing `before` and `after` on one anchor (it built a scratch tree and compared
  both installers) and found four things, all fixed: the agreement test had one block rule, so it
  could not catch an ordering bug (a new test now builds a three-plugin tree through
  `tools/build-plugin-registry.js --root` and compares the two installers; mutation-proved); a
  plugin with a syntax module but no syntax and no `detect` generated a named import of `detect`
  that failed to link (the grammar now imports only what the module exports; mutation-proved);
  three docs still described the host as the boundary parser's path or a `rules` object; and the
  one-to-one check's reverse arm (an exported thing the manifest does not declare) now guards
  `renderers` only — an undeclared exported RULE is never installed by any path, so it cannot lie,
  and the resolver says so.
  **The relationship flip (§9 decision 5).** The plugin schema lost `contributes.components`
  and the component schema gained `plugins: { requires, optional }`; the math slide class
  declares `requires: ["math"]`. The resolver fails a component that requires a missing plugin
  and one whose gallery uses a plugin it does not declare — measured over every component gallery,
  only `math`'s uses plugin syntax — both arms mutation-proved by deleting and misspelling the math
  component's declaration. `registry.generated.js` exports `COMPONENT_PLUGINS`, and `render()`
  returns a `plugin/component-needs-plugin` diagnostic when a slide's required plugin is off; a
  normal render's result has no `diagnostics` key, so its shape is unchanged.
  **CodeQL caught a ReDoS in the fold of that checker's pass.** Restricting the diagnostic to
  slide sections used one regex with two lazy `[^>]*?` runs around a `data-form` test — polynomial
  on a tag of repeated attributes (8,000 → 299 ms, doubling quadrupled it), and deck text can come
  from a shared link. The scan now uses the repo's one section walker (`splitSections`, a tag
  tokenizer) and its one class reader (`readClassAttr`, #1358) — a hand-written `indexOf` scan was
  tried first and the class-attribute gate refused it, rightly — and is pinned by a sub-500 ms test
  on three hostile shapes that the old regex does not finish.
  **Byte identity re-taken after the rebase:** 455 files × 9 = 4,095 renders against `origin/main`
  `706847f`; every deck identical, the only differences the five Markdown docs this PR adds, moves
  or edits; the boundary-parser token streams likewise.
  **The ratchet's starting counts:** 2 fence wrappers (function-plot, anima), 0 plugin token
  names in code outside `lib/plugins`.
  **Maker-checker (HARD RULE #25).** An independent checker read the phase and confirmed the
  render path sound — rules byte-identical to the files they came from, anchors unchanged,
  `math: false` and `mathOutput` equivalent, no KaTeX reachable from the boundary parser or the
  pre-scan in an esbuild metafile, the registry regenerating from a missing or corrupt grammar.
  It found six things, all fixed here: `capabilities.md` stale after the `test:plugins` script
  (a red `build:check`); a changelog bullet that told deep importers to "update the path" when
  `installMath` no longer exists (now a **Breaking:** bullet naming `installPlugins`); the
  migration ratchet reading token names by the generated file's indentation, so a reformat made
  it pass with nothing checked (now read from the registry's data, failing on an empty registry,
  with six tests); a fixture parser that skipped a malformed bullet and split cases inside
  fences; and engine options read once but copied shallowly, with a string `disabled` silently
  spread into characters (now deep-copied, frozen, and type-checked).
  **Known limits, recorded rather than fixed:** the harness's detect-superset arm parses with a
  bare commonmark instance, not the engine's private parser, so a case where the engine's other
  rules change what a plugin sees is covered only by the `renders` bullets; and the resolver's
  trigger-collision check trusts the triggers a manifest DECLARES — nothing yet proves a rule
  fires only on them. Phase C's spec work picks both up. **Both closed in phase C** (next entry).

- **Phase B, function-plot on the host: done, on its branch.** `lib/plugins/function-plot/`
  (manifest, fence renderer, a self-contained `hydrate.js`, `styles.css`, docs, fixtures) and
  `lib/plugins/anima/` (fence only). The host owns ONE fence table in `lib/plugins/host.js`
  (first word of the info string, names and aliases; a name a highlight.js language owns is
  refused), so the wrapper chain in `plugins.js` is gone and `fenceWrappers` falls 2 → 0.
  `host-browser.mjs` is the browser half: the runtime imports it with `hydrate.generated.js`; the
  CLI page runs it serialized (`hydrate-script.js`, §4.7 as built). The settle state is markup —
  `pending` (engine) → `hydrating` → `rendered` / `error` / `unavailable`, `data-lattice-final`
  terminal — and every CLI capture (initial, autosplit, rails, player) and the Studio export wait
  on it. Math gained a ` ```math ` fence and a tokenized KaTeX `errorColor` (`var(--warn)`,
  measured: KaTeX writes it verbatim into both failure renderings, and Chromium resolves it in
  the MathML `mathcolor` too); `relationship.js`'s error test follows the new ink (mutation-proved).
  The dead `.math-error` became the math plugin's `.katex-error` surface. Rosters now derived from
  the registry: grammar.json's fences, the Marp fidelity ledger's `package` rows, the playground's
  staged libraries, the Studio capture's wait selector, the Read pane's bake gate; the math canvas
  and the fluid view size `[data-lattice-hydrate]`, never a plugin's class.
  **Evidence.** Engine HTML over every tracked Markdown file (523 × 3 configurations) identical to
  `main` but for the three decks with a plot (the placeholder's attributes) and the files this
  phase edits; the math gallery PDFs byte-identical in light and dark; the real runtime in real
  Chromium draws, releases and errors (`functionplot-runtime-load.test.js`); `--player` and
  `--read` keep `x²` (`functionplot-utf8.test.js`); demo deck `examples/plugin-system-phase-b`,
  rendered light and dark, with a before/after of the error ink.
  **Adversarial trio (HARD RULE #25).** No blocker. Folded: the fence probes now see a fence
  inside `>` or a list item (the Studio showed raw TeX there); the pending selector requires
  `[data-lattice-hydrate]` (an author element with the attribute stalled every capture and was then
  blanked) and a placeholder for an unknown plugin settles at once; `ctx.lib` must be a function
  (`<div id="functionPlot">` was called as the library); `hydrating` is a markup state, so
  `--fluid`'s two hosts cannot draw one figure twice; the build refuses code outside `hydrate()`
  (a module-level `const` passed the require/import check and broke only the CLI page); every
  hydrator runs on both surfaces over its own fixtures; the CLI warns when a used library is not
  installed; the ratchet counts a `fence` override anywhere, in either spelling; payload files are
  unique and never a host asset; a failing fence renderer degrades to a code block; three
  untested resolver arms and the build's real reserved-name wiring are pinned; docs corrected
  (`--read` never carried a plot; the CLI waits 5 s, not 4).
  **Left, with their reason:** the serialization limit for Mermaid (§4.7, phase D's call); a
  highlight.js upgrade that reserves a plugin fence name fails the build rather than grandfathering
  it; `--fluid` and plain `--html` link the library by a `file://` path (predates the plugin).
  **The grandfathering has since landed:** the build reads the fence claims the committed
  `grammar.generated.mjs` records, and the resolver turns a reserved-name collision on one of
  those, for the same plugin, into a warning (`fence-hydrate-resolve.test.js`, red then green).
  The math plugin's `.katex-error` rule is no longer scoped to `section`, so the player's Read ·
  Article, which re-hosts slide content outside any section, shows a failed formula on the same
  error surface a slide does.

- **Phase C (partial): the scaffold, the draft spec, and the harness's two known limits.**
  `lattice packages new plugin <name>` (`lib/packages/new-plugin.js`) writes a package that builds
  and passes the harness unedited — proven on a clean tree: scaffold, `npm run build`,
  `build:check`, `test:plugins` (121 of 121, the new plugin's six cases among them). `spec/LPM.md`
  is the contract as a draft (0.1). The harness closes both limits recorded under phase A: the
  detect-superset arm now takes the UNION of the bare plugin-only parse and the engine's own parser
  (`createEngine()._tokens`, a test seam) — neither alone suffices, measured both ways: a glossary
  slide's core rule rebuilds its cells, so the engine's token stream hides math the render still
  typesets, while a bare parse sees tokens the engine never makes (table headers, front matter);
  and every rule of every plugin is fed each printable ASCII character it does not declare, in four
  input shapes, silent and not, and must decline without moving the parser. Both mutation-proved: a
  `math_inline` that also opens on `#` fails the trigger arm (the first cut's single probe shape
  missed it, so three were added), and a harness that drops the engine parse fails its own arm.
  **Checker (tier 1) on the scaffold and the harness** — fix-then-ship, folded: the scaffold passed
  `test:plugins` but failed the full `npm test` (the Marp fidelity ledger demanded a row for every
  fence plugin — now derived from the manifest for any plugin without a hand row); the first
  `npm run build` after scaffolding shipped `lattice.css` without the new plugin's CSS (the registry
  step ran after `build-css`; it now runs before); LPM promised plugin-reported diagnostics api 1
  cannot emit (the spec now says only the host reports, and only `deprecated-alias`); the trigger
  arm let through a rule opening on `%%`, `##`, `€`, one mutating `parentType`, and one firing only
  mid-text (now seven shapes, two positions, non-ASCII characters and a state check — all five
  mutations fail it); scaffold edges (a name cap of 64, a stray second name refused, the figure's
  default margin reset). Re-proven: a scaffolded plugin, one `npm run build`, then the full
  `npm test`, with its CSS in `dist/lattice.css`. Left: `createEngine()._tokens` is reachable from
  any page that loads the engine — a test seam, undocumented, read-only.

- **Phase D, Mermaid on the host — engine and CLI: done, on its branch; the browser half is
  recorded.** `lib/plugins/mermaid/` declares the ` ```mermaid ` fence `as: "code"` (the plugin owns
  the name; the engine renders the same highlighted block, so no engine byte moved), a `bake`
  (`render.exec.bake: "subprocess"`) and `render.exec.hydrate: "runtime"` (§4.7 as built).
  `mermaid.bake.js` is the CLI's diagram bake MOVED out of `lattice-emulator.js` — the fence walk,
  the worker plumbing and the image-set re-bake record — closed over one export's `ctx`, so two
  exports in a process share no SVG id counter. `lib/plugins/host-bake.js` runs every active,
  used plugin's bake before the engine; the emulator supplies the services and keeps the one
  palette-assembly site. The resolver gained the new arms; `mermaid` stopped being a
  host-reserved name; the `diagram` component declares `requires: ["mermaid"]` (the resolver
  demanded it); grammar.json's row and the Read pane's bake gate derive from the registry
  (`drawn.generated.mjs`). The ratchet gained `drawnFenceClasses` (18): the `language-mermaid`
  rosters the browser half still owes.
  **Evidence.** Engine HTML over 478 tracked Markdown files × 4 configurations: identical to
  `main`. CLI `.html` of all 43 tracked diagram decks: identical to `main` but for gitGraph's
  random merge-commit ids, which differ between two runs of `main` itself. The
  `examples/mermaid-diagram-surface` PDFs byte-identical to `main`, light and dark. The checker
  diffed the move line by line (only the named rebindings differ) and matched an image-set `.zip`
  with a cross-scheme re-bake file for file.
  **Adversarial trio (HARD RULE #25).** Folded: the host's "uses mermaid" probe allowed only space
  and tab before the name while the bake's matcher trims all whitespace, so a deck whose fences
  carried a no-break space exported source while the preview drew it — a regression this phase
  made, fixed and pinned by a superset test over ten whitespace kinds (red then green); a bake that
  throws fails the CLI export again (`strict`), as it did before, rather than exiting green with
  source where the diagrams go; LPM marks `"runtime"` in-tree and transitional, splits the bake
  `ctx` into stable and in-tree members, and refuses `bake` in the zip channel (§4.10); the docs'
  blockquote claim corrected (the CLI does not draw a blockquoted fence — a known gap).
  **Left, with their reason** (`followups.d/2417-p5-plugin-phase-d-browser-half.md`): the
  browser half — the library still loads by `mermaidUrl`, the runtime's `data-mermaid-state` is
  invisible to the host's settle barrier, and 18 rosters name `language-mermaid`. By surface, the
  engine and the CLI run through the host; the preview, the Playground, `--fluid`, the Studio
  export and the player's browser-side paths do not yet.

## References

- [`2026-06-14-plugin-extension-system.md`](2026-06-14-plugin-extension-system.md) — LPM.
- [`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) — tiers, trust by channel, dynamic loading.
- [`2026-09-13-projected-rosters.md`](2026-09-13-projected-rosters.md) — the "declare once, derive the rosters" precedent.
- [`2026-09-23-portable-packages.md`](2026-09-23-portable-packages.md) — the spine; §7 amended here.
- [`2026-09-24-code-package-contract.md`](2026-09-24-code-package-contract.md) — the sandbox; viewer-page code is outside its v1.
- [`2026-06-29-component-transformer-threat-model.md`](2026-06-29-component-transformer-threat-model.md) — declarative-only for untrusted channels.
- [`2026-07-10-landing-perf-katex-defer.md`](2026-07-10-landing-perf-katex-defer.md) — why math's pre-scan exists.
- [`2026-07-02-contribution-model.md`](2026-07-02-contribution-model.md) — the legal door that gates npm.
- `spec/LFM-1.0.md` §10–11 — the deferred out-of-tree registration path.
- Issues **#287**, **#299**.
