---
status: proposed
summary: The plugin system, designed whole and hardened by the adversarial trio before any code. A plugin is a package (`type: "plugin"`) — one folder, one manifest that declares WHAT it contributes and whom it depends on, and role-named modules that say HOW — so the in-tree folder, the exported zip and the Studio record hold the same files. In-tree plugins are resolved at build time into one frozen code registry every render path reads; installed plugins join at render time as an interpreted data layer. Plugins stand alone or declare `requires` / `optional` on others. Math and function-plot are the pilots; Mermaid and the chart family are mapped onto the contract so it is designed for them, not retro-fitted. Reconciles LPM (2026-06-14), the plugin architecture (2026-09-13) and portable packages (2026-09-23), and amends the last one's "no dependency resolver".
---

# The plugin system — one package shape, declared dependencies, two registry layers

**Date:** 2026-09-27 · **Decision owner:** Sharmarke · **Status:** proposed; nothing built. §9 holds
the decisions that are the owner's.

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
(` ```functionplot `), a slide class, or a figure that a browser draws. It carries

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

**The pilots are math and function-plot.** Math is the hard shape — syntax on every slide, a sync
renderer, install options, a CSS and font payload — so it goes first and the host is shaped by
the hardest case, not the easiest. Function-plot is the other shape — a fence, a browser renderer,
a library loaded only when used — and it declares a dependency on math (§6 and §9 say how strong).

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
  function-plot.syntax.js        parse time: fence renderers and markdown-it rules. Pure; Node AND browser
  function-plot.hydrate.js       the browser half: turns placeholders into figures. ONE source for every surface
  function-plot.styles.css       token-only CSS
  function-plot.docs.md          what an author reads (the HARD RULE #6 contract)
  function-plot.gallery.md       a live example deck
  function-plot.fixtures.md      conformance cases (§4.12)
```

Every file is `<name>.<role>.<ext>`, the spine's rule. A plugin carries only the roles it needs.
The kind row requires `manifest.json`, `docs.md` and `fixtures.md`: docs because #6 makes them the
author's contract, fixtures because a plugin with no case cannot show it works. Role modules are
CommonJS like the rest of `lib/`.

**Why a new kind rather than a bigger component manifest.** LPM put a `render` block on the
component manifest. That fits one slide class with one transform — a chart — and does not fit
math, which contributes syntax that works on *every* slide, a service-free engine-wide renderer,
a font payload *and* a slide class. So a plugin is the unit of **capability**, and it may
**contribute components**: the math plugin names the `math` component the way a VS Code extension
contributes a view. The component folder stays where it is; `lattice packages export plugin/math`
carries the named component folders inside the zip under `components/<name>/`, and import puts them
back through the component door. **Charts stay components** (§5): each is one slide class, which
is exactly what the component manifest already describes.

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

  "optional": ["math"],                         // §9 decision 2; the phase-B default

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
`contributes.fences` must have a renderer exported by `syntax.js` under the same name; a declared
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

### 4.3 Contribution points — six in v1

| Point | The author writes | The plugin supplies | Host owner |
|---|---|---|---|
| `syntax` | delimiters in prose (`$…$`, `$$…$$`) | a markdown-it rule, its **trigger characters**, its host anchor, and `detect(source)` | the engine's parser, **and** the boundary parser |
| `fences` | ` ```name ` | `render(body, ctx) → html` | one host fence table |
| `hydrate` | nothing | `hydrate(el, ctx) → Promise` over a declared selector | one host hydrator on every browser surface |
| `components` | `<!-- _class: X -->` | the names of component folders it owns | the existing component walk |
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
inline syntax, block syntax and a slide class — so the surface belongs to each *contribution*.

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
"optional": ["math"]              // uses it when present; must work without it
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
reports a diagnostic, while plugins with `optional: ["math"]` run without it.

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
- **CLI export page:** `tools/build-plugin-registry.js` also compiles each `hydrate.js` with esbuild
  into a standalone script (IIFE), marked with `ENGINE_SCRIPT_ATTR` so the player's prune step
  treats it like the engine's own. The emulator injects it only when the deck uses the plugin.
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
per-URL promise cache, their retry after a failure, their poll for the declared `global`. The CLI
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
| **Zip / Studio / AI-generated** (the data layer) | `components` without a transform, `styles`, `diagnostics` | phase E. **Refused:** `payload`, any `exec`, `syntax`, `hydrate` — and every script file by extension, which `lib/packages/read.js:35` already does. `fences` code only per §9 decision 3 |
| **npm** (`lattice-plugin-*`, resolved at build time) | every code contribution | phase G, after the `LICENSE-EXCEPTIONS` plugin grant (contribution model, finding 6). Discovery by an explicit list, not by name prefix, so a transitive dependency named `lattice-plugin-*` gets no code into a deck |

**Names.** Shipped plugin names are reserved, per the spine's `<name>-custom` rule. A data-layer
plugin that collides with a shipped one, or with another installed plugin, is **disabled with a
diagnostic** — it never fails every build on the machine, including builds of decks that do not use
it.

**Reproducibility.** An installed plugin changes how decks render on that machine. So every export
records the non-shipped plugins the render used (name + SHA-256 of the package) in its metadata,
and a render that names a slide class or fence it cannot find says which plugin provides it.

### 4.11 Import and export

`plugin` becomes the fifth row in `lib/packages/kinds.js` (root `lib/plugins`, layout `folder`,
required `manifest.json`, `docs.md`, `fixtures.md`; code roles `syntax.js`, `hydrate.js`):

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

writes a folder with a manifest, a `syntax.js` exporting one fence renderer, a stylesheet using two
tokens, a docs page, a one-slide gallery and two fixtures — and the build and the harness pass on it
untouched. `lattice packages check <folder>` runs the schema, the resolver and the fixtures.

## 5. The future plugins, mapped onto the contract

| Plugin | Contributes | `exec` | Depends on | Moving it deletes |
|---|---|---|---|---|
| **math** | `syntax` (`$`, `$$`), `components: [math]`, `styles`, payload (KaTeX CSS, fonts, the browser provider) | parse-time, sync | — | the hand install in `boundary-parser.mjs`, `installMath`'s special case, `ensure-katex.ts`, two of three KaTeX CSS sources |
| **function-plot** | `fences.functionplot`, `hydrate`, `styles`, payload | `hydrate: browser` | `optional: [math]` (§9) | the second inflater, the fence wrapper, four hand rosters (§3.2), function-plot CSS in the math component |
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

The `.katex-error` color (§3.3 defect 4) is fixed in the same phase by passing KaTeX an
`errorColor` that resolves through a token — whether KaTeX accepts `var(--…)` there is unverified
and is the phase's first measurement — and `.math-error`'s dead rule and sanction are deleted.

**Function-plot is the second shape**, and declares its relationship to math. What that
relationship honestly is:

- Function-plot **works on any slide without math**. Only math's `canvas` variant hosts it.
- Math's canvas CSS names `.functionplot` (§3.3 defect 5). That knowledge moves into the
  function-plot plugin, written against a class math's canvas stage owns (`.cell-stage > .figure`
  or the like), so knowledge flows one way: the guest knows the host, never the reverse.

That is an **`optional`** edge. A `requires` edge would be a claim the build can never see fail.
The first real `requires` edges are the chart kernels on the family (phase F). The resolver's
failure arms — missing, cycle, disabled dependency — are proven in phase A with synthetic fixture
plugins, which is exactly what fixtures are for.

**Dropped from the first draft: typesetting a plot's title with KaTeX.** The title lives inside
the fence's JSON, so JSON escapes run before KaTeX sees it: `"$\frac{1}{x}$"` parses to a form feed
plus `rac{1}{x}`, `\beta` to a backspace plus `eta`, and `\alpha` makes `JSON.parse` throw — the
red team ran all three. A TeX title needs a carrier outside the JSON (a caption line after the
fence, say) and is its own visible feature with its own demo deck (HARD RULE #9), if the owner
wants it (§9 decision 2).

## 7. Order of work

Each phase ships on its own, leaves the tree green, and **deletes what it replaces in the same
PR**. A `build:check` ratchet, `checkPluginMigration` in `tools/check-ownership.js`, counts what is
left of the old mechanisms — entries in `LATTICE_PLUGINS`, fence wrappers in `plugins.js`,
hand-named plugin selectors in the rosters of §3.2 — against a budget that only falls. So a
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
- **D. Mermaid** — adds `bake` and `exec.bake`.
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
- **Scope cut on the inversion lens's evidence:** eleven contribution points down to six;
  versions down to names until npm; the spec a draft until D and F; charts stay components;
  math before function-plot; a deletion ratchet against the repo's record of half-built systems.
- **Claims corrected:** `data-fp-final` (Studio export, not runtime); math-detect parity *is*
  tested, on fixtures; three KaTeX CSS sources, not four; `mermaidUrl` in 22 files, not six;
  function-plot's footprint counted (43 files) instead of estimated; the video table is code.

## 9. Decisions for the owner

1. **Scope and order**: the lean in-tree core (six contribution points, names-only dependencies,
   a draft spec), math first, function-plot second, #287 as its own PR. *Recommended.*
2. **Function-plot's edge to math**: `optional`, with no TeX title in the pilot. *Recommended.*
   The alternative is to ship the TeX title as a feature — a caption line outside the JSON, rendered
   through a math service — which makes the edge real and costs a service contribution point, a
   demo deck and a layout change for titled plots.
3. **Zip plugins carrying fence code.** The owner already admitted code packages behind consent and
   the sandbox (portable-packages §9 Q4). A fence renderer is `body → html` — the same shape as a
   package `transform.js` — so a zip plugin's `fences` could ride that door when it opens, which is
   the one way an imported plugin can add new vocabulary. `syntax` and `hydrate` stay refused (a
   parser rule and viewer-page code have no sandbox boundary). *Recommended:* yes, as part of
   phase E once the code-package door ships.
4. **Amend portable-packages §7** to admit a build-time resolver over plugin names (§4.5).
   *Recommended.*

## 10. Non-goals

- **No runtime discovery or network loading of code.** The export has to work offline, forever,
  under `script-src 'sha256-…'`.
- **No third-party section transforms or deck passes** (§4.3).
- **No marketplace, remote registry, `install` from a URL, or signing.**
- **No per-deck `plugins:` front matter.** A deck uses a plugin by using its syntax; an explicit
  list is a second place to keep in sync. The export's plugin record (§4.10) covers
  reproducibility.

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
