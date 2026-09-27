---
status: proposed
summary: The plugin system, designed whole. A plugin is a package (`type: "plugin"`) — one folder, one manifest that declares WHAT it contributes and whom it depends on, and role-named modules that say HOW — so the same folder is the in-tree source, the exported zip and the Studio record. Plugins stand alone or depend on others through declared `requires`, `services` and `extension points`, resolved at build time into one frozen registry that every render path reads. Math and function-plot are the pilots; Mermaid and the chart family are mapped onto the same contract so it is designed for them, not retro-fitted. Reconciles LPM (2026-06-14), the plugin architecture (2026-09-13) and portable packages (2026-09-23), and amends the last one's "no dependency resolver".
---

# The plugin system — one package shape, declared dependencies, one frozen registry

**Date:** 2026-09-27 · **Decision owner:** Sharmarke · **Status:** proposed, nothing built.

**Continues** three notes and replaces none of their shipped parts:
[`2026-06-14-plugin-extension-system.md`](2026-06-14-plugin-extension-system.md) (LPM — the render
contract), [`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) (tiers, and trust
by delivery channel) and [`2026-09-23-portable-packages.md`](2026-09-23-portable-packages.md) (the
package spine). **Amends** one line of the last: §7's "no per-package versions and no dependency
resolver" — the owner now wants plugins that depend on plugins (§4.4 says what that costs).
**Bounded by**, and does not reopen: the transformer threat model
([`2026-06-29-component-transformer-threat-model.md`](2026-06-29-component-transformer-threat-model.md))
and the code-package contract ([`2026-09-24-code-package-contract.md`](2026-09-24-code-package-contract.md)).

## 1. The answer

A **plugin** is a folder that teaches Lattice something new: a syntax (`$…$`), a fence
(` ```functionplot `), a slide class, a runtime renderer, or a table of providers. It carries

- **one manifest** that declares *what* it contributes, *whom* it depends on, *which* payload it
  loads, *which* tokens it paints with, and *what* it degrades to — all readable without running
  any of its code; and
- **role-named modules** that supply *how*, one function per declared contribution.

The build reads every plugin's manifest, resolves the dependency graph, checks that the manifest
and the modules agree one-to-one, and writes **one frozen registry** (static `require`s, the way
`chart-registry.generated.js` already works). The engine, the runtime, the CLI export and the
Studio all read that registry. None of them names a plugin in its own code.

The package is the same folder everywhere — in the repo under `lib/plugins/<name>/`, zipped for
import and export, and as the Studio's Library record — because it *is* a portable package
(§4.1), the fifth kind in the spine that already carries themes, components, finishes and motion.

**Math and function-plot are the pilots**, and they test both halves of the owner's requirement:
math stands alone, and function-plot depends on math (§6).

## 2. What the owner asked for, as testable requirements

| # | Requirement | How this design meets it | Where |
|---|---|---|---|
| R1 | A manifest and a self-contained package | a plugin is a `type: "plugin"` package; the folder, the zip and the Studio record hold the same files | §4.1–4.2 |
| R2 | Import and export | the spine's existing `lattice packages add / export / check` and the Studio Library, one kind row added | §4.10 |
| R3 | Stand alone or depend on other plugins | `requires` / `optional`, plus `services` (call another plugin's function) and `extension points` (fill another plugin's slot) | §4.4 |
| R4 | Easy to create | `lattice packages new plugin <name>` scaffolds a working plugin; an author writes a manifest, one module and fixtures | §4.12 |
| R5 | Easy to use | an author types the fence or syntax; the plugin loads because the deck uses it. No config file, no front matter | §4.7 |
| R6 | Works today and tomorrow | a versioned host API (`api: 1`), conformance fixtures, a deprecation window, and a registry frozen at build time | §4.11 |
| R7 | No jank | every hand-kept roster the plugin touches is derived; every adapter call is fail-soft by the host, not by the plugin's discipline; payload loads only when used | §3, §4.6–4.7 |
| R8 | Mermaid, the chart family and the rest become plugins | each is mapped onto the contract in §5, and the contract grew the two things they need (extension points; `exec: subprocess`) | §5 |

## 3. The audit — what exists, and what is broken today

### 3.1 What is built and this design keeps

