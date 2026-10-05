# LPM — the Lattice Plugin Model

**Version:** 0.5-draft · **Status:** Draft · **Date:** 2026-10-05 · **Host API:** `api: 1`

A **plugin** teaches Lattice something that works on any slide — a syntax (`$…$`), a fenced block
(` ```functionplot `), the browser code that draws it and the CSS that paints it — as one folder
with a manifest. This document is the contract between a plugin and the host that runs it. The
design, and the reasons behind each rule, are
[`engineering/decisions/2026-09-27-plugin-system.md`](../engineering/decisions/2026-09-27-plugin-system.md);
the working guide is [`lib/plugins/README.md`](../lib/plugins/README.md).

**It stays a draft (0.x) until Mermaid and the chart family run on it** (the note's phases D and
F). Freezing it after two easy plugins would freeze a contract two easy cases shaped. Until then a
field may change in a minor version, and every change is recorded in §12.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

---

## 1. Scope

LPM covers **in-tree** plugins: folders under `lib/plugins/`, resolved at build time. A plugin
from a zip (the Studio Library, `lattice packages add`) and a plugin from npm are later channels
(§10); their manifest is this one, and what they may carry is narrower.

A plugin is **not** a slide layout. A layout is a **component** (`lib/components/`), and a
component that is designed around a plugin declares it in its own manifest:

```jsonc
"plugins": { "requires": ["math"], "optional": ["function-plot"] }
```

A plugin MUST NOT name a component.

## 2. The package

```
lib/plugins/<name>/
  <name>.manifest.json    REQUIRED  the declaration (§3)
  <name>.docs.md          REQUIRED  what an author reads
  <name>.fixtures.md      REQUIRED  conformance cases (§9)
  <name>.syntax.mjs       optional  the grammar: markdown-it rules and detect(source) (§4.1)
  <name>.render.js        optional  the renderers: what a token or fence becomes (§4.2)
  <name>.hydrate.js       optional  the browser half: hydrate(el, ctx), or createPass(ctx) (§4.3)
  <name>.bake.js          optional  the CLI half: bake(source, ctx), Node-side (§4.5)
  <name>.highlight.js     optional  a highlight.js grammar for its code fences (§4.6)
  <name>.styles.css       optional  token-only CSS (§4.4)
  shared/                 optional  IN-TREE ONLY: the plugin's own shared modules (.js/.cjs/.mjs
                                    and a README.md), imported by its role modules
