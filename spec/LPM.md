# LPM — the Lattice Plugin Model

**Version:** 0.1-draft · **Status:** Draft · **Date:** 2026-09-27 · **Host API:** `api: 1`

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
  <name>.hydrate.js       optional  the browser half: hydrate(el, ctx) (§4.3)
  <name>.styles.css       optional  token-only CSS (§4.4)
```

- `<name>` MUST match `^[a-z][a-z0-9-]*$`, MUST equal the folder name and the manifest's `name`,
  and prefixes every file. A file with any other role is an error.
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

### 3.3 Contributions — `contributes`

| Key | Declares | Needs |
|---|---|---|
| `syntax` | markdown-it rules, keyed by the TOKEN TYPE each emits: `{ kind: "inline" \| "block", anchor: { before \| after: <host rule> }, triggers: [<char>…], opaque? }` | a rule export per key in `syntax.mjs`, `detect`, and a renderer per key in `render.js` `renderers` |
| `fences` | fenced blocks, keyed by NAME: `{ body: "json" \| "tex" \| "text", aliases?: [{ name, deprecated? }] }` | a renderer per name in `render.js` `fences` |
| `hydrate` | a browser half: `{ budgetMs? }` — an integer 100–30000, default 4000 | `hydrate.js` exporting `hydrate` |
| `styles` | `true` | `styles.css` |
| `diagnostics` | `{ "<name>/<id>": "message" }` — every ID reported on the plugin's behalf. **In api 1 only the HOST reports**, and only `<name>/deprecated-alias` (a deprecated fence alias was used); a plugin module has no `ctx.report` yet | — |

### 3.4 `payload`, `tokens`, `render`

| Field | Value |
|---|---|
| `payload` | `{ <key>: { from: "npm:<package>/<path>.js", global, when: "used" } }` — at most one file in api 1: the library `hydrate` waits for, loaded only for a deck that uses the plugin. REQUIRES `hydrate` |
| `tokens` | every design token `styles.css` reads — exactly the set of its `var(--…)` reads |
| `render.parity` | `equivalent` (every surface emits the same result) or `progressive` (a static surface emits a placeholder a browser completes) |
| `render.degradesTo` | what the host shows when a renderer throws or returns a non-string: `source`, `code-block` or `hidden` |
| `render.exec` | where code runs: `{ hydrate: "browser" }` |
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
  player clones the page; a plugin that needs one needs a `bake` (a later contribution point).

### 4.4 `styles.css`

Token-only CSS: every color through `var(--token)`, and it passes every gate component CSS
passes — no hex, no spacing `margin` (a bare `margin: 0` reset is fine), no `@layer`, no typed
glyphs, and monospace only where `tools/check-ownership.js` sanctions it. Type sizes SHOULD use the
`--fs-*` roles; no gate enforces that yet. It is
bundled into one slot of `dist/lattice.css`, in dependency order. A layout that sizes a plugin
figure selects the host's marker `[data-lattice-hydrate]`, never the plugin's own classes.

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

`data-lattice-final` closes an element: a capture that stopped waiting, or a `hydrate` whose
returned promise is still pending at `budgetMs` (a synchronous `hydrate` has no budget), sets it (with `unavailable` and the source shown), and nothing touches the element
again — a late draw is discarded. Every capture — the CLI's PDF, PNG and PPTX, the `--player`
bake, the Studio's export — waits until no element matches
`[data-lattice-hydrate]:is([data-lattice-settle="pending"], [data-lattice-settle="hydrating"]):not([data-lattice-final])`,
bounded. A placeholder naming a plugin the page has no browser half for is settled `unavailable`
at once.

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
  declare (syntax renderers, fence renderers, `hydrate`, `styles.css`, `tokens`);
- two plugins emit one token type, claim one trigger character in one ruler, or claim one fence
  name or alias;
- a fence name is a code language — any highlight.js language or alias, or a host-reserved name
  (`mermaid`);
- a deprecated alias has no `<name>/deprecated-alias` diagnostic to report it with;
- a `hydrate.js` requires or imports a module, or holds code outside `hydrate()`;
- two plugins' payload files share a file name, or one is a file the runtime host serves;
- a diagnostic ID is outside the plugin's `<name>/` namespace;
- a component `requires` a plugin that does not exist, or its gallery uses a plugin's syntax or
  fence without declaring it.

## 8. Fail-soft

A renderer that throws or returns a non-string renders the plugin's `degradesTo`, and the rest of
the deck renders. For a FENCE renderer, `source` means a code block of the body — a paragraph would
flatten a multi-line config into one line. A tokenizer rule is not wrapped — a throw mid-scan leaves markdown-it's position
undefined — so the conformance harness feeds each rule its malformed fixtures instead. A `hydrate`
that throws settles `error`; one that overruns its budget is closed (§6).

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
| Zip — the Studio Library, `lattice packages add` (later phase) | `styles`, `diagnostics`; fence code only through the code-package door (consent pinned to the code's hash, then a sandbox). Never `syntax`, `hydrate` or `payload` |
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
highlight.js language or alias, or a name the engine renders (`mermaid`), and at most 64
characters.

## 12. Changes

- **0.1-draft (2026-09-27).** First draft: `syntax`, `fences`, `hydrate`, `styles` and
  `diagnostics`; `payload`, `tokens`, `render.surfaces`; the settle protocol. Shipped plugins:
  `math`, `function-plot`, `anima`.