| Piece | State (measured at `cb32dbf`) | Role in the plugin system |
|---|---|---|
| Package spine `lib/packages/` | shipped: `kinds.js` (4 kinds), `read.js`, `write.js`, `gate.js`, `import-gate.js`, `index.js`, CLI `list/add/check/export/remove`, `~/.lattice` store, `packages.generated.json` (33 themes, 71 components, 9 finishes) | **the delivery vehicle** — `plugin` becomes the fifth kind row |
| Manifest-driven code dispatch | charts only: `KERNEL_BUCKETS = ['chart']` (`lib/components/index.js:934`), 23 kernels frozen into `chart-registry.generated.js` by `tools/build-chart-registry.js` | **the registry pattern** the plugin registry generalizes |
| Projection catalog | shipped: one `projection` block per component → `lib/core/projection-catalog.generated.mjs`; `checkProjectionCoverage` fails a chart that forgets it | proof that "declare once, derive the rosters" works here |
| Code sandbox + bundler | built, test-only: `lib/core/code-sandbox.js` (locked Chromium page, 0 requests for 34 hostile vectors), `lib/packages/code-bundle.js` | the door a *third-party* plugin's code goes through, later (§4.9) |
| Transform DSL + capability registry | built, adversarially reviewed, **wired to nothing**; one capability (`panel-eyebrow`) | the declarative path for zip-imported section rewrites (§4.3) |
| On-demand loaders | `ensure-katex.ts`, `ensure-hljs-language.ts`, `load-engine.ts` — same idiom three times | collapse into one host loader (§4.7) |
| Video provider registry | shipped: `lib/core/video-providers.mjs`, a pure descriptor table | the shape of a `providers` contribution (§4.3) |

### 3.2 What is missing: a spine for *code*

Six registries grew separately, and none of them knows about the others: the component walk,
the chart kernels, `TRANSFORMERS` (20 hand-ordered `require`s, `lib/transformers/registry.js:69`),
`LATTICE_PLUGINS` (19 markdown-it functions, a closed array at `lib/engine/index.js:123`),
`lib/integrations/` (four folders, each bespoke) and the fence **wrapper chain**
(`plugins.js:1888`, `:1916` — each fence plugin wraps `md.renderer.rules.fence`, so registration
order is load-bearing and nothing checks it). There is no `lattice.config.*`, no enablement, no
host API, and no way for one extension to use another.

### 3.3 The pilots, audited — seven defects a plugin contract would have prevented

Every one of these is a place where a fact lives twice, or lives in the wrong owner, and nothing
goes red when the copies drift.

1. **Function-plot has two browser inflaters, and they have drifted.** `lattice-emulator.js:2958-2995`
   and `lib/runtime/index.js:4309-4416` both turn the placeholder into SVG. The runtime copy sets
   `data-fp-state` / `data-fp-final` / `data-fp-inflated="error"` and releases the config text when
   the library fails to load; the emulator copy does none of that.
2. **Math's delimiter rules exist twice.** `lib/engine/math.js` parses `$…$`; `lib/engine/math-detect.mjs`
   re-implements the same rules as a pre-scan so the browser knows whether to fetch KaTeX. Nothing
   checks they agree (`2026-07-10-landing-perf-katex-defer.md` §4b made the copy on purpose).
3. **KaTeX's stylesheet reaches a page four ways**: vendored into `dist/lattice.css`
   (`build-css.js:526`), a `file://` link in the emulator, inlined by `player-core.mjs:2646`, and a
   docs-site staging copy with its font faces stripped and restored by `theme-fetch.ts:108-156`.
4. **`.math-error` has no emitter.** `math.styles.css:114` styles it and `check-ownership.js:1831`
   sanctions it; no code writes the class. KaTeX writes `.katex-error` with an inline
   `color:#cc0000`, which no Lattice CSS styles — a hex color on a slide, outside the token system.
5. **The math component knows about function-plot.** `math.styles.css:1180-1250` carries
   function-plot's canvas sizing and its stroke overrides. Knowledge runs the wrong way: the host
   names its guest.
6. **Function-plot has no manifest.** Its only declaration is a grammar row hand-written in
   `tools/build-docs-portal.js:1130` (`usedBy: ['math']`). Its contract is spread over about 20
   files; math's over about 40.
7. **Both libraries are hard `dependencies`**, so `npm i @laticent/lattice` installs them whether a
   deck uses them or not. (The *runtime bundle* is already disciplined: both contribute 0 bytes to
   `dist/lattice-runtime.js`.)