```

- `<name>` MUST match `^[a-z][a-z0-9-]*$`, MUST equal the folder name and the manifest's `name`,
  and prefixes every file. A file with any other role is an error, and so is any subfolder but
  `shared/` (a folder whose name starts with `_` or `.` is not read).
- `shared/` holds code a plugin shares between its halves (Mermaid's init directive, render
  worker, reorientation, motion roles). It is in-tree only. A zip plugin carries none: the importer
  reads a package's top-level files, so a zip's `shared/` is dropped; when the code-package door
  admits a zip plugin's fence renderer, its export bundles what the renderer imports. An npm
  plugin's layout is settled with phase G.
- A plugin carries only the roles it contributes, and every role it carries MUST be declared
  (§3.3). The build checks both directions.

## 3. The manifest

Validated by [`lib/plugins/plugin.schema.json`](../lib/plugins/plugin.schema.json), which is closed
at every level: an unknown field is an error.

### 3.1 Identity

| Field | Required | Value |
|---|---|---|
| `type` | yes | `"plugin"` |
| `format` | yes | `1` — the manifest format |
| `name` | yes | the plugin's identity (§2) |
| `api` | yes | `1` — the host API this plugin is written for (§5). An unknown value is a build error |
| `title`, `description` | yes | one line each, for people |

### 3.2 Dependencies

| Field | Value |
|---|---|
| `requires` | plugin names this one cannot load without. A missing one or a cycle fails the build by name |
| `optional` | plugin names this one uses when present and MUST work without |

v1 checks names, presence and cycles, not versions. Disabling a plugin disables every plugin that
`requires` it. The host orders plugins topologically (ties broken by name); the order decides rule
installation, CSS order and hydrate order, and nothing else.

### 3.2.1 Loading — what admits a plugin

Every plugin is loaded EXPLICITLY, by one of three routes, and nothing else admits one:

| Route | Source |
|---|---|
| default | the host's default set — every shipped plugin, unless the host narrows it |
| listed | the deck's front-matter `plugins:` import list (`plugins: [math, mermaid]`) |
| component | a slide class the deck uses, whose component manifest declares `plugins.requires` — or FILLS one of the plugin's extension points (§3.3): filling a slot is requiring the plugin |

A loaded plugin loads what it `requires`, transitively; `optional` loads nothing. The list only
adds: listing a default plugin changes nothing, there is no removal syntax, and a name no plugin
has is reported (`plugin/unknown-plugin`) and ignored. The host's own switch (`disabled`) turns a
plugin off whatever admitted it, with every plugin that requires it, and a deck cannot override it.
Using a plugin's syntax admits nothing: the usage probe (`detect`, the fence names) decides only
when an admitted plugin's `payload` loads and its `bake` runs, and it reports a plugin the deck uses
that no route loaded (`plugin/used-not-loaded`).

**Admission reaches the browser through the engine's markup.** A fence `as: "code"` renders the same
code block whether or not its plugin is admitted, so the engine marks the `<pre>` of a fence whose
plugin is NOT admitted: `<pre data-lattice-off="<plugin>">`. Only then, so a render in which every
plugin is admitted carries no marker. A pass MUST NOT tag, draw, wait on or hide a fence whose
`<pre>` carries `data-lattice-off` (§6), and a host's drawn-fence probes count none. The marker
travels with the slide's markup, so every surface that shows the ENGINE's render (preview, export,
`--fluid`, `--player`) honors the deck's admission with no knob of its own. Admission is
DECK-WIDE: a host that renders one slide alone admits on the whole deck and passes the answer to
that render (the engine's `render(…, { pluginDefaults })`), or a plain fence beside a slide class
that loads its plugin would differ between the preview and the export. The Export-to-Marp bundle
does not run the engine, so it does not carry the marker. The CLI admits once per run and hands the
result to the engine, the `bake` and its boundary parser (whose block rules follow `off`, so a
plugin's block body is opaque only where the engine admits it). The `highlight` grammars stay
registered for every installed plugin, on purpose: an unadmitted plugin's fence is exactly the one
that stays code, and it should read as code. A Studio's own source-side readers (its lint, its
slide mapping) still read the default set's grammar and have no door for a narrowed one yet.

### 3.3 Contributions — `contributes`

| Key | Declares | Needs |
|---|---|---|
| `syntax` | markdown-it rules, keyed by the TOKEN TYPE each emits: `{ kind: "inline" \| "block", anchor: { before \| after: <host rule> }, triggers: [<char>…], opaque? }` | a rule export per key in `syntax.mjs`, `detect`, and a renderer per key in `render.js` `renderers` |
| `fences` | fenced blocks, keyed by NAME: `{ body: "json" \| "tex" \| "text" \| "mermaid", aliases?: [{ name, deprecated? }], as?: "code" }` | a renderer per name in `render.js` `fences` — except a fence `as: "code"`, which the engine renders as the highlighted code block every other fence becomes, and which has no renderer and no aliases (the plugin draws it later: by `bake`, or by its hydrate pass in a browser) |
| `bake` | `true` — the plugin draws its figures into the deck's Markdown on the CLI, before the engine renders | `bake.js` exporting `bake`, and `render.exec.bake` |
| `hydrate` | a browser half: `{ budgetMs? }` — an integer 100–30000, default 4000 (ignored by a pass) | `hydrate.js` exporting `hydrate` — or, with `render.exec.hydrate: "pass"`, exporting `createPass` |
| `highlight` | `true` — a highlight.js grammar for the plugin's code fences | `highlight.js` exporting `highlight`, and at least one fence `as: "code"` |
| `styles` | `true` | `styles.css` |
| `extensionPoints` | slots the plugin OFFERS and components FILL, keyed by the plugin's own slot name: `{ block?, bucket, role, entry, description }`. At most one slot per plugin in api 1. A component fills a slot by declaring its BLOCK (`block`, default the slot name: the chart family's `kernel`), which MUST be an object block the component manifest schema defines, and which only one plugin reads. Every component in `bucket` that declares the block fills the slot: it ships `<name>.<role>.js` exporting `entry`, called with the signature the offering plugin's `api` fixes, and by filling it REQUIRES the plugin (§3.2.1), with no `plugins` block. Not running, the plugin passes every filler's section through as authored and marks it (and a pane of it) `data-lattice-off="<plugin>"`, which a browser pass MUST skip as it skips a marked fence. In api 1 a slot is filled only by in-tree components; a slot filled by PLUGINS (data, such as an icon pack) is reserved for a later version as an additive field | — (the plugin's own code calls the fillers; the registry records the slot in `extension-points.generated.json`, keyed by block) |
| `diagnostics` | `{ "<name>/<id>": "message" }` — every ID reported on the plugin's behalf. **In api 1 only the HOST reports**, and only `<name>/deprecated-alias` (a deprecated fence alias was used); a plugin module has no `ctx.report` yet | — |

### 3.4 `payload`, `tokens`, `render`

| Field | Value |
|---|---|
| `payload` | `{ <key>: { from: "npm:<package>/<path>.js", global, when: "used" } }` — at most one file in api 1: the library the plugin's browser half waits for, loaded only for a deck that uses the plugin. REQUIRES `hydrate` (a pass asks the host for it — `ensureLibrary`, §6) |
| `tokens` | every design token `styles.css` reads — exactly the set of its `var(--…)` reads |
| `render.parity` | `equivalent` (every surface emits the same result) or `progressive` (a static surface emits a placeholder a browser completes) |
| `render.degradesTo` | what the host shows when a renderer throws or returns a non-string: `source`, `code-block` or `hidden` |
| `render.exec` | where code runs: `hydrate: "browser"` (a `hydrate.js` exporting `hydrate`, run by the plugin host on every browser surface, serialized onto the CLI export page) or `"pass"` (a `hydrate.js` exporting `createPass`, a document pass the runtime bundles and drives — §4.3; the plugin MUST `bake`, because the CLI export page carries no runtime). **`"pass"` is IN-TREE ONLY**: a pass is bundled into the runtime, which a zip or npm plugin cannot reach (§10); `bake: "subprocess"` (the bake blocks on another process, such as a headless browser) |
| `render.figureClasses` | the CSS classes of the container the plugin draws a figure into (its pass, its bake). They are the plugin's OWN: the plugin MUST also write the host's figure marker, `data-lattice-figure="<name>"`, on that container, and every consumer outside the plugin selects `[data-lattice-figure]` — never these classes (`checkPluginMigration` `drawnFigureClasses`, budget 0) |
| `render.surfaces` | what each surface emits — `engine`, `preview`, `pdf`, `player`, `marp` → `placeholder \| figure \| figure-baked \| source \| none` |

## 4. The role modules

### 4.1 `syntax.mjs` — the grammar

ESM, pure, and free of any library (the boundary parser and the docs site's pre-scan import it).
It exports each rule **under the token type it emits** (`export { mathBlockRule as math_block }`)
and `detect(source) → boolean`.

- The host installs every rule; a plugin MUST NOT install its own. An anchor names a markdown-it
  rule, never another plugin's.
- An inline rule MUST return `false` without consuming input unless the character at the position
  is one of its declared `triggers`, and every inline trigger MUST be a character markdown-it's
  `text` rule stops at.
- `detect` MUST be a superset of the rules: true for every source they would tokenize, and it MAY
  be true more often.
- A block rule is also installed in the boundary parser, so its body is never read as a slide
  break.

### 4.2 `render.js` — the renderers

CommonJS. Exports `renderers` (one function per `syntax` token) and/or `fences` (one per fence
name). Each is `(token, ctx, env) → string`, where `token.content` is the token's source or the
fence's body.

- A renderer MUST NOT keep state in closures; the engine reuses its parser across renders.
- A renderer MUST escape author text it writes into markup (`ctx.escape`, `ctx.escapeAttr`).
- A fence whose figure is drawn in the browser returns a placeholder built with
  `ctx.hydrateAttrs(token.content)` (§6).

### 4.3 `hydrate.js` — the browser half

CommonJS, exporting `hydrate(el, ctx)`. It runs on every browser surface from ONE source: the
runtime bundles it, and the CLI's export page runs it **serialized** from its own source text.
Therefore it MUST be self-contained: no `require`, no `import`, and nothing in the module outside
the `hydrate` function but its export — the build refuses all three. Everything it needs arrives
through `ctx` (§5.2).

- Returning normally, or resolving a returned promise, settles the element `rendered`.
- On a failure it SHOULD show the reason on the slide and call `ctx.settle(el, 'error')`.
- It MUST emit SVG or HTML the slide sanitizer allows. A `<canvas>` loses its pixels when the
  player clones the page; a plugin that needs one needs a `bake` (§4.5).

**A pass** (`render.exec.hydrate: "pass"`, in-tree only) is the other shape, for a browser half
that cannot draw one figure on its own — Mermaid's: `mermaid.initialize` is global, so per-slide
palettes need every fence grouped by the palette its slide resolves and each band rendered on one
serial queue. `hydrate.js` exports `createPass(ctx)` instead of `hydrate`, and the runtime finds
it through the registry (`lib/plugins/passes.generated.js`) and drives what it returns:

- `boot()` — once, at the runtime's bootstrap, before the pass is ever `run`: tag its figures with
  the host's markup (§6), ask the host for its library, start its own wait;
- `run({ force })` — on every content pass; returns false to be asked again next frame;
- `onMutations(records)` — in the runtime's mutation observer, before its debounce: cheap work
  only (settle what it already holds), never a render;
- `describe()` — fields for the runtime's bootstrap log.

`ctx` carries `name`, `fences` (the plugin's code fences), `win`, `ownScript` (the runtime's
`<script>`, or null), `host()` (the plugin host — `ensureLibrary`), `schedule()` (the debounced
content pass) and `runAll({ force })` (the content pass, now, which calls `run` back — and returns
whether THIS pass walked; `force` reaches only this pass). Passes are isolated: a throw in one
pass's `boot` or `onMutations` is caught and logged, and the others and the runtime go on. The
runtime's bootstrap log merges every pass's `describe()`, so a second pass SHOULD prefix its keys. A pass is
never serialized, so it MAY require; it is still inside the HARD RULE #22 census of markup written
into the preview frame (`SANCTIONED_RUNTIME_MARKUP_SINKS`).

### 4.4 `styles.css`

Token-only CSS: every color through `var(--token)`, and it passes every gate component CSS
passes — no hex, no spacing `margin` (a bare `margin: 0` reset is fine), no `@layer`, no typed
glyphs, and monospace only where `tools/check-ownership.js` sanctions it. Type sizes SHOULD use the
`--fs-*` roles; no gate enforces that yet. It is
bundled into one slot of `dist/lattice.css`, in dependency order. A layout that sizes a plugin
figure selects the host's marker `[data-lattice-hydrate]`, never the plugin's own classes.

### 4.5 `bake.js` — the CLI half

CommonJS, Node-side, exporting `bake(source, ctx) → string`: the deck's Markdown in, the same
Markdown with this plugin's figures drawn into static markup out. The CLI's plugin host
(`lib/plugins/host-bake.js`) runs every active plugin's bake, in dependency order, before the
engine renders, and only for a deck that uses the plugin (its `detect`, or one of its fence names).
It may require anything; no browser bundle ever loads it. `ctx` is frozen and carries:

- `name`, a fresh `state` object the bake may fill, and the export's GENERIC services
  (`BAKE_SERVICES` in `lib/plugins/host-bake.js`; `bakeDeck` refuses any other): `pkgRoot`,
  `quiet`, `print`, `paletteUsesTexture`, `orientation`, `browser: { path, args }`,
  `readToken(scope, name)` (a palette token as a `{ band, hand }` scope resolves it),
  `scopeKey(scope)` and `paletteReader(palette, hand)` (a token reader over any palette, with the sketch face's
  re-points). None names a plugin: what a plugin builds from a palette is the plugin's.

A bake whose figures bake a palette in MAY publish **the re-bake hook**, `state.rebake`, which the
image-set export's cross-scheme look reads instead of anything plugin-named: `noun` (how a warning
names one figure), `keptWhy` / `keptFix` / `failedWhy` (the warnings' plugin-specific words), `figure` and `indexAttr` (its figures' selector in the rendered page, and the
attribute carrying each one's index), `bakedBand(idx)`, and `render(idx, { band, palette })` →
`{ markup, kept }` (the figure re-rendered, its element carrying `data-look-idx`; `kept` when
author-fixed colors survive), `{ kept: true }`, `{ failed: true }` or null. Mermaid's bake publishes
one; the chart family (phase F) is its expected second user.

On the CLI a bake that throws or returns a non-string FAILS THE EXPORT, naming the plugin (§8).

### 4.6 `highlight.js` — the source grammar

CommonJS, exporting `highlight(hljs)`: a highlight.js language definition. The host
(`installPlugins`) registers it on the engine's highlight.js under each of the plugin's fences
declared `as: "code"`, so that fence's source is syntax-colored wherever it shows — before a
browser draws it, and when it cannot be drawn. It is registered for EVERY installed plugin, a
switched-off one included: a switched-off plugin's fence is exactly the fence that stays source.
A language highlight.js already knows by that name is left alone.

## 5. The host API (`api: 1`)

### 5.1 For renderers

| `ctx` member | What it is |
|---|---|
| `ctx.name` | the plugin's name |
| `ctx.options` | this plugin's install options (`createEngine({ plugins: { options: { <name>: … } } })`), frozen |
| `ctx.family` | the deck's box family: `wide`, `square`, `tall` or `strip` |
| `ctx.escape(s)`, `ctx.escapeAttr(s)` | HTML escaping for text and attribute values |
| `ctx.encodeConfig(text)` | a text payload packed for an attribute (base64 of UTF-8) |
| `ctx.hydrateAttrs(text)` | the placeholder attributes (§6) |

`env`, the third argument, is markdown-it's per-render object.

### 5.2 For `hydrate`

| `ctx` member | What it is |
|---|---|
| `ctx.name` | the plugin's name |
| `ctx.lib` | the global the `payload` defines (`window.functionPlot`); it MUST be a function |
| `ctx.decodeConfig(el)` | the body the renderer packed |
| `ctx.settle(el, state)` | report a state (§6); a plugin reports `error` |
| `ctx.token(el, name)` | a token's computed value on that element, so a slide's own `dark` wins |

## 6. The settle protocol

A placeholder carries its state in markup, so every capture can read it without a handle on the
host's code:

```html
<div class="functionplot" data-lattice-hydrate="function-plot"
     data-lattice-config="…" data-lattice-settle="pending"></div>
