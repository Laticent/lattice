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
| R5 | Easy to use | the author types the fence or syntax; every shipped plugin is loaded by default, and a deck names any other in its `plugins:` list (amended 2026-10-05, §9 decisions 6 and 9 — usage no longer loads a plugin; it decides when a loaded one's payload loads) | §4.8, §9 |
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
One folder is allowed beside them (since #2509 P5, §11): `shared/`, IN-TREE ONLY, the modules a
plugin's role files import (Mermaid's init directive, render worker, reorientation, motion roles).

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
- `exec.hydrate: "pass"` — Mermaid (phase D's browser half): a `hydrate.js` exporting
  `createPass(ctx)`, a document pass the runtime drives, for a browser half that cannot draw one
  figure on its own (a global renderer config that needs every figure grouped by palette).
- `highlight` — Mermaid (phase D's browser half): a highlight.js grammar the host registers under
  the plugin's code fences, so the source a fence shows before it is drawn is colored.
- `services` — a plugin calling another plugin's named function, declared in the manifest
  (`contributes.services: ["tex"]`) so the one-to-one check covers it. **Built 2026-10-05 with
  the icons plugin**, whose `drawHtml` / `drawElement` / `known` / `whyUnknown` the core pill
  calls for `icon=` through `lib/plugins/services.js` `service(plugin, name, off)` — null with
  the plugin off, so a caller renders without it (`2026-09-29-inline-icons.md` § 12).
- `inline` — an inline-code kind behind one Segno tag character (`^{…}`), a row in the host's
  dispatch table (`lib/core/inline-code-directives.js`) after the host's marks, pills and sparks.
  Built 2026-10-05 for icons; in-tree only, like `syntax`.
- `registers` — a front-matter axis register declared as data (`icon: bare etching` → `icon-*`
  slide classes), built by the host's register factory (`lib/core/register-factory.js`), which
  `spark:` now uses too. Built 2026-10-05 for icons; data, so a later data plugin may declare one.
- `data` — data a plugin's kernels read only through `lib/plugins/plugin-data.js`: a lazy loader
  on Node, its own on-demand script in a browser (`lattice-plugin-<name>.js`), so a deck that does
  not use the plugin never loads it. §4.8's "payload when used" for in-tree data. Built
  2026-10-05 for icons.
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
  **As built (phase D): (a).** `render.exec.hydrate: "runtime"` marked a plugin whose browser half
  was the runtime's own pass, with no hydrate module to serialize; the resolver then REQUIRES a
  `bake`, and the CLI draws the plugin there (`lib/plugins/host-bake.js`). Mermaid's fence is
  declared `as: "code"`, so the engine's bytes did not move (§11, phase D).
  **As finished (phase D's browser half, 2026-10-04): `"pass"` replaced `"runtime"`.** The pass
  moved into the plugin as `lib/plugins/mermaid/mermaid.hydrate.js`, exporting `createPass(ctx)`
  — a DOCUMENT pass, because Mermaid's global config cannot draw one figure on its own. The
  runtime bundles it through `passes.generated.js` and drives it (`boot`, `run`, `onMutations`)
  without naming it; it is never serialized, so the no-import rule does not apply to it, and the
  `bake` requirement stands. The CLI export page is unchanged: it still bakes.
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

> **Amended 2026-10-05 (§9 decisions 6 and 9).** This section decides when a loaded plugin's
> PAYLOAD (and its bake) runs. It no longer decides whether a plugin is loaded at all: every
> plugin is loaded explicitly — the default set, the deck's `plugins:` import list, or a component
> that requires it (`lib/plugins/host-grammar.mjs` `admitPlugins`). The probe below never admits
> one.

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
| **icons** | `inline` (the `^{…}` kind), `services` (`drawHtml`, `drawElement`, `known`, `whyUnknown`; callers: the pill's `icon=`, chart kernels next), `registers` (`icon:`), `data` (the curated Tabler drawings, loaded when used), `styles`; flowchart, state-chart and hub-spoke declare `optional: ["icons"]` in phase 2 | parse-time | — | the inline-code dispatcher's hand list (it is a table now). Design: `2026-09-29-inline-icons.md` § 6a; as built: § 12 |

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
- **D. Mermaid** — adds `bake` and `exec.bake`. **Done for the engine and the CLI** (§11), and
  **the browser half since** (§11): the library loads through the host's `payload`, the settle
  state is the host's, and no browser code names Mermaid by any of the three hand idioms the
  ratchet counts (`drawnFenceClasses`, `drawnLibraryUrls`, `drawnSettleStates`, all 0). **And the
  plugin owns its browser half** (§11, 2026-10-04): the diagram pass is the plugin's `hydrate.js`
  (`render.exec.hydrate: "pass"`), its stylesheet and highlight grammar are its `styles` and
  `highlight` contributions, and the bake context's services are generic — three more ratchet
  arms (`runtimePluginNames`, `pluginAssetsOutside`, `bakeContextByName`), all 0. Its last
  consumers moved with #2509 (`drawnFigureClasses`, 0; `--disable-plugin`); its residue is decided
  (§11, "Phase D's residue, decided"), and what is still open is
  `followups.d/2509-p5-mermaid-library-copies.md`.
- **E. The data layer** — zip import/export of plugins in the CLI and the Studio (§4.10).
- **F. The chart family** — `extensionPoints.kernel`; the registry reads chart kernels. **Done**:
  the slot (§11, "Phase F, the slot"), then the family's code and stylesheet (§11, "Phase F, the
  family's code"): the dispatch is the plugin's `chart-family.dispatch.js` and the chart frame is
  its `styles` contribution. The renderer-library step has nothing to move: chart kernels import
  only the in-repo workspace libraries (`@laticent/trama`, `@laticent/segno`), no npm dependency.
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

### Owner decisions (settled 2026-10-04, phase E's four questions)

Put to the owner in one round with #2508's merge ask (the questions are in
`followups.d/2417-p5-plugin-roadmap-phases-e-to-g.md`).

6. **Every plugin is loaded explicitly — by default, or by the user.** The owner's words: "all
   plugins should be explicitly loaded by default or by the user … plugins are plugins, we don't
   care if they are style only." Three ways in, all explicit: the shipped default set; a deck's
   front matter, which enables a list of plugins; and a component that declares the plugins it
   needs (§9 decision 5), which loads them. The Studio gains a **Plugins tab in its settings**.
   This replaces §4.8's "loaded because the deck uses it" as the LOADING rule; usage detection
   stays as what a payload waits for, not as what admits a plugin.
7. **A zip plugin's CSS reaches only its declared targets.** The manifest names the plugins it
   styles; the gate scopes every selector under the host's marker for those plugins
   (`[data-lattice-hydrate="<target>"]`) or under its own `.<name>`, and it passes the same
   token-only gates component CSS does, through HARD RULE #22's style sink.
8. **The zip channel waits for the code-package door.** No styles-only zip channel ships first:
   phase E's import and export build when a data plugin can own a fence through the door (§9
   decision 3), so a zip plugin is never a lesser kind of plugin (decision 6's "plugins are
   plugins"). The Studio's storage for one is decided with that phase.

### Owner decisions (settled 2026-10-05, E0's semantics)

Answered by the owner on #2509 after #2508 merged; written here with the E0 change that builds them.

9. **What "explicit" means, in three rules.**
   - **The default set is every shipped plugin** (`math`, `function-plot`, `mermaid`, `anima`). A
     deck with no `plugins:` key renders byte-identical to before E0.
   - **Front matter `plugins:` is an import list.** It names the plugins the deck needs enabled.
     Listing a default plugin is a no-op. There is no `-name` removal syntax and no "exactly these"
     reading: a list only ever adds. A name no plugin has is reported (render diagnostic
     `plugin/unknown-plugin`, lint `unknown-plugin`) and changes nothing.
   - **The Studio's Plugins tab toggles the current deck's front matter.** It writes the deck's
     `plugins:` key, so the choice travels with the deck and every export reproduces it. The tab
     shows what is on for this deck and why: default, listed, or required by a component.

   **As built (E0).** One kernel decides admission for every render path:
   `lib/plugins/host-grammar.mjs` `admitPlugins(source, { defaults, disabled })` — the default set
   ∪ the listed plugins ∪ the plugins the deck's slide classes require (`COMPONENT_PLUGINS`, now in
   `grammar.generated.mjs`), closed over `requires`; then the host's `disabled` switch, which
   cascades as before and which a deck cannot override. `lib/plugins/deck-plugins.mjs` is the one
   reader and writer of the list (every YAML spelling of a list of names reads; the register is a
   SPAN of lines, so the writer replaces all of it and leaves no orphaned line; the Studio writes
   `plugins: [a, b]`) and of the deck's class directives and pane markers (which replaced
   `lib/packages/render.js`'s reader; that file re-exports it). It is linear by construction — the
   red team found a quadratic blank-line strip and an inherited cubic class-directive regex in the
   first cut, both now pinned by timing arms in `test/unit/plugins/admit.test.js`. The
   engine admits per render and keys both parser memos on the resolved off-set; the CLI's
   `bakeDeck` admits from the same source; `createEngine({ plugins: { defaults } })` lets a host
   narrow the default set, which is how the listed and component routes are tested end to end.
   The usage probe stays as a WARNING, never a route: `admitPlugins` returns `unloaded` (plugins
   no route loaded that the deck uses) and the engine reports each as `plugin/used-not-loaded`.
   It is empty, and the probe never runs, while every plugin is in the default set.

   **Where admission is enforced (E0, then #2509 P3).** E0 enforced it in the engine and the CLI's
   `bakeDeck`; the inversion lens found three browser paths still acting for every shipped plugin
   (the runtime's passes, the boundary parser's block rules, the drawn-fence probes) and the CLI
   configuring the engine and the bake apart. The follow-up closed them through the engine's
   markup: a fence `as: "code"` of a plugin the deck did not load renders with
   `data-lattice-off="<plugin>"` on its `<pre>`, and every pass, probe and the preview's
   ink-withholding rule skips it — so every surface that shows the engine's render honors
   admission with no knob of its own, and a default-set render is byte-identical. Admission is
   deck-wide, so the Studio's one-slide renders take the whole deck's answer
   (`LatticePlayground.pluginAdmission` → `render(…, { pluginDefaults })`) and key their caches on
   it (inversion lens). Not yet: the Export-to-Marp bundle and the Studio's own lint and slide
   mapping — `followups.d/2509-p3-admission-marp-and-studio-source-readers.md`. The CLI admits once per run (new
   `--default-plugins`) and hands the same knobs to the engine and `bakeDeck`, and the answer's
   `off` to the boundary parser (`setBoundaryPluginsOff`). The `highlight` grammars stay registered
   for every installed plugin, on purpose. A host may narrow the default set.

## 10. Non-goals

- **No runtime discovery or network loading of code.** The export has to work offline, forever,
  under `script-src 'sha256-…'`.
- **No third-party section transforms or deck passes** (§4.3).
- **No marketplace, remote registry, `install` from a URL, or signing.**
- ~~**No per-deck `plugins:` front matter.**~~ **Retired 2026-10-05** by §9 decisions 6 and 9: a
  deck's `plugins:` list is how a deck names what it needs, and it only ever adds.

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
  error surface a slide does. The Studio's Read pane applies the deck sheet only inside figures,
  so it carries the same declarations in its own article sheet (`ReadArticle.tsx`), held equal to
  the plugin's by `ReadArticle.test.ts`.
  And the CLI page now INLINES a used plugin's library (`payloadScript` in `hydrate-script.js`)
  instead of linking it by `file://` path: the PDF was always right, but an `--html` or `--fluid`
  export opened anywhere else showed each plot's config. The PDFs of the phase-B demo deck are
  byte-identical across the change, light and dark; `moved-export-draws-plots.test.js` loads a
  copied export with every request outside its directory refused.

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

- **Phase D, the browser half: done, on its branch.** No browser code names Mermaid by any of
  the three hand idioms the ratchet counts — a narrower claim than "no browser code names
  Mermaid", and deliberately so: the plugin's own output classes (`.mermaid`, `.mermaid-svg`),
  the runtime pass itself (`MERMAID_PLUGIN`, until it moves into the plugin) and the `mermaid`
  boolean prop the preview components still pass are recorded in the followup, not counted.
  `checkPluginMigration` first widened to count a runtime-drawn plugin's hand-threaded library
  URL (`drawnLibraryUrls`: 82 `mermaidUrl`s in 23 files) and its private settle state in code and CSS (`drawnSettleStates`:
  67, `data-mermaid-state` / `dataset.mermaidState` / `data-mermaid-final`), beside the
  `language-mermaid` rosters (`drawnFenceClasses`: 18) — then all three fell to 0 in the same PR.
  - **The library is the plugin's `payload`** (`npm:mermaid/dist/mermaid.min.js`) — the same npm
    package the CLI bake already resolved (`mermaid/dist/mermaid.js`, render-worker.js), so the
    preview and the PDF now draw with one version. It is byte-identical to the committed
    `mermaid-v11.min.js` the Export-to-Marp kit and the integration tier's browser harness load,
    and `mermaid-library-parity.test.js` holds the two equal, so a Dependabot bump cannot move
    one without the other.
    `sync-playground-assets.mjs` stages it beside `lattice-runtime.js` from the registry, and the
    runtime's diagram pass asks the host for it (`ensureLibrary`, the loader a hydrator's library
    uses) when a document holds a fence and no host wrote a Mermaid tag. No page threads a URL; a
    frame builder PRELOADS the library for a document with a drawn fence (`drawnLibraryPreload`),
    so the cold first diagram does not pay for the runtime's fetch and the library's in series; a
    fence patched into a live document loads the library then (the docs-site builders still
    rebuild the frame when a deck gains its first diagram, so that path serves hosts that patch);
    a 404 fails before `load`, so the desktop print still gets the source, and so does a fence
    that arrived after the boot deadline. A host that writes its own tag (the Marp kit) keeps the
    old fast arm and is never sent a second copy. In the script's own `onload` the runtime turns
    Mermaid's `startOnLoad` off and draws at once, because Mermaid's own on-load pass would
    otherwise paint its error graphic into our empty targets. The Studio's diagram checker (now
    lazy, `mermaid-parse.ts`) and idle warm-up derive the same address (`drawn-library.mjs`).
  - **The settle state is the host's.** The runtime tags each fence's `<pre>` with
    `data-lattice-hydrate="mermaid"` and `data-lattice-settle` (`hydrating` for the old
    `rendering`, `data-lattice-final` for `data-mermaid-final`), so the Studio export waits on
    `PENDING_FIGURES` alone — its untagged-fence probe and its private state whitelist are gone —
    and counts every runtime-drawn figure the same way. The runtime's host knows runtime-drawn
    plugins (`runtimeDrawn`), so `run` leaves their fence `<pre>` to the pass — and releases any
    other element carrying the name, which an author wrote and nothing will settle; the CLI page,
    which runs no such pass, releases them all. `releaseFigure` keeps a code-block figure's own
    content (it has no packed config). The engine CSS moved to the host's attribute with the
    plugin name in `:where()`, so every rule weighs what it weighed.
  - **The figure geometry is settled, not incidental.** A code-block figure is its SOURCE `<pre>`,
    tagged, with the drawing in a sibling the plugin owns (`.mermaid`); a placeholder figure is the
    tagged element itself. When the runtime pass moves into the plugin as a `hydrate.js` (the
    followup), that hydrate draws into the sibling and the host's markup stays on the `<pre>`, so
    this DOM contract does not break a second time; the host gains the one difference (draw beside,
    not into) then.
  - **The rosters read the registry**: `drawn-probe.mjs` answers "does this owe a drawing?" as a
    DOM selector, over rendered markup and over Markdown source; the two HARD RULE #22 scanners
    (`remote-ref.js`, `door-attr.mjs`) carry a copy pinned to the registry by a test.
  - **The engine did not move**; lattice.css did (the selectors). The engine is unchanged by
    construction — the fence stays `as: "code"` and the runtime, not the engine, writes the markup.
  **Evidence.** Engine HTML over 482 tracked Markdown files × 4 configurations (1,928 renders)
  identical to `main` but for the two docs this PR edits. The diagram gallery's CLI PDFs are
  byte-identical to a same-machine `main` run, light and dark (the new selectors never match on
  the CLI page). A Studio PDF export of the diagram gallery from a local `build:e2e` of this
  branch and of `main`: all 62 pages (31 light, 31 dark) pixel-identical, and every Mermaid
  request went to `mermaid.min.js` beside the runtime. Real Chromium
  (`mermaid-unavailable.test.js`): the payload draws with no host tag, a payload 404 hands the
  fence back in under 2 s and before `load`, a deck with no fence never asks. The startup JavaScript cost, measured as a pair against `main` (the diagram checker's library half went lazy, the probe and the builders' preload came in):
  the Studio's rose 37 bytes gz (634,157 → 634,194) and the Playground's 195 (601,551 →
  601,746), both inside the owner's budget (docs/route-budget.json, unchanged). Cold cache, real
  Chromium, median of three (first diagram drawn; the old host tag / the host's load / plus the
  preload): 957 / 1,073 / 837 ms for one diagram and 1,053 / 1,065 / 954 for four on a fast link;
  4,287 / 4,782 / 4,334 and 4,607 / 4,874 / 4,444 at 150 ms latency and 2 MB/s — and
  `DOMContentLoaded` falls from ~1.0 s to ~0.3 s (fast) and ~4.3 s to ~3.4 s (slow), because the
  parser no longer blocks on the library.
  **Adversarial trio (HARD RULE #25).** No blocker stood. Folded: Mermaid's own on-load pass
  painted its "Syntax error in text" graphic into our empty targets for ~130 ms in up to 4 of 4
  runs (red team; `startOnLoad` off in the script's onload, pinned by a five-run cell that fails
  on its first run without the fix); a fence patched in after the boot deadline, whose library
  then 404ed, stayed hidden for good because the give-up is one-shot (checker; the failure now
  releases itself, cell red then green); a debounced pass asked for the payload in a document
  whose host wrote an async Mermaid tag, 404ed and flashed the source (checker; gated, cell red
  then green); a forged `<div data-lattice-hydrate="mermaid">` held the Studio export for its
  whole budget (red team; released as an unknown placeholder); the two library copies could drift
  on a Dependabot bump (inversion; parity test); the CLI host's `runtimeDrawn` guarded a pass
  `--fluid` never runs (red team; dropped); two `.astro` source probes narrower than the registry's
  (inversion; replaced); `ensureLibrary` and `runtimeDrawn` had no per-PR test (checker, red team;
  unit tests, mutation-proved); the cold-cache delay (inversion; preload); stale comments and
  overclaims (all three).
  **Left, with their reason** (the rewritten `followups.d/2417-p5-plugin-phase-d-browser-half.md`):
  the runtime pass moving into the plugin; the plugin's own CSS and highlight grammar; the bake
  `ctx`'s Mermaid-named members; the `mermaid` boolean prop and the `.mermaid` output-class
  selectors in a few consumers, which a second runtime-drawn plugin would need generalized; a
  deck's author-written `data-lattice-*` attributes surviving the sanitizer (pre-existing: a forged
  `hydrating` stalled captures before this change too).

- **Phase D, the plugin owns its browser half: done, on its branch (2026-10-04).** The followup's
  four items the handoff asked for, each now counted by the ratchet at 0.
  - **The pass moved.** Mermaid's diagram pass — the palette port, fence tagging and release,
    adoption, the render queue, the error surface and the boot wait — moved verbatim out of
    `lib/runtime/index.js` into `lib/plugins/mermaid/mermaid.hydrate.js` as `createPass(ctx)`
    (`render.exec.hydrate: "pass"`, which replaced `"runtime"`). The runtime finds it through
    `passes.generated.js` and drives `boot`, `run` and `onMutations`; it names no plugin in code
    (`runtimePluginNames`: 139 on `main`, 0). It isolates passes, so a second one cannot disturb
    the first: a pass runs only after its own boot, its `runAll` answers for itself, `force`
    reaches only it, and a throw in its hooks is caught. The figure geometry §11 settled holds:
    the host's markup on the `<pre>`, the drawing in the plugin's sibling.
  - **Its stylesheet and grammar are contributions.** `mermaid.css` → `mermaid.styles.css`
    (`styles`, 50 tokens listed), now in the plugin slot after math and function-plot, whose
    selectors match none of Mermaid's SVG; `dist/lattice.css` holds the same lines in a new order.
    `mermaid.hljs.js` → `mermaid.highlight.js`, the new `highlight` contribution
    (`installHighlight` in `host.js`), which also took the grammar out of the runtime bundle,
    where it rode in dead through `plugins.js` (`lattice-runtime-min.js` −2,465 B raw, −899 B gz).
    `pluginAssetsOutside`: 2 → 0.
  - **The bake context is generic.** `BAKE_SERVICES` is a closed list `bakeDeck` enforces;
    `diagramTheme` became the generic `paletteReader`, and Mermaid's theme assembly moved into its
    bake (`themeFor`, still the PDF path's one assembly site). The image-set cross-scheme look
    reads `state.rebake` — figure selector, index attribute, baked band, `render`, the warnings'
    words — for every bake that publishes one (`bakeContextByName`: 1 → 0).
  **Evidence.** Engine: every tracked Markdown file × 4 configurations (default, a theme override,
  flat styles, Mermaid switched off) — 9,324 renders — HTML identical to `main` but for the 12
  docs this change edits; CSS output identical everywhere. CLI: the diagram gallery's PDFs
  byte-identical to `main`, light and dark; an image-set export of the chart-and-diagram fixture
  in three cross-scheme looks (light→dark, dark→print, dark→light) identical file for file but
  the manifest's timestamp; the `.html` export the same lines reordered (the CSS block).
  Studio: a PDF export of the diagram gallery from a built docs site of this branch and of `main`
  (`tools/bench-pdf-export.mjs --verify`), 31 pages light and 31 dark, identical page for page.
  Route startup JS: Studio −8 B gz, Playground −6 B. `export-formats` integration cells for the
  image-set look: 9 of 9.
  **Adversarial trio (HARD RULE #25).** No blocker stood; the checker diffed every moved range
  against `main` line for line and found only the intended edits. Folded: a false spec line (a
  `palette` service that does not exist); the multi-pass orchestration (inversion: one `walked`
  result for all passes, a pass `run` before its `boot`, `force` leaking across passes) — fixed
  rather than documented; per-pass try/catch (red team); `bakeContextByName` anchored on a
  contexts receiver (inversion: it matched any `.get('math')`); the re-bake warnings' Mermaid
  words moved into the hook; stale comments. Recorded rather than fixed: the Mermaid kernels
  still under `lib/integrations/mermaid/`, the `runtimeDrawn` field name, the renamed double-load
  guard, and — as a phase-E acceptance criterion — that the zip resolver must refuse `highlight`
  and `"pass"` by rule.
  **Left** (`followups.d/2417-p5-plugin-phase-d-browser-half.md`): consumers that still find a
  drawn figure by Mermaid's output class or a `mermaid` prop, the CLI not passing `disabled` to
  `bakeDeck`, the two library copies, and the items above.

- **E0, explicit loading: done (#2509).** §9 decision 9 records the owner's semantics and what was
  built: `admitPlugins` in `host-grammar.mjs` (the default set, the deck's `plugins:` import list, the
  plugins a slide class or pane requires, closed over `requires`, then the host's `disabled`);
  `deck-plugins.mjs` reads and writes the list; the engine admits per render and keys both parser
  memos on the result; `bakeDeck` admits from the same source; `render()` reports
  `plugin/unknown-plugin` and `plugin/used-not-loaded`; `lint:deck` warns `unknown-plugin` (with a
  one-click fix inside any spelling of the list); the Studio's deck settings gained a Plugins tab.
  **Evidence.** Engine byte identity: all 424 tracked decks under `examples/`, `exemplars/`,
  `design/`, `themes/`, `lib/components/`, `lib/plugins/` and the baseline decks hash the same
  (`html`, `css`, size, diagnostics) on `main` and the branch; the same sweep with
  `defaults: []` changes 5, so it can fail. The Studio tab driven at 1440, 820 and 390 px
  (`docs/e2e/plugins-tab.spec.ts`), and a Studio PDF export of a deck listing
  `plugins: [math, mermaid]` in light and dark, both drawing the diagram and the math.
  **Adversarial trio (HARD RULE #25).** Folded: a quadratic blank-line strip in the list reader and
  an inherited cubic class-directive regex (red team — the reader is now linear, with timing arms);
  the writer orphaning lines of a multi-line flow list, a commented sequence or a block scalar (red
  team — the register is now a span of lines); BOM and fence disagreements with the engine; a pane
  marker missing the component route; a lint autofix whose made-up line stopped every later fix
  (checker); quoted class tokens; the R5 row; a Studio switch that read as the plugin's on/off state
  next to "On" (inversion — now a labeled checkbox); the probe kept as a warning
  (`used-not-loaded`) so a narrowed default set is never silent (inversion). Recorded, not fixed:
  the browser half still acts for every shipped plugin (runtime passes, highlight grammars,
  boundary parser, drawn-probe consumers) and the CLI configures the bake's knobs separately —
  `followups.d/2509-p3-admission-on-the-browser-half.md`, a precondition for any host narrowing
  the default set.

- **Phase D's last consumers: done (#2509 P2).** The drawn figure carries the host's marker,
  `data-lattice-figure="<plugin>"`, written by the Mermaid pass (`mermaid.hydrate.js`) and its bake
  (`mermaid.bake.js`, after `class` so the index stamp and the re-bake hook still key on it). Every
  consumer outside the plugin selects it: the Studio export's SVG bake and standalone-SVG export
  (`deck-export.js`), Anima's diagram host (`anima-host-sel.ts` `isDrawnFigureSvg`,
  `anima-scenes.ts`), the Guide (`present-guide.ts`), the CLI player capture
  (`lattice-emulator.js`), `overflow-probe.js`, the diagram component's CSS and manifest selectors,
  `base.fluid-view.css`, `highlight-js.css` (which also stopped naming `[data-lattice-hydrate="mermaid"]`),
  and the tools (`check-chart-fit`, `check-render-nature`, `check-diagram-labels`, `diagram-oracle`,
  `bench-preview-diagrams`, `diagram-flash-bench`). `render.figureClasses` declares a plugin's own
  output classes, and the new `drawnFigureClasses` arm counts them as selectors outside the plugin:
  36 on `main`, 0 here. The `mermaid` prop is `drawn` (`DeckPreview`, `renderInto`, the pool, the
  landing and specimen surfaces). The CLI builds ONE `PLUGINS_DISABLED` list (`--disable-plugin`)
  for the engine and `bakeDeck`. Left, with reasons: `followups.d/2509-p5-plugin-phase-d-residue.md` (since split; §11 "Phase D's residue, decided")
  (the kernels needed a package-kind role decision — settled by #2509 P5 below; the library copies are three builds, not two).

- **Admission on the browser half: done (#2509 P3).** The engine marks the `<pre>` of a code fence
  (`as: "code"`) whose plugin the deck did not load, `data-lattice-off="<plugin>"`, by PREFIX of the
  fence name (the pass matches `[class*="language-<fence>"]`); only then, so a default-set render is
  byte-identical (511 of 512 tracked decks on `main` and the branch; the 512th is the README this
  change edits). The Mermaid pass, `drawn-probe.mjs` (the count subtracts the whole marked
  serialization, so a quoted attribute cannot zero it), `article-projection.ts`'s bake probe and the
  `[data-lattice-diagrams]` withholding rule skip it. The CLI gains `--default-plugins` and admits
  once per run: one `PLUGIN_HOST` for the engine and `bakeDeck`, and `setBoundaryPluginsOff` for the
  boundary parser (whose memo in `slide-boundaries.mjs` resets with it). The playground bundle gains
  `setPluginDefaults`, `pluginAdmission` and `pluginDefaultsKey`; the engine, `render(…, {
  pluginDefaults })`; both refuse a name no plugin has. **Evidence.** With `defaults: []` the same
  deck shows the Mermaid source, and with the default set the diagram, on the CLI PDF, `--fluid` and
  `--player` (driven in Chromium: no figure, no tag, no library) and the Studio's preview and PDF
  export (`docs/e2e/plugin-admission.spec.ts`). **Adversarial trio (HARD RULE #25).** Folded: a slide
  rendered alone admitted on itself, so a plain fence beside a `diagram` slide showed source in the
  Studio and was drawn in the export (inversion, checker — the slice now takes the deck's admission,
  and the render caches key on it); prefix-named fences (` ```mermaid-source `) escaped the marker
  and were drawn (red team, observed in Chromium); a quoted marker zeroed the probe count; the
  boundary memo outlived the switch; unknown default names narrowed to nothing; an empty
  `--default-plugins=`; the overclaim "every surface". Recorded, not fixed: the Export-to-Marp bundle
  and the Studio's own lint and slide mapping do not follow a narrowed set, and an author's raw
  `<pre><code class="language-mermaid">` is still drawn —
  `followups.d/2509-p3-admission-marp-and-studio-source-readers.md`.

- **A plugin's own modules: `shared/` (#2509 P5).** The decision the phase D residue asked for —
  may a plugin carry its kernels? — made by the maker under the owner's pre-authorization, with the
  tier 2 trio. **Yes, one folder, in-tree only:** the `plugin` kind gains `codeDirs: ['shared']`
  (`lib/packages/kinds.js`), and `discoverPackages` refuses any other subfolder in a package of a
  no-asset kind (plugin, finish, motion; 0 found today) and any non-module in a declared one — before,
  `folderFiles` read only top-level files, so a subfolder rode beside a package unseen. Mermaid's
  five kernels moved (with the label-length guard that landed on main meanwhile) from `lib/integrations/mermaid/` to `lib/plugins/mermaid/shared/`; the engine,
  the diagram gallery's CLI PDFs (light and dark) and every committed deck render byte-identical.
  **Rejected:** one role per kernel (a closed list filled with one-off names); a manifest `modules`
  list (surface every author keeps in sync, buying nothing a folder does not); `lib/` (reads as
  `lib/plugins/x/lib/`); and **`kernels/`**, the first name, because phase F gives "kernel" a
  package meaning (`extensionPoints.kernel`, §5) and one word must not name both (inversion lens).
  **Zips:** the importers read top-level files only (`cli.js` `readSource`, `home.js`), so a zip's
  `shared/` is dropped, never installed — phase E should report the drop rather than stay silent,
  and a fence renderer admitted through the code-package door bundles what it imports, as
  `code-bundle.js` does. **npm:** left to phase G, not closed here (inversion lens). Folded from the
  trio: the stale `lib/integrations/mermaid/*` claims, the render worker's #22 sanction text (the page
  is mermaid-cli's `dist/index.html`, not a blank document), the overclaimed "refused whole".
  Recorded, not built: a gate refusing a require into `lib/plugins/<x>/shared/` from outside the
  plugin (the emulator's player capture reaches in today).

- **Phase F, the slot (`extensionPoints.kernel`).** The chart family is a plugin,
  `lib/plugins/chart-family/`, whose one contribution is an EXTENSION POINT: `contributes.extensionPoints.kernel
  = { bucket: "chart", role: "transform", entry: "transformSection" }`. A chart fills it with the
  `kernel` block its manifest already carried, so no chart manifest changed. The build writes the
  slot into `lib/plugins/extension-points.generated.json`, keyed by the block a filler declares, and
  the three hand-kept readers now read it: the component loader's `KERNEL_BUCKETS`
  (`lib/components/index.js`), `check-ownership.js`'s `KERNEL_BUCKETS_GATED` and its module/export
  conventions, and `tools/build-chart-registry.js`, which freezes the fills (and now the plugin's
  name) into the dispatch table. **Filling a slot is requiring the plugin**: the build merges every
  filler into `COMPONENT_PLUGINS`, so a chart class loads the family on a narrowed host, and a chart
  slide reports `plugin/component-needs-plugin` when the family is not running. Switched off, the
  family passes each chart section through as authored and marks it — and a pane of it —
  `data-lattice-off="chart-family"`; the runtime's DOM pass skips a marked section.
  **Design choices** (maker, under the owner's pre-authorization; tier 2 trio):
  the slot NAME is the plugin's own and the BLOCK it reads is a separate optional field (`block`,
  default the slot name), because a block is one global word in every component manifest and the
  icons design already calls its renderer "the kernel" (inversion lens: slot == block would have
  locked the word and baked a global namespace into the artifact). In api 1 a slot is filled only by
  in-tree COMPONENTS, with code; a slot that PLUGINS fill — the icon pack of `2026-09-29-inline-icons.md`
  §6, which is data — is reserved as a later, additive field rather than forced into this shape. One
  slot per plugin, one per bucket, and a slot's block must be an OBJECT block of the component schema
  (a scalar such as `name` would make every component in the bucket a filler — red team).
  **Rejected:** a `plugins.requires: ["chart-family"]` line in 24 chart manifests (a roster by
  another name, and the slot already says who fills it); keeping the family off the plugin list (a
  capability the host cannot switch off is the special case "plugins are plugins" refused).
  **Found and fixed by the trio:** `deckClassTokens` paired a stray `<!--` (quoted in a code span or
  a fence) with the next directive's `-->`, so on a narrowed host a later chart class was never read
  and the chart rendered as a list with no diagnostic — pre-existing, but this phase made 24 classes
  depend on it; it now re-anchors on the opener nearest the `-->`, and the engine reports a class
  whose plugin admission left off (`componentPluginDiagnostics` reads the admission's `off`, which
  is the host's `disabled` on the default set). A switched-off PANE chart was silent and unmarked:
  pane classes now count, and the marker rides onto `<lat-pane>`. The code-package shim gained
  `PLUGIN`; the off stamp no longer stacks on a second pass; `entry` admits no `$`; a missing slot
  throws by name instead of reading as an empty bucket list.
  **Evidence.** Engine byte identity: every tracked Markdown file under `examples/`, `lib/`,
  `test/integration/`, `docs/src/content/` and `spec/` (500), on the default engine and on
  `plugins: { defaults: [] }`, against a clean `origin/main` worktree at `eb88b64` — 1,000 renders,
  every deck identical; the only differences are the four Markdown docs this phase adds or edits.
  `checkPluginMigration` stays at 0 on every arm. Off-state: the CLI with `--disable-plugin
  chart-family` prints a bar slide as its list (rasterized and looked at).
  **Recorded, not built:** the family's dispatch and the chart-frame CSS still live in
  `lib/components/chart/_chart-family/` and the CSS bundle, so the plugin folder holds no code yet;
  `stats.charts` in `docs/src/lib/single-slide-render.ts` counts a switched-off section (nothing
  reads it); a code package does not receive `pluginsOff`, so it cannot honor the switch (no export
  path uses code packages yet).

- **Admission reaches Export-to-Marp and the Studio's own readers (`2509-p3`).** Two readers that do
  not run the engine now follow a narrowed set, for every plugin whose output they draw. **The Marp bundle:** Marp renders it, so no marker is
  ever written; the producer (`tools/export-marp.js`, which gains `--default-plugins=` and
  `--disable-plugin=`; the Studio's Share → Marp) admits the deck and records the plugins left off
  in the bundle's export-settings block, `pluginsOff`, and the bundled runtime writes the engine's
  marker from it before any pass (`lib/plugins/mark-off.mjs`: a drawn fence's `<pre>`, and an
  extension-point filler's `<section>` from the transformer that offers the slot — `plugin` +
  `layouts` on the chart-family adapter). Absent when nothing is off, so a default-set bundle is
  byte-identical. **The Studio's readers:** every bundle carries its own boundary-parser copy, so
  `docs/src/lib/plugin-admission.ts` points each at the deck's `off` set — the main bundle's
  and authoring-core's (which now exports `setBoundaryPluginsOff`). Admission
  is decided where the WHOLE deck is held (`StudioShell`'s slide memo, the editor's lint pass):
  every rail reader parses the body with the front matter stripped, so a hook inside `splitSlides`
  could not see a deck's `plugins:` list — the first cut put it there and the real Studio caught it
  (the rail stayed at 3 slides for a deck that listed math). On the default set
  `pluginAdmission` answers null and none of it runs.
  **Evidence.** Real marp-cli + Chromium (`test/integration/export/marp-admission.test.js`): a
  default bundle draws the flowchart and builds the bar chart; under `--default-plugins=none
  --disable-plugin=chart-family` the fence stays source and the chart its list, marked. The real
  Studio (`docs/e2e/plugin-admission.spec.ts`, desktop): under `setPluginDefaults([])` the rail
  shows 3 slides for a `$$`-with-`---` deck, as the engine renders, and 2 once the deck lists math;
  the Share → Marp ZIP's deck carries `pluginsOff`; and when the host changes its defaults with no
  edit, the rail follows (`setPluginDefaults` fires `lattice:plugin-defaults`). **Folded from the
  checker:** both parser copies are switched directly (authoring-core is in the Studio's eager
  chunk, so the lint copy is imported statically, not adopted when the editor's lint loads, which
  left earlier readers on the default grammar); the rail re-reads on the defaults event;
  `export-marp` sets the boundary parser before its split bake and refuses an empty
  `--default-plugins=`. **Marp's own math** (found by the checker: marp-core typesets `$…$` itself,
  which no runtime marker reaches): with math off, the bundle's `marp.config.cjs` passes Marp
  `options: { math: false }` (`marpConfigCjs`; a default-set bundle's config is byte-identical), and
  the real-marp-cli test shows the TeX as written. **Not covered, and recorded:** an author's raw-HTML Mermaid block and
  forged `data-lattice-*` markers; the Playground page's own lint (`2509-p3` followup, narrowed).

- **Phase D's residue, decided (`2509-p5`).** The list #2509 left, item by item; the followup is
  deleted and its two open items moved to where they will be done.
  - **The grammar field `runtimeDrawn` → `pass`**, named for `render.exec.hydrate: "pass"` (two
    readers, both tests). **Kept:** `RUNTIME_DRAWN*` in `drawn.generated.mjs` and the browser host's
    `runtimeDrawn` option, because they name what is still true — the runtime draws those fences —
    and renaming them would churn thirteen files (fifteen with the host option) for a word.
  - **The pass interface:** `describe()` keys no longer merge flat — the runtime's breadcrumb logs
    each pass's fields under its name, so a second pass cannot overwrite the first's. **Kept:** each
    pass's own boot wait, because each waits for its own library; one shared wait would make every
    pass wait for the slowest.
  - **The double-load guard's rename** (`__llMermaidBootstrapLoaded` → `__llLatticeRuntimeLoaded`):
    accepted. Only a page carrying a pre-2026-10-04 runtime AND a current one boots both, and no such
    page is produced or known.
  - **`tools/diagram-oracle.mjs` captures before and after #2509 differ** by the figure marker: a
    one-time boundary, accepted — re-capture both sides with the current tool.
  - **The diagram component's slot named `mermaid`:** kept until the manifest schema is next revised
    as a whole (phase G freezes LPM 1.0); renaming a slot changes every reader of slots for a word,
    and its selector already reads the host's marker.
  - **Moved, open:** retiring the committed `mermaid-v11-min.js` touches `lefthook.yml`, a hook
    contract, so it is the owner's pick (`followups.d/2509-p5-mermaid-library-copies.md`); an
    importer REPORTING a zip's dropped `shared/` belongs to phase E, while the gate refuses every
    plugin zip whole (`2417` followup); author-forged `data-lattice-*` markers join the raw-HTML
    `language-<fence>` refusal (`2509-p3` followup).
  **Evidence:** engine byte identity, 502 tracked Markdown files × the default and `defaults: []`
  engines, 1,004 renders before and after, 0 differences (the grammar field is read by no render);
  the diagram gallery's CLI PDFs (`diagram.gallery.md` and the member gallery) byte-identical
  before and after. The one byte change that ships is the runtime bundle's bootstrap
  `console.log` payload (passes now nested under `passes`), which draws nothing.

- **Phase F, the family's code.** The plugin folder now holds the family's code: the section dispatch
  and the chart frame are `lib/plugins/chart-family/chart-family.dispatch.js` (moved from
  `lib/components/chart/_chart-family/chart-family.js`), the generated dispatch table is the plugin's
  `shared/chart-registry.generated.js` (`tools/build-chart-registry.js` writes it into whichever
  plugin offers the slot), and the chart-frame stylesheet is `chart-family.styles.css`, the plugin's
  `styles` contribution, whose 104 token reads the manifest's `tokens` lists (the resolver checks
  the two agree). `dispatch.js` is a new plugin ROLE (`lib/packages/kinds.js`, spec/LPM.md §2): a
  plugin ships one exactly when it offers an extension point, and the resolver fails either half
  of that alone. The section transformer `lib/transformers/chart-family.js` stays where it is
  (§4.3: section transforms stay first-party and hand-ordered) and requires the plugin's module.
  **Kept in `_chart-family/`, deliberately:** the kernels' shared helpers (`cartesian.js`,
  `svg-label.js`, `svg-legend.js`, `transform-utils.js`, …) are the members' library, not the
  family's dispatch, and `chart-finish.generated.css` is generated from the members' manifests.
  **The cascade.** `build-css.js` used to place the frame sheet by hand, before the treatments; it
  now sits in the plugin slot (§4.9), after the forms and the accent finishes — every rule it held
  moved later. Measured, not argued: every tracked gallery, example and baseline deck (363) rendered
  through the real emulator twice, once with `main`'s bundle and once with this branch's, and every
  element's computed style (and pseudo-elements') plus its box compared in Chromium — 221,733
  elements, 0 differences beyond the render's own nondeterminism (function-plot's random clip ids,
  Mermaid's git-graph commit ids). The harness was mutation-proved first: one added declaration on
  a frame rule changes 49 elements of the line gallery. The chart gallery's CLI PDFs, light and
  dark, are pixel-identical to `main`'s (50 of 50 pages). Every test and tool that walked
  `lib/components/chart/**` for CSS or JS — and so covered the frame sheet by accident of folder —
  now names the plugin too (the tspan census, the responsiveness gate, the webkit inherit census).
  **Found by the tier 2 trio, and fixed.** (1) The RED TEAM drove the Guide's runtime states, which
  no static sweep can reach: `base.focus.css`'s focus and highlight rules (0,2,1)/(0,2,2) used to beat
  the frame's subtitle, caption and eyebrow `<code>` rules by ORDER, and lost once the frame came
  after them — a focused gantt subtitle kept its secondary ink while its peers dimmed. Bumping the
  Guide's rules a whole attribute OVER-corrected (391 elements took the Guide ink where `main`'s
  higher-specificity dark-slide rules had kept their own); the fix is two frame-scoped rules exactly
  one specificity step above the ones they mirror. Measured: all 24 charts concatenated (20,670
  elements) × five Guide states (none, focus, highlight, ring, dim), `main`'s bundle against this
  one — 0 differences; without the fix, 74 (focus) and 71 (highlight). (2) Three gates covered the
  frame only by accident of folder and went silent: the section-box gate (`SECTION_BOX_ROOTS`), the
  edge-ownership test and the `:is([data-family` guard now walk `lib/plugins` too (the section-box
  arm mutation-proved), and `tools/affected-tests.js` routes a plugin stylesheet to
  `test:components` and `test:plugins`. (3) The old module paths were importable through the package's `./lib/*` export; the owner (2026-10-06): pre-GA, no compatibility shims and no **Breaking:** marker — the changelog records the move. The INVERSION lens: the
  `dispatch.js` role is in-tree only and no host contract in api 1 (LPM §2 says so); stale
  `chart-family.js §X` pointers the rename had re-stamped now name the kernels that hold those
  symbols; and `tokens` listing the sheet's own custom properties is recorded for the 1.0 freeze
  (`followups.d/2417-p5-lpm-tokens-own-declarations.md`). The CHECKER: wrong historical rewrites
  restored, LPM's "draft until F" line moved to G.
  **Evidence.** Engine byte identity: 505 tracked Markdown files × the default and `defaults: []`
  engines, against a clean `origin/main` worktree at `281e9e0` — 1,010 renders, every deck
  identical; the only differences are Markdown docs this phase edits. `checkPluginMigration` stays
  at 0 on every arm. Mutation-proved: removing `chart-family.dispatch.js` fails the registry build
  by name.


- **Admission reaches an author's raw HTML, and the Playground page's lint (`2509-p3`).** The
  engine reads every raw-HTML token an author wrote, in a core rule straight after the inline
  parse (before any engine rule synthesizes markup — the checker dumped the rule order and
  censused every token creator), and holds it to the host's channel (`lib/plugins/author-markup.js`):
  every host figure marker NAME it spells — `data-lattice-hydrate`, `-config`, `-settle`, `-final`,
  `-off` — becomes `data-author-lattice-…`, always; and when a drawn plugin is not
  admitted, its `language-<fence>` becomes `language-off-<fence>`, so no pass, probe or capture
  reads the author's `<pre><code>` as that fence.
  **`data-lattice-figure` is NOT refused, and CI is why.** The CLI's Mermaid bake draws each figure
  INTO the deck's Markdown and stamps it `data-lattice-figure`; the engine then reads that markup as
  raw HTML like any author's and cannot tell the two apart. Refusing the marker erased it from every
  baked diagram (7 integration arms: `--disable-plugin`, the HTML player's sanitizer and toggle,
  `--read`) — the engine-only byte-identity corpus never ran a bake, so it could not see it.
  `BAKE_WRITTEN` names it, with the reason, and a unit census fails when a `*.bake.js` writes a marker
  that list lacks. A forged figure marker only makes the author's own markup count as drawn in their
  own export; the forgery that matters, a pending figure hydrated from an author-packed config, needs
  `hydrate`, `config` and `settle`, which stay refused.
  **Two first cuts, both caught.** (1) Refusing the whole `data-lattice-` prefix, as the
  code-package door does: the byte-identity run caught it, because `examples/motion-asset.md`
  authors `data-lattice-motion` — vocabulary, not a host marker. The list is exactly the host's
  channel, and a unit arm fails if `host.js` or `host-browser.mjs` writes a marker it lacks.
  (2) A start-tag walker that removed the attributes and stamped `data-lattice-off` on a `<pre>`:
  the tier 1 checker broke it seven ways (a quote or `<!--` inside a value, `--!>`, a `<script>`
  end tag with an attribute — each put the regex and the browser's tokenizer out of step) and
  measured it quadratic (a 160 KB deck of unclosed `<script ` rendered in 48 s); and the `<pre>`
  marking missed a second `<code>`, a `<pre>` mid-paragraph and a one-line `<marp-pre>`. Renaming
  BY NAME needs no tokenizer: an attribute selector matches a name exactly, so a renamed one cannot
  be read as the marker wherever it sits. The cost, accepted: raw HTML that spells a marker name as
  TEXT shows the renamed word (no tracked deck does). **The Playground page**
  (`docs/src/playground/editor.js`, which loads the lint bundle lazily and so was not reached by the
  Studio's `plugin-admission.ts`) points that bundle's parser at the deck's `off` set before each
  lint, quick fix and Fix-all, and re-lints on `lattice:plugin-defaults` (through the linter's
  `needsRefresh`: `forceLinting` alone flushes only a lint an edit scheduled, which the real page
  showed); `deckPluginsOffFor`
  (`editor-diagnostics.js`) is the one copy both callers use, and the lint bundle exports
  `PLUGIN_NAMES` so the page needs no eager import of the registry.
  **Evidence.** Engine byte identity over the same 1,010 renders: only edited docs differ; the
  checker separately hashed 363 decks × 4 plugin configurations against an engine with the rule
  stubbed out, 0 differences. `test/unit/plugins/author-markup.test.js` judges the engine's output
  with jsdom: every one of the checker's bypass shapes reaches no element with a host marker, no
  raw-HTML Mermaid shape is selectable by the pass under `defaults: []`, `data-lattice-motion`
  survives, and the hostile inputs run in milliseconds; with the rule uninstalled, 22 of 31 arms
  fail. `hydrate-host.test.js`'s "author element marked pending" arm now injects the element into
  the page, because the engine no longer lets one through — the browser-side defense it tests still
  matters on a page the engine did not render. The real Playground page, built site, desktop
  Chromium (`docs/e2e/plugin-admission.spec.ts`, 5 of 5): with math off the pill inside `$$` is
  underlined on the slide the engine renders it on, and the underline goes and comes back as the
  host switches its defaults with no edit. Not covered and recorded: the page's PREVIEW does not
  re-render on that event (`followups.d/2509-p5-playground-preview-follows-defaults.md`).
  **Not covered, and recorded:** an Export-to-Marp bundle is rendered by Marp with `html: true`, so
  forged markers reach its runtime, and its `mark-off.mjs` matches `language-<fence>` as a whole
  class word, so a raw block classed `language-mermaid-source` stays drawable there
  (`followups.d/2509-p4-marp-bundle-author-markers.md`).

- **The Mermaid plugin owns its library (`2509-p5`, owner's decision 2026-10-06).** "We host
  third-party libraries ourselves": the plugin owns a copy, every surface ships that copy, and
  `node_modules` is only its source. The three builds §11 "Phase D's residue" left (the repo-root
  `mermaid-v11-min.js`, the npm payload, the bake's unminified `mermaid.js`) are one:
  `lib/plugins/mermaid/vendor/mermaid.min.js`, recorded in the manifest's new `payload.vendored`
  (file, version, SHA-256; spec/LPM.md §3.4) and in a new in-tree plugin folder, `vendor/`
  (`lib/packages/kinds.js`). Node readers resolve a plugin's library through one helper,
  `lib/plugins/payload-path.js` — the CLI export page's hydrators, the docs site's staging, the bake's
  render worker — and the Marp kit and Export-to-Marp bundle copy it (still named
  `mermaid-v11-min.js` inside them, the name their decks load). The generated browser registries did
  not change: the served file name was already `mermaid.min.js`. `npm run vendor:plugins` refreshes a
  copy and its record together; the resolver fails a copy whose SHA-256 drifts; `package.json` pins
  `mermaid` exactly, and a unit test fails when the installed build is not the vendored one.
  Dependabot ignores `mermaid` (owner, 2026-10-06): its bump would fail that test and hold the
  whole weekly group, so the library is upgraded on purpose (bump the pin, run
  `npm run vendor:plugins`). The source gates skip a plugin's
  `vendor/` (`isVendoredLibraryDir` in `tools/check-ownership.js`), as they skipped the root copy: it
  is not our source, and its integrity is the hash. The root copy is gone, with its entries in
  `lefthook.yml`, `ci.yml` and `publish-kits.yml` (each already covered by `lib/**`).
  **Evidence.** The bake now draws with the minified build instead of the unminified one: both
  diagram galleries' CLI PDFs, light and dark, are byte-identical to `main`'s (4 of 4; 25 diagrams
  baked). The Marp kit and the Export-to-Marp admission tests through real marp-cli: 16 of 16. The
  resolver's hash check mutation-proved (one appended byte fails the build by name); the ownership
  test fails when a reader goes back to `node_modules`. Recorded, not built: the other plugin
  libraries (function-plot, KaTeX, the bake's ZenUML and mermaid-cli page) —
  `followups.d/2509-p5-plugin-libraries-owned-copies.md`. Also fixed on the way: the diagram
  gallery's two `<script>` paths had pointed at files that no longer existed since the galleries moved
  into bucket folders, so its VS Code preview drew no diagrams.

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