Open issues this design absorbs: **#299** (give function-plot a home and honest render paths) and
**#287** (LPM Phase 1 — the `render` block and the uniform `transformSection` adapter).

### 3.4 Doc drift found by the audit

`2026-09-13-plugin-architecture.md` cites `KERNEL_BUCKETS` at `:730` (now `:934`), `LATTICE_PLUGINS`
at `:112` (now `:123`), "18 hand-ordered requires" (now 20), "21 kernels" (now 23), and calls
`lattice-asset/1` shipped (now read-only legacy, replaced by package-folder zips). `lib/engine/index.js:319`
and `lib/core/boundary-parser.mjs:34` say "15 LATTICE_PLUGINS" (19). These are corrected when the
first slice touches each file, not in a separate sweep.

## 4. The model

### 4.1 A plugin is a package

```
lib/plugins/function-plot/
  function-plot.manifest.json      required — owns the name; declares type, contributions, deps
  function-plot.syntax.js          parse time: fences and inline/block rules. Pure; runs in Node AND the browser
  function-plot.hydrate.js         the browser half: turns placeholders into figures. ONE copy for every surface
  function-plot.styles.css         token-only CSS (HARD RULES #3, #4, #20, #26 apply unchanged)
  function-plot.docs.md            what an author reads (the #6 contract, like a component's)
  function-plot.gallery.md         a live example deck — the gallery and the conformance smoke test
  function-plot.fixtures.md        conformance cases: input → expected markup; malformed → declared fallback
```

Every file is `<name>.<role>.<ext>`, the spine's rule (portable-packages §3.1). A plugin carries
**only the roles it needs**: a provider-table plugin is a manifest and a `providers.json`; a
CSS-only plugin is a manifest and a stylesheet. The kind row declares `manifest.json`, `docs.md` and
`fixtures.md` required — docs because #6 makes them the author's contract, fixtures because a plugin
with no conformance case cannot prove it works (§4.11).

**Why a new kind, not a bigger component manifest.** LPM proposed a `render` block on the
component manifest. That fits a chart (one slide class, one transform) and does not fit math: math
contributes *syntax that works on every slide*, a stylesheet, a font payload, a service, and a
slide class. Folding that into a component manifest makes every component carry an unused plugin
block, and makes `math` the component own `$…$`, which is engine-wide. So a plugin is the unit of
**capability**, and it may **contribute components**: the math plugin contributes the `math`
component the way a VS Code extension contributes a view. The component folder does not have to
move for this (§7 phase A keeps it in place and the plugin names it).

### 4.2 The manifest

The function-plot manifest, as the pilot will ship it:

```jsonc
{
  "$schema": "../plugin.schema.json",
  "type": "plugin",
  "format": 1,
  "name": "function-plot",
  "version": "1.0.0",
  "api": 1,                                  // the host API this plugin is written against (§4.11)
  "title": "Function plots",
  "description": "Plot y = f(x), parametric and polar curves from a JSON config fence.",

  "requires": { "math": "^1" },              // resolved at build time; a miss is a build error (§4.4)
  "optional": {},

  "contributes": {
    "fences": {
      "functionplot": {
        "aliases": [{ "name": "latticeplot", "deprecated": true }],
        "body": "json",
        "emits": "placeholder",              // placeholder | figure | code
        "figureClass": "functionplot"
      }
    },
    "hydrate": { "selector": ".functionplot", "exec": "browser" },
    "styles": true,                          // function-plot.styles.css
    "slots": { "math/canvas-figure": { "selector": ".functionplot" } }   // fills math's extension point (§4.4)
  },

  "payload": {
    "function-plot": { "from": "npm:function-plot/dist/function-plot.js", "global": "functionPlot", "when": "used" }
  },

  "tokens": ["--accent", "--cat-4-mark", "--cat-7-mark", "--muted-mark", "--border",
             "--text-muted", "--text-heading", "--font-mono", "--font-body", "--fs-meta"],

  "render": {
    "paths": { "engine": "placeholder", "runtime": "hydrate", "cli": "hydrate",
               "player": "baked", "marp": "code-block" },
    "parity": "progressive",                 // the static path emits a placeholder; a browser enriches it
    "degradesTo": "code-block"
  },

  "diagnostics": {
    "function-plot/bad-json":    "The functionplot fence body is not valid JSON.",
    "function-plot/lib-missing": "function-plot could not load; the config is shown as text."
  }
}
```