```

| `data-lattice-settle` | Written by | Meaning |
|---|---|---|
| `pending` | the ENGINE | not settled; every capture waits |
| `hydrating` | the host | being drawn; every other pass and host skips it, and captures wait |
| `rendered` | the host | `hydrate` returned |
| `error` | the plugin, or the host when `hydrate` throws or its promise rejects | a failure, shown on the slide |
| `unavailable` | the host | the library never arrived; the author's source is shown. Recoverable |

A fence of a plugin the deck did not load carries `data-lattice-off="<plugin>"` instead (§3.2.1),
written by the ENGINE on its `<pre>`. It is never `pending`, nothing waits on it, and no pass or host
writes settle state on it: it is the author's code block for good.

`data-lattice-final` closes an element: a capture that stopped waiting, or a `hydrate` whose
returned promise is still pending at `budgetMs` (a synchronous `hydrate` has no budget), sets it (with `unavailable` and the source shown), and nothing touches the element
again — a late draw is discarded. Every capture — the CLI's PDF, PNG and PPTX, the `--player`
bake, the Studio's export — waits until no element matches
`[data-lattice-hydrate]:is([data-lattice-settle="pending"], [data-lattice-settle="hydrating"]):not([data-lattice-final])`,
bounded. A placeholder naming a plugin the page has no browser half for is settled `unavailable`
at once.

**A figure drawn from its own code block** (a fence `as: "code"`, drawn by a pass — Mermaid)
carries the same markup on its `<pre>`, written by the plugin's PASS when it reaches the fence
(at boot, before `load`) rather than by the engine: `data-lattice-hydrate="<plugin>"` and the settle
state, `hydrating` while a draw is in flight. So every capture above waits on it with no selector
of its own. It has no `data-lattice-config`: its content already is the author's highlighted
source, so a release (`unavailable`, from the host or a capture) leaves that content in place,
and the plugin's CSS shows it. On a page whose runtime draws that plugin, the host's `run` never
draws or releases its `<pre>` — the pass owns it, and draws into a sibling it owns — while any OTHER element carrying the
plugin's name is an author's and is settled `unavailable` at once; a page with no such pass (the CLI
export page) releases them all. The host loads the plugin's `payload` for that pass through the same
loader a `hydrate`'s uses (`ensureLibrary(name, isReady, onSettled)`: from beside the runtime, once
per page, never retried), and a frame builder may preload it.

## 7. Resolution rules

The build (`tools/build-plugin-registry.js`, through `lib/plugins/resolve.js`) fails, naming the
plugin, when:

- a plugin is declared twice, its folder does not match its name, or its `api` is unknown;
- it depends on itself, lists one name as both `requires` and `optional`, requires a plugin that is
  not installed, or sits on a dependency cycle;
- a syntax anchor is not a host rule, an inline trigger is a character markdown-it's `text` rule
  does not stop at, or an inline rule is marked `opaque`;
- `payload` is declared without `hydrate`, or names more than one file;

- a declared contribution has no module export, or a module exports one the manifest does not
  declare (syntax renderers, fence renderers, `hydrate` or `createPass`, `highlight`, `styles.css`,
  `tokens`); `highlight` is declared with no fence `as: "code"` to register it under;
- two plugins emit one token type, claim one trigger character in one ruler, or claim one fence
  name or alias;
- a fence name is a code language — any highlight.js language or alias — unless the committed
  registry already ships that claim for the same plugin: a highlight.js upgrade that later takes a
  shipped fence name leaves the plugin its fence and the build warns, so the upgrade cannot break
  decks already written;
- a fence `as: "code"` has a renderer or an alias; `bake` is declared without `bake.js` or without
  `render.exec.bake`, or the reverse; a plugin whose hydrate is a pass (`render.exec.hydrate:
  "pass"`) declares no `bake` or no `hydrate`, or its `hydrate.js` exports `hydrate` instead of
  `createPass` (or a non-pass exports `createPass`);
- a deprecated alias has no `<name>/deprecated-alias` diagnostic to report it with;
- a `hydrate.js` that is not a pass requires or imports a module, or holds code outside `hydrate()`;
- two plugins' payload files share a file name, or one is a file the runtime host serves;
- a diagnostic ID is outside the plugin's `<name>/` namespace;
- a component `requires` a plugin that does not exist, or its gallery uses a plugin's syntax or
  fence without declaring it;
- two plugins read one extension-point block, two slots claim one bucket, a slot's block is not
  an object block the component manifest schema defines, or a component declares a slot's block
  outside the slot's bucket.

## 8. Fail-soft

A renderer that throws or returns a non-string renders the plugin's `degradesTo`, and the rest of
the deck renders. For a FENCE renderer, `source` means a code block of the body — a paragraph would
flatten a multi-line config into one line. A tokenizer rule is not wrapped — a throw mid-scan leaves markdown-it's position
undefined — so the conformance harness feeds each rule its malformed fixtures instead. A `hydrate`
that throws settles `error`; one that overruns its budget is closed (§6). A `bake` that throws or
returns a non-string fails a CLI export, naming the plugin: an export that exits green with source
where the figures should be is the worst failure an export engine has. (The host's default, for
other callers, is to keep the source and warn.) A single figure the plugin cannot draw is the
plugin's to degrade, inside its bake — Mermaid shows that diagram's escaped source.

## 9. Conformance

`<name>.fixtures.md` holds cases: a `##` heading, a ` ```markdown ` input (use a four-backtick
outer fence when the input holds a fence), and bullets —
`- renders \`text\``, `- omits \`text\``, `- detect true|false`. The harness
(`test/unit/plugins/conformance.test.js`) runs every case through the engine and also checks, on
every case, that `detect` finds whatever the plugin's rules or fences took; across the file, that
every declared token, fence and alias is exercised; and that a disabled plugin installs nothing and
leaves its fences as code blocks.