**The manifest says what; the modules say how; the build checks they agree.** A fence declared in
`contributes.fences` must have a renderer exported by `syntax.js` under the same name, and an
exported renderer with no declaration is an error too. That one-to-one check is what stops a
manifest from lying — the failure mode of every hand-kept roster in §3.2.

The schema is `lib/plugins/plugin.schema.json`, closed at every level (`additionalProperties: false`),
like the component schema. A field a future plugin needs is a schema change reviewed in a PR, never
a silently tolerated key.

### 4.3 Contribution points — a closed vocabulary

A plugin can contribute exactly these. Each has one contract, one owner in the host, and a trust
tier that says which channel may carry it (§4.9).

| Point | The author writes | The plugin supplies | Host owner | Tier |
|---|---|---|---|---|
| `syntax` | delimiters in prose (`$…$`, `$$…$$`) | a markdown-it inline or block rule, anchored to a **host-named** position, plus `detect(source)` | the engine's parser | T1 code |
| `fences` | ` ```name ` | `render(body, ctx) → html` | one host fence table | T1 code |
| `hydrate` | nothing (follows a fence or syntax) | `hydrate(el, ctx) → Promise` over a declared selector | one host hydrator, shared by runtime and CLI | T1 code, runs in the viewer's page |
| `bake` | nothing | `bake(el, ctx)` in a Node-side export page (for `exec: subprocess`, e.g. Mermaid) | the CLI export | T1 code |
| `components` | `<!-- _class: X -->` | a component folder (manifest, CSS, gallery, optional transform) | the existing component walk | data; transform = T1 code |
| `styles` | nothing | token-only CSS | `build-css.js`, appended in dependency order | data |
| `providers` | a URL, a style name, a unit | a pure descriptor table (the `video-providers.mjs` shape) | the owning plugin's extension point | T0 data |
| `services` | nothing | named functions another plugin may call | the host's service table | T1 code |
| `extensionPoints` / `slots` | nothing | a slot this plugin offers / a slot this plugin fills | the resolver | data |
| `transform` (DSL) | a slide class | declarative rules for the existing DSL interpreter | `lib/core/transform-dsl/` | data |
| `diagnostics` | nothing | stable IDs and messages the host reports on the plugin's behalf | the diagnostic protocol (`spec/diagnostics.md`) | data |

**Not a contribution point, on purpose:**

- **Section transforms in `lib/transformers/` (T2)** stay first-party and hand-ordered. Their
  order is semantic ("after whatever last changed the list shape", 2026-09-13 §Axis 1), and an
  `after: [...]` list would hide that behind a field that looks checked. A plugin reaches section
  rewrites through the DSL (`transform`) or through a component's own transform.
- **Deck-scoped passes (T3)** — progress rail, auto-split, pagination — stay engine-owned.
- **Lint rules.** HARD RULE #7 keeps every lint rule in `lib/authoring/lint-core.js`. A plugin
  contributes *diagnostic IDs* its adapters report at render time; `lint-core` learns a plugin's
  vocabulary (fence names, slide classes) from the generated registry, so `unknown-class` and the
  fence grammar stay right without a plugin writing a rule.

This table **replaces LPM's five `kind`s** (`component`, `block`, `inline`, `directive`, `marker`).
LPM made `kind` the authoring surface, one per plugin. A real plugin has several surfaces — math has
inline syntax, block syntax, a component and a service — so the surface is a property of each
*contribution*, not of the plugin. LPM's `render` fields (`renderPaths`, `parity`, `exec`,
`degradesTo`, `tokens`) survive unchanged inside the manifest's `render` block.

**Anchoring rule for `syntax`.** A markdown-it rule may anchor only to a rule the **host** names
(`escape`, `fence`, `lattice_slide`, …), never to another plugin's rule. Between plugins, order
comes from the dependency graph alone. That is what makes two plugins' parse rules composable
without either knowing the other exists. Fences need no anchor at all: the host owns **one fence
table** keyed by name, so the wrapper chain in §3.2 — where registration order decides who wins —
is deleted, and two plugins claiming one fence name is a build error that names both.

### 4.4 Dependencies: `requires`, `services` and extension points

```jsonc
"requires": { "math": "^1" },          // cannot load without it
"optional": { "mermaid": "^1" }        // uses it when present; must work without it
```

**Resolution happens at build time, once**, in `tools/build-plugin-registry.js`:

1. Read every plugin manifest (in-tree, then any installed or npm-resolved ones, §4.9).
2. Check each `requires` range against the found version (semver, the `^`/`~`/exact subset only —
   no `||`, no pre-release tags; a smaller grammar is one nobody misreads).
3. **Fail the build** on a missing requirement, a version outside its range, or a cycle, naming
   every plugin on the path and the command that installs the missing one. Never skip a plugin
   quietly — that is the silent failure §3 is full of.
4. Order plugins topologically, ties broken by name, and freeze the order into
   `lib/plugins/registry.generated.js`. The order decides three things and nothing else: parse-rule
   registration, CSS append order, and hydrate order.

**One version per plugin per build.** A dependency graph with two copies of `math` would mean two
KaTeX stylesheets and two meanings of `$`. So the resolver picks one version and fails if any
`requires` range excludes it. This is the rule that keeps "depends on" from turning into npm's
nested-copies problem, and it is affordable because the plugin set per build is small.

**Services — calling another plugin.** A plugin exports named functions from its `syntax.js`:

```js
// math.syntax.js
export const services = {
  tex: (source, { display = false } = {}) => renderTex(source, display),   // → HTML string
};
```

and a dependent reaches them through the host, never through a `require` of the other folder:

```js
// function-plot.syntax.js
export function render(body, ctx) {
  const math = ctx.use('math');        // throws at build time if 'math' is not in requires/optional
  …math.tex(title)…
}
```

`ctx.use(name)` returns the service table of a plugin declared in `requires` or `optional` (for an
optional one that is absent, `undefined`), and is a conformance-time error for anything else. So a
plugin's dependencies are exactly its manifest, which the build can read without running it.

**Extension points — filling another plugin's slot.** Some hosts are *families*: the chart family
wraps 23 kernels in one frame; math's `canvas` variant hosts "the figure beside the equation". A
plugin declares a slot and its contract:

```jsonc
// math.manifest.json
"contributes": { "extensionPoints": {
  "canvas-figure": { "description": "the figure that sits beside a canvas equation",
                     "requires": ["selector"] } } }
```

and a dependent fills it (`"slots": { "math/canvas-figure": { "selector": ".functionplot" } }`).
The host generates the CSS and runtime hooks that connect them — in math's case, the canvas
stage's sizing rule is written once against the slot, so the math component stops naming
`.functionplot` (§3.3 defect 5). A slot fill that names a missing point, or omits a required
field, fails the build.

**What this costs, against portable-packages §7.** That note declined versions and a resolver
because "the only dependency between packages is a theme's `extends`". Plugins change that: math,
function-plot, the chart family and every chart are real edges. The cost is bounded on purpose —
build-time only, one version per plugin, a four-operator range grammar, no network, no registry.
A theme's `extends` keeps resolving by name as it does today.

### 4.5 The host API (`api: 1`)

A plugin's code touches the engine only through `ctx`. Everything else is private.

| `ctx` member | Available to | What it is |
|---|---|---|
| `ctx.use(name)` | all adapters | another plugin's services (§4.4) |
| `ctx.escape`, `ctx.escapeAttr` | `render`, `bake` | the host's HTML escaping — the one a fence renderer must use for author text |
| `ctx.encodeConfig(text)` / `ctx.decodeConfig(el)` | `render`, `hydrate` | the placeholder payload (base64 UTF-8 today, `lib/core/base64-utf8.js`); plugins never hand-roll it |
| `ctx.report(id, detail)` | all | emits a declared diagnostic; an undeclared ID is a conformance failure |
| `ctx.fallback(el, text)` | `hydrate` | the host's standard "show the source as text, mark the figure settled" |
| `ctx.token(name)` | `hydrate` | a computed token value, for libraries that need a color in JS (Mermaid does) |
| `ctx.settle(el, state)` | `hydrate` | marks `pending / rendered / error / unavailable` — the state machine Mermaid and function-plot each wrote separately |
| `ctx.env` | `render` | per-render state; plugins keep no state in closures (`buildMd` is memoized, `parser-memo.test.js`) |

**The host, not the plugin, enforces fail-soft.** Every adapter call runs inside the host's
wrapper: a throw, a non-string from `render`, or a `hydrate` past its time budget produces the
declared `degradesTo` fallback and a diagnostic. LPM made fail-soft a rule each plugin had to
follow; this makes it a property of the host, which a buggy third-party plugin cannot break.

### 4.6 Render paths and the lifecycle

```
source ──parse (syntax, fences)──▶ html ──section/deck passes──▶ page
                                                       │
            ┌──────────────────────────────────────────┼─────────────────────────┐
         runtime / Studio                            CLI PDF · PNG · PPTX       HTML player
         hydrate (one module)                         hydrate in the export page  bake from the
                                                      (same module) or bake        hydrated page