## 10. Trust channels

| Channel | May carry |
|---|---|
| In-tree (`lib/plugins/`) | every contribution |
| Zip — the Studio Library, `lattice packages add` (later phase) | `styles`, `diagnostics`; fence code only through the code-package door (consent pinned to the code's hash, then a sandbox). Never `syntax`, `hydrate` (a pass least of all), `highlight`, `bake`, `payload` or `extensionPoints` — and a zip COMPONENT cannot fill a slot either, because a filler is code — a `bake` runs with full Node privileges in the CLI's process, which no sandbox the door has can hold |
| npm, by an explicit list (later phase) | every contribution, after the license grant |

A shipped plugin's name is reserved.

## 11. Creating one

```
lattice packages new plugin <name>
```

writes a folder with a manifest, a fence renderer, a stylesheet, docs and fixtures. Run
`npm run build` to regenerate the registry; the scaffold then passes `npm run build:check`,
`npm run test:plugins` and the full `npm test` unedited — its Marp-export row is derived from its
manifest (`lib/core/marp-fidelity.js`). The name must be free: not a plugin, a plugin fence, a
highlight.js language or alias, and at most 64 characters.

## 12. Changes

- **0.5-draft, extension points (2026-10-05).** `contributes.extensionPoints` (§3.3): a slot a
  plugin offers and components fill. The chart family offers `kernel`, filled by every chart in the
  `chart` bucket; filling a slot is requiring the plugin (§3.2.1), and a switched-off slot plugin
  marks each filler's section `data-lattice-off`.

- **0.5-draft, `shared/` (2026-10-05).** A shipped plugin may carry an in-tree-only `shared/`
  folder of modules (§2); Mermaid's five shared kernels moved there from `lib/integrations/mermaid/`.

- **0.5-draft, admission on the browser half (2026-10-05).** `data-lattice-off="<plugin>"` (§3.2.1,
  §6): the engine's marker on an unadmitted plugin's code fence, which every pass and probe skips.
  The CLI's boundary parser follows the run's admission. A host may now narrow the default set.

- **0.5-draft, phase D's last consumers (2026-10-05).** `render.figureClasses` and the host's
  figure marker `data-lattice-figure="<name>"` (§3.4): what an export, a capture or a layout
  selects to find a drawn figure on any surface, so none names a plugin's output class.

- **0.5-draft (2026-10-05).** Explicit loading (§3.2.1): a plugin is admitted by the host's
  default set, the deck's `plugins:` import list, or a component that requires it — never by the
  usage probe, which now decides only when a payload loads and a bake runs.

- **0.4-draft (2026-10-04).** Phase D's browser half, finished: `render.exec.hydrate: "runtime"` is
  gone, and `"pass"` replaces it — Mermaid's diagram pass is the plugin's own `hydrate.js`
  (`createPass`, §4.3), which the runtime drives through the registry. A `highlight` contribution
  (§4.6) and Mermaid's `styles`: the plugin owns its grammar and its stylesheet. The bake context's
  services are a closed, generic list (`diagramTheme` is gone; `paletteReader` is
  new), and `state.rebake` is the generic re-bake hook (§4.5).
- **0.3-draft (2026-09-29).** Phase D's browser half: a runtime-drawn plugin may declare a
  `payload` (Mermaid's library, `npm:mermaid/dist/mermaid.min.js`), which the host loads for the
  runtime's pass (`ensureLibrary`); a figure drawn from its own code block carries the settle
  protocol's markup on its `<pre>` (§6), and a release keeps its content.
- **0.2-draft (2026-09-28).** Phase D: `bake` and `render.exec.bake: "subprocess"`, a fence
  `as: "code"`, and `render.exec.hydrate: "runtime"`. `mermaid` stops being a host-reserved fence
  name and becomes the mermaid plugin's. Shipped plugins: `math`, `function-plot`, `anima`,
  `mermaid`.
- **0.1-draft (2026-09-27).** First draft: `syntax`, `fences`, `hydrate`, `styles` and
  `diagnostics`; `payload`, `tokens`, `render.surfaces`; the settle protocol. Shipped plugins:
  `math`, `function-plot`, `anima`.