```

- **One `hydrate` module serves every browser surface.** The runtime bundle and the CLI's export
  page load the same file. That deletes §3.3 defect 1 by construction: there is no second copy to
  drift.
- `render.paths` declares what each surface produces, and `render.parity` says how the paths
  relate (`equivalent` or `progressive`, as LPM defined them). The conformance harness checks the
  declared claim per path — never byte equality between paths that legitimately differ.
- `exec` names where the external renderer runs: `sync` (in the parser: KaTeX), `browser`
  (hydrate: function-plot), `subprocess` (a Node-driven page before render: Mermaid's worker).

### 4.7 Payload: loaded because the deck uses it

A plugin declares its payload — a library file, a stylesheet, font files — with `when`:

- `"always"` — part of the engine's CSS or bundle (rare; math's CSS is small and always-on today).
- `"used"` — loaded only when the deck uses the plugin.

**"Used" is computed from the same declaration that parses the deck.** For a fence, the host
derives the probe from the fence names (and aliases) in the manifest. For `syntax`, the plugin
exports `detect(source)`, and **the conformance harness runs `detect` against every fixture and
fails if it disagrees with the parser** — so math's second copy of the delimiter rules (§3.3
defect 2) can stay a fast pre-scan without being able to drift.

One host loader replaces the three `ensure-*` loaders (§3.1): `ensurePayload(plugin, base)` keeps
their per-URL promise cache, their retry-on-failure and their poll for the declared `global`. The
CLI emits a payload's `<script>` or `<link>` only when the deck uses the plugin; the HTML player
bakes hydrated output, so it ships no library bytes; the CSP script hashes are computed from the
assembled bytes as they are today (`player-core.mjs`). The `from: "npm:…"` form means an in-tree
plugin points at its npm dependency instead of vendoring a copy. Moving those dependencies to
`optionalDependencies` is a later, separate step (§7 phase F) — it changes what `npm i` installs.

### 4.8 Theming

`tokens` lists every token the plugin paints with. The build fails on a token that does not exist
in `base.tokens.css` — LPM's phantom-token check — and the catalog projects the list so a theme
author can see what a plugin reads. Plugin CSS goes through `build-css.js` and every gate that
applies to component CSS: no hex (#3), the 12 `--fs-*` roles (#4), no margin (#20), no partial
`@layer` (#26), no typed glyphs (#29). KaTeX's inline `#cc0000` error color (§3.3 defect 4) gets a
token-driven rule in the math plugin.

### 4.9 Trust follows the channel

Unchanged from `2026-09-13` §Axis 2, applied per contribution point:

| Channel | May carry | Status |
|---|---|---|
| **In-tree** (`lib/plugins/`) | every contribution point | **this design's scope** |
| **npm** (`lattice-plugin-*`, resolved at build time, inlined) | code points (`syntax`, `fences`, `hydrate`, `services`, `bake`) and all data points | **designed here, opened later** — after the plugin grant in `LICENSE-EXCEPTIONS` (contribution model, finding 6) |
| **Zip / Studio / AI-generated** | data points only: `components` without a transform, `styles`, `providers`, `transform` (DSL), `diagnostics`, slot fills | **opens with the kind row** (§7 phase E); code roles are refused by name at every door, as `transform.js` already is |

A zip-imported plugin **with code** needs more than the code-package contract: that contract
explicitly left out code that runs in the viewer's page (§5: "the runtime halves are out of v1"),
and `hydrate` is exactly that. It stays refused until a design gives it a boundary on the viewer's
page, and gets the full adversarial trio then.

### 4.10 Import and export

`plugin` becomes the fifth row in `lib/packages/kinds.js` (root `lib/plugins`, layout `folder`,
required `manifest.json`, `docs.md`, `fixtures.md`; code roles `syntax.js`, `hydrate.js`). So:

- `lattice packages list --type plugin` · `add <zip|folder>` · `check` · `export plugin/<name>` ·
  `remove plugin/<name>` work through the existing CLI with no new command.
- **An export carries the plugin's dependencies** that are not shipped with the engine, the same way
  portable-packages §4 carries a user theme's `extends` parent. An import checks the graph before
  it installs anything, so a half-installed plugin never exists.
- The Studio Library imports and exports the same zip through `package-zip.ts`.

### 4.11 Stability — how it survives time

- **`api` versions the host contract**, not the plugin. The host supports the current major and
  the previous one; an `api` it does not know is a build error that names the plugin and the
  Lattice version that supports it.
- **The contract is a spec**, `spec/LPM-1.0.md`, next to `LFM-1.0.md`: the manifest schema, the
  contribution points, `ctx`, the lifecycle and the deprecation rule. LFM §10–11 deferred
  out-of-tree fences and vocabulary "to a registration path"; this is that path.
- **Conformance fixtures are the plugin's tests, and one harness runs them all.**
  `<name>.fixtures.md` holds cases (input fence → expected markup; malformed input → the declared
  fallback and diagnostic; `detect` agreement). The harness runs every case on every declared
  render path. A plugin author writes cases, never a harness.
- **Discovery never happens at render time.** The registry is generated and committed-to-dist like
  the chart registry, so the runtime pays nothing to find plugins, and a bundler can follow every
  `require`.
- **Aliases carry renames.** `latticeplot → functionplot` is already a deprecated alias; the
  manifest makes the pattern general (`aliases[].deprecated`), and a deprecated alias reports a
  diagnostic with the new name.

### 4.12 Creating a plugin

```
lattice packages new plugin sparkline
```

writes a folder with a manifest, a `syntax.js` exporting one fence renderer, a stylesheet using two
tokens, a docs page, a gallery with one slide and two fixtures — and the build, the gallery and the
harness all pass on it untouched. The author edits from a working plugin, never from a blank page.
`lattice packages check <folder>` runs the schema, the resolver and the fixtures.

## 5. The future plugins, mapped onto the contract

| Plugin | Contributes | `exec` | Depends on | What moving it deletes |
|---|---|---|---|---|
| **math** | `syntax` (inline + block), `services.tex`, `components: [math]`, `styles`, payload (KaTeX CSS + fonts, and the browser provider), `extensionPoints.canvas-figure` | `sync` | — | `math-detect` drift (guarded), four KaTeX CSS routes → one declaration, `ensure-katex.ts` |
| **function-plot** | `fences.functionplot`, `hydrate`, `styles`, fills `math/canvas-figure`, payload | `browser` | `requires: math` | the second inflater, the `plugins.js` wrapper, the hand-written grammar row, function-plot CSS in the math component |
| **mermaid** | `fences.mermaid`, `bake` (the render worker), `hydrate` (the runtime `renderDiagrams`), `styles`, a hljs grammar, payload (`mermaid-v11.min.js`, 3.1 MB, `when: used`) | `subprocess` + `browser` | — | `mermaidUrl` threaded through six call sites; `renderDiagrams` becomes the plugin's own |
| **chart-family** | `extensionPoints.kernel` (the `transformSection` contract, `figureClass`, `marks`), the chart frame, `styles` | `sync` | — | `KERNEL_BUCKETS` and its mirror in `check-ownership.js` |
| **each chart** (23) | fills `chart-family/kernel`, `components: [<chart>]` | `sync` | `requires: chart-family` | `build-chart-registry.js` becomes a special case of the plugin registry (#287 lands here) |
| **highlight.js languages** | `providers` (grammar → file) | `browser` | — | the fourth loader idiom |
| **video providers** | `providers` into the video component's point | — | `requires: video` | the one-row edit becomes a one-file drop |

Two of these shaped the contract rather than the reverse: **Mermaid** needs `exec: subprocess` and
a `bake` point (it renders in a Node-driven page before the deck renders), and **the chart family**
needs extension points (23 plugins filling one host's slot, with a contract the host validates).
Without them the contract would work for the pilots and fail the third plugin.

## 6. The pilots, and why this pair

**Math stands alone.** It depends on nothing, contributes the most kinds of thing (syntax, a
service, a component, a payload, an extension point), and sits on the hottest path (every slide),
so it tests whether the contract can carry engine-wide behavior without a special case.

**Function-plot depends on math**, and the dependency is real rather than staged:

1. **It fills math's `canvas-figure` slot.** Its canvas sizing moves out of `math.styles.css` into
   the plugin, written against the slot (fixes §3.3 defect 5).
2. **It calls math's `tex` service** to typeset a plot's `title` as math: a config with
   `"title": "$f(x) = x^2$"` renders a KaTeX title above the plot. Function-plot draws its title as
   SVG text today, which cannot hold typeset math, so the plugin lifts the title out of the config
   and renders it as an HTML caption through the service. This is a **visible change** and ships
   with a demo deck (HARD RULE #9).

It also carries the most debt of any small integration (§3.3 defects 1, 5, 6), so the pilot pays
for itself whether or not a third plugin ever arrives.

## 7. Order of work

Each phase ships on its own, leaves the tree green, and is one commit series in one PR (#17).

- **A. The host core, and function-plot on it.** `lib/plugins/` with `plugin.schema.json`, the
  resolver and `tools/build-plugin-registry.js` (+ `--check`), `registry.generated.js`, the host
  fence table, the one hydrator and `ctx`, the conformance harness, the `plugin` kind row. Then
  function-plot moves in: one hydrator, the wrapper removed, the grammar row derived from its
  manifest. Declares `optional: { math }` until phase B lands, so A ships alone. Closes **#299**.
- **B. Math on it; function-plot switches to `requires: math`.** KaTeX's syntax, `detect`
  (guarded by the harness), `services.tex`, the `canvas-figure` point, one CSS route, the
  `.katex-error` token rule. The TeX title ships with its demo deck.
- **C. `lattice packages new plugin`**, `spec/LPM-1.0.md`, and the author docs.
- **D. Mermaid.**
- **E. Zip import/export of data-only plugins** in the CLI and the Studio.
- **F. The chart family** as a host with a `kernel` extension point; the 23 charts fill it (#287).
  Renderer libraries move to `optionalDependencies`.
- **G. The npm door**, after the `LICENSE-EXCEPTIONS` plugin grant.

A–C are the pilot. D and F are the proof that the contract was not built for two plugins.

## 8. Decisions for the owner

1. **A plugin is a new package kind that contributes components** (recommended), rather than a
   `render` block on the component manifest (LPM's shape). §4.1 says why: math is not one slide class.
2. **Function-plot `requires` math**, through the canvas slot and the `tex` service, with the TeX
   title as the visible feature (recommended). The alternatives: `optional` (plots work without
   math; the title is typeset only when math is present — more correct if math could ever be
   absent, which in-tree it cannot), or no dependency, with the resolver proven on synthetic
   fixtures only (proves nothing about a real edge).
3. **The doors open in this order: in-tree now, zip data-only at phase E, npm after the legal
   grant, zip code never without a viewer-page boundary design** (recommended).
4. **Amend portable-packages §7** to admit a build-time resolver with one version per plugin (§4.4).

## 9. Non-goals

- **No runtime discovery or network loading.** The export has to work offline, forever, under
  `script-src 'sha256-…'` (2026-09-13 §What this says about dynamic loading).
- **No third-party section transforms or deck passes** (§4.3).
- **No marketplace, remote registry, `install` from a URL, or signing.**
- **No per-deck `plugins:` front matter.** A deck uses a plugin by using its syntax; an explicit
  list is a second place to keep in sync. Revisit only if a real conflict between two installed
  plugins needs the author to choose.

## References

- [`2026-06-14-plugin-extension-system.md`](2026-06-14-plugin-extension-system.md) — LPM: `render`, parity, adapter invariants.
- [`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) — tiers, trust by channel, dynamic loading.
- [`2026-09-13-projected-rosters.md`](2026-09-13-projected-rosters.md) — the "declare once, derive the rosters" precedent.
- [`2026-09-23-portable-packages.md`](2026-09-23-portable-packages.md) — the spine; §7 amended here.
- [`2026-09-24-code-package-contract.md`](2026-09-24-code-package-contract.md) — the sandbox, and why viewer-page code is out of its v1.
- [`2026-06-29-component-transformer-threat-model.md`](2026-06-29-component-transformer-threat-model.md) — declarative-only for untrusted channels.
- [`2026-07-10-landing-perf-katex-defer.md`](2026-07-10-landing-perf-katex-defer.md) — why math's pre-scan exists.
- [`2026-07-02-contribution-model.md`](2026-07-02-contribution-model.md) — the legal door that gates npm.
- `spec/LFM-1.0.md` §10–11 — the deferred out-of-tree registration path.
- Issues **#287**, **#299**.
