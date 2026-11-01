---
status: proposed
summary: >
  The plugin contract follows the Hollywood principle: the host calls a plugin and hands it what it needs;
  the plugin never reaches into the engine, and the host never reaches into the plugin. Three channels
  carry everything a plugin touches: `ctx` (frozen host data and host-bound capabilities, never a live host
  object), the manifest (contract data the host reads), and owned dependencies (pure helpers, in the plugin
  or in a package named for its job). Walls and sanitizers are the host's, chosen from what a plugin declares
  it outputs, and they only narrow. Replaces #2997's `lib/plugin-kit/`, empties `hostApi`, and lands as one
  complete PR: no transitional kit, no ratchet standing in for unfinished work. Plugins get private
  `package.json` files now and publish later as the npm door's bundle; `@laticent/plugin-api`,
  `@laticent/markup` and `@laticent/segno` are the shared packages.
---

# The plugin contract is Hollywood: the host calls, the plugin owns its dependencies (2026-11-01)

**Answer.** A plugin is called; it does not call in. Everything a plugin's code touches arrives through one
of three channels, and each channel has one job:

| Channel | Carries | Who owns it | Example |
|---|---|---|---|
| **`ctx`** | Frozen host data and host-bound capabilities: anything whose answer depends on the deck, the surface, the install, other plugins or the trust boundary. **Never a live host object** (no markdown-it `state`, no `env`, no token array, no renderer) | The host builds it per contribution point (§4) | `ctx.deck.frontMatter('code')`, `ctx.slideAt(offset)`, `ctx.data()`, `ctx.service('icons', 'drawHtml')`, `ctx.payload('katex.css')` |
| **Manifest** | Contract data a host tool reads without running plugin code: vocabularies, slots, declared output kinds, provider tables | The plugin declares it; the host reads it | pill `SHAPES`, an inline kind's `slot`, `output: "svg-diagram"`, the video `providers` table |
| **Owned dependencies** | Pure, stateless helpers | The plugin's own code, or a versioned `@laticent/*` package **named for its job** when the helper has real use beyond the plugin | balanced-HTML walking (`@laticent/markup`), the line-range value type (`@laticent/segno`) |

Two directions, both closed:

1. **Plugin → engine.** A plugin's code imports only its own folder and the packages its `package.json`
   declares. It never imports `lib/`, a kit, or another plugin; it reaches another plugin only through
   `ctx.service`.
2. **Engine → plugin.** Host code never imports a plugin's file. It reads the manifest, calls a hook the
   manifest declares, or reads a generated table. `hostApi` goes away.

And one rule about trust: **walls and sanitizers belong to the host, and they only narrow.** A plugin declares
what it outputs (`html`, `svg-diagram`, `mathml`); the host picks the profile for that kind. No plugin names
its own profile, and a refused strict check fails closed (§2, the `sanitize` row).

### Owner decisions (2026-11-01, four rounds)

1. "Plugins get called with what they need and they should own their dependencies; our API for plugins can
   pass in context, so the plugin contract should define the interchange." Hold #2997 for this redesign.
   Pure helpers become owned dependencies, not `ctx` members.
2. "I want low coupling and strong cohesion." A contract-only `@laticent/plugin-api`, not a plugin-core
   utilities bag; shared helpers are packages named for what they do; plugins stay in their folders and
   shared packages go in `packages/`.
3. "Anything shared has to have utility beyond the plugin." The §2a audit, adopted.
4. After the adversarial trio (§8): "We never ship things that are broken. No broken windows, no tech debt,
   no settling and no jank." So #2997 stays held, the kit never lands as transitional debt, and the work
   merges as one complete PR (§6). Plugins get **private** `package.json` files now and are published later
   as the npm door's bundle, not as source packages.

## 1. Why, and what was wrong with the kit

`2026-09-27-plugin-system.md` §4.6 already says "a plugin's code reaches the engine only through `ctx`",
and `lib/plugins/host.js:5` repeats it. #2997 (superseding #2630) added `lib/plugin-kit/`: 17 modules,
each a thin re-export of `lib/core` internals, that plugins `require` by relative path (42 import lines on
`cf61608`). Its structure gate then admitted "own folder + kit". That made the boundary checkable, which was
the real win, but it pointed the dependency arrow the wrong way:

- **The plugin pulls.** A plugin picks which engine internals it wants, and the kit grows each time one asks.
  The kit is `lib/core`'s surface under a second name, so a core refactor is still a plugin break.
- **It cannot leave the repo.** A relative `require('../../plugin-kit/…')` resolves only inside this tree.
  The kit also carries module state (`plugin-data.js:22-24`, a loader map that two copies would disagree on)
  and a repo-layout assumption (`payload-path.js:37,56,71` joins `lib/plugins/<name>/`).
- **Trust sits in the wrong place.** #2997 moves the KaTeX wall from `lib/core/katex-wall.js` (host code on
  `main`) into `lib/plugins/math/shared/`, so the plugin holds its own wall; `math/shared/katex-wall.js`
  requires `plugin-kit/sanitize.js`, and `mermaid/shared/render-worker.js:152,231` requires
  `plugin-kit/sandbox.js`. A plugin should not hold its own confinement or certify its own output.
- **The host also pulls.** 24 imports, from 12 host files into 14 plugin files (`hostApi` on 8 manifests),
  let the linter, inline editors, code formatting and the exports call first-party plugin code. A third-party
  plugin can never be read that way (`lib/packages/npm-plugin-loader.js:27`, G5), so first-party plugins get
  lint, completion and editors a third-party plugin cannot.

`ctx` is not new. On `main` it already reaches four contribution points, and this note keeps what works:

| Point | `ctx` on `main` today | Where |
|---|---|---|
| render (syntax, fences, code) | `name`, `options`, `family`, `escape`, `escapeAttr`, `encodeConfig`, `hydrateAttrs`; built once per memoized parser, up to three frozen copies per plugin | `lib/plugins/host.js:97-107`, used at `:143`, `:176`, `:254` |
| bake | `BAKE_SERVICES`: `pkgRoot`, `quiet`, `print`, `paletteUsesTexture`, `orientation`, `browser`, `readToken`, `scopeKey`, `paletteReader`, `fileConfine` (#2997 adds `paneOrientations`), plus `state.rebake` | `lib/plugins/host-bake.js:65` |
| hydrate | `name`, `lib`, `draw`, `drawInto`, `decodeConfig`, `token`, `settle`; `drawInto` is the one sanctioned host-sanitized markup sink (`SANCTIONED_RUNTIME_MARKUP_SINKS`, HARD RULE #22) | `lib/plugins/host-browser.mjs:202-213` |
| pass (`exec.hydrate: "pass"`) | `win`, `ownScript`, `fences`, `host()` | `spec/LPM.md` §4.3, `lib/plugins/mermaid/mermaid.hydrate.js:26-31` |

The draw frame on `main` (`lib/packages/draw-frame-core.mjs`, the manifest `draw` section,
`lib/plugins/mermaid/mermaid.draw-host.mjs`) and the sandbox work it belongs to
(`2026-10-19-first-party-plugins-in-the-sandbox.md`, in progress) already put walls around first-party
libraries. This note finishes that line of work at the import level; it does not replace it.

## 2. What a plugin reaches today, and where each piece goes

**Inventory** (`cf61608`, every relative import in `lib/plugins/<name>/**` that resolves outside its own
folder, comments excluded, plus every existing `ctx` member above):

- **Through the kit:** 42 import lines into 17 modules (the table below).
- **Into the engine directly:** chart-family's generated registry imports all 28 chart component transforms
  (`chart-family/shared/chart-registry.generated.js:5-32`). On `main`, `mermaid.bake.js:442` also does
  `require('../../engine').paneOrientations(source)`, which #2997's gate does not see (dependency-cruiser
  misses the ternary-wrapped call); #2997 already replaces it with the `paneOrientations` bake service.
- **Into another plugin:** checks imports pills twice (`checks/checks.inline.js:29` for `SIZES`,
  `checks/shared/compose.js:22` for `pillHtmlFrom`/`pillElementFrom`), and `pillHtmlFrom` in turn calls
  `service('icons', 'drawHtml')` (`pills.inline.js:429`).

| Kit module | Plugin users | Goes to | The new shape |
|---|---|---|---|
| `sandbox` | mermaid (`render-worker.js`) | **host** | The host launches and confines the bake's page: the locked origin, request refusal, strict CSP and the OS sandbox, from the kernel `main` already has (`draw-frame-core.mjs`, `fileConfine`, `browser`). Mermaid keeps what its page draws. Lands with the work in `followups.d/2800-p3-mermaid-bake-one-browser.md` and `2749-p3-migrate-in-tree-plugins-to-sandbox-model.md`, which this note does not duplicate. |
| `sanitize` | math (`katex-wall.js`) | **host** | **Profiles are the host's and only narrow.** The host owns the slide profile (`sanitize-slide-html.mjs`), the diagram profile (`sanitize-diagram-svg.mjs`) and the KaTeX wall's vocabulary check. A plugin declares its output kind in the manifest; the host maps the kind to a profile. A new or looser profile is a `SANCTIONED_*` entry with its justification (the HARD RULE #22 pattern), never a manifest string. A refused strict check **fails closed**: today `finish()` in `lib/core/katex-wall.js:237` falls back to the slide sanitizer, which keeps `position:fixed` that `checkTypeset` refused (the red team ran it); that pre-existing gap is on this path and is fixed here (#18). The host sanitizes where output is token-balanced (a whole fence or draw result, as the draw host's `finish` does), **not per renderer call**: the red team measured a per-call pass emptying Mermaid's SVG, deleting paired tokens' halves and rewriting `<path/>` as `<path></path>` in every export. The KaTeX wall stays host code in `lib/core/`, and #2997's move of it into math is dropped. Measured cost of a slide-profile pass in Node: 424 ms to load, 0.33 ms per fragment (red team, `createSlideSanitizer` + jsdom). The bar is byte-identical exports across every deck; any byte change goes to the owner for the QUALITY BAR export sign-off. |
| `plugin-data` | avatars, icons (host: `lib/engine/index.js`, `lib/runtime/index.js`) | **`ctx`** | `ctx.data()` (null while pending) and `ctx.dataPending()`, both getters read per call. The loader map moves into the host, one per surface. |
| `services` | pills | **`ctx`** | `ctx.service(plugin, name)`, null when that plugin is off, bounded by the caller's `requires`/`optional`. **The host binds the owning plugin's `ctx`** when it runs a service, so `icons.drawHtml` called from inside a pills service still has icons' `data()`. checks stops importing pills: `pillHtml`/`pillElement` become pills services and `SIZES` becomes pills manifest data. A `package.json` never lists another plugin. |
| `payload-path` | mermaid, `hydrate-script.js` (host: the `--player` and locked-figure exports, four build tools) | **`ctx`** | `ctx.payload(key)` / `ctx.vendor(lib, key)`, **keyed, not path-taking**, refusing undeclared keys as `payload-path.js` does today, so no `../` traversal. The host resolves from the plugin's install location. |
| `fonts` | mermaid (bake) | **`ctx`** | `ctx.fonts.faces`, `ctx.fonts.faceCss(face)` on the bake point. |
| `media` | mermaid (bake, `render-worker.js:153`) | **`ctx`** | `ctx.media.webImagePlaceholder` on the **bake** point. |
| `diagram-theme` | mermaid (bake and hydrate) | **Mermaid** | `diagram-look` and `mermaid-theme-map` have no code importer outside Mermaid, the kit and two audit tools, so they move into the plugin. Mermaid reads tokens through the existing `readToken`/`paletteReader` (bake) and `token` (hydrate). This keeps phase D's decision (`2026-09-27-plugin-system.md:1160-1164`: theme assembly moved into the bake) and `spec/LPM.md` §4.5 ("what a plugin builds from a palette is the plugin's"). |
| `deck-walk` | mermaid | **split** | The bake stays **whole-deck** (`bake(source, ctx) → string`, LPM §4.5); Mermaid renders the batch in one page. Slide position comes from `ctx.slideAt(offset)` → `{ index, class, band }`, replacing `slideClassSpans`/`slideClassAt`/`slideIndexAt`/`resolveDiagramBand`. `matchMermaidFences` moves into Mermaid (§2a). |
| `slots` | avatars, checks, code, icons, pills, sparks, video | **manifest + hook** | An inline kind declares its `slot`; the host compiles it and passes parsed fields. A kind that post-processes keeps a `resolve(fields, raw, ctx)` hook: pills re-reads with an icon-only slot and checks for a quoted label (`pills.inline.js:122-178`). checks' `[x]` is a `shortcut` kind, which has no slot. The slot compiler (`segno-spec`, `segno-spec-core`) moves into `@laticent/segno`; the catalog `segno-slots.js` reads component manifests (`segno-slots.generated.js`), so it stays in the engine. |
| `checks` | checks | **`ctx`** | The status vocabulary (`STATUSES`, `MARKERS`, `stateClassesFor`) is the engine's: the shared kernel reads it (`lib/integrations/markdown-it/plugins.js:29`, HARD RULE #1), as do `lib/runtime/index.js:261`, `label-set-key.js:45`, `status-marks.js:21`, `chart-status.js:24` and `list-text-grammar.js:58`. It stays in `lib/core/checks-registry.js` and reaches the checks plugin as frozen data, `ctx.vocabulary.checks`. Status marks keep working with the plugin off. Drawing a state stays the plugin's. |
| `video-migrate` | video | **video plugin** | Moves into the plugin. The linter keeps the rule that spots the old form (HARD RULE #7); the **fix driver**, which already loads outside `lint-core` through an `import()`, asks the plugin for the rewrite through a declared `fixes` hook. That adds a contribution point; it does not make a lint rule one, so plugin-system §4.3's "never a contribution point: lint rules" still holds. |
| `video` | video | **video plugin, as data** | The provider table becomes declared manifest data (`providers`, plugin-system §4.3: templates and validated-id patterns, never functions). The host owns one matcher over the declared table (§2a). |
| `code-text` | code | **split** | `splitCodeLines` joins `@laticent/markup` (extracted from `collections.js`, which also requires `overflow-probe`). `parseIndexList` becomes a Segno value type. The host parses the `@code{…}` record and the `code:` front-matter default and passes resolved options, so the plugin holds no copy of the range grammar (today `record.js:67-122` parses both). `topLevelFrontMatterValue` becomes `ctx.deck.frontMatter(key)`. |
| `highlight` | code | **split** | `spansFromHighlightHtml` moves into the code plugin, which already owns the highlighter (`code/shared/highlighter.js`). The fence walk is the engine's (§2a): `languages.needed`/`missing` (exposed as `engine.languages`, `lib/engine/index.js:191,1005`, which the Studio calls outside any render) move into the engine, and the plugin keeps `has`, `spans` and `register`. |
| `html` | chart-family | **split** | `find-matching-close`, `html-lists` and `section-walk` join `@laticent/markup`. `coda` (requires `below-note` and the coda catalog, `coda.js:66-69`) and `prose-code` (the engine's `data-prose` attribute, `prose-code.js:37`) stay in the engine. `setRenderSection` writes host ids, so it becomes `ctx.section.mark(…)`. |
| `charts` | chart-family | **engine (proposed, §7)** | chart-family is the chart bucket's dispatcher: its registry imports 28 component transforms, the inverse of plugin-system §4.1 ("components depend on plugins; plugins never name components"). Recommended: reclassify it as engine code, which removes the gate's by-name exception instead of keeping it. |

### 2a. Audit: helpers the engine also uses

The owner's test: **a helper is shared only if it has utility beyond the plugin.** Each engine call site was
read and asked whether it does the engine's own work or plugin work that leaked into the engine. A leak goes
back to the plugin through data, a service or a hook; it is not a reason to share. Counted by symbol, tests
excluded, on `cf61608`: 9 engine files use the code, highlight and video helpers, and 3 use the Mermaid
matcher.

| Helper | Engine call site | Whose work | Where it goes |
|---|---|---|---|
| Video provider table | `video.transform.js:60-66` re-validates the figure's URL before drawing a QR ("never trusted as written") | The host's: it is a security check | The host keeps the check, over the plugin's **declared** table. A stamped attribute is not trusted: the red team showed a forged figure would otherwise get a QR labeled "watch on YouTube" that encodes an attacker's URL |
| | `docs/src/playground/video-overlay.js` builds the embed | The host's: the player is parent-hosted by design (the slide sanitizer strips iframes, and iOS mishandles nested scaled iframes) | Stays host-side; reads the declared table |
| | `tools/fetch-video-oembed.js` | The video plugin's maintenance tool | Moves into the plugin's folder |
| Old-video-form fix | `lint-core.js` | Split: spotting the form is a lint rule; writing `@video{…}` is the plugin's syntax | The rule stays (#7); the fix driver calls the plugin's `fixes` hook |
| Mermaid fence matcher | `lib/packages/gallery-gate.js:63`, the Studio's `gallery-gate.ts` (remote links in a gallery's diagrams, a HARD RULE #22 check) | Mermaid's | A Mermaid service, and **the gate fails closed** when the service is missing: the red team showed a null service turns 3 findings into 0 and admits the gallery. The bake and the gate use the same matcher |
| | `lib/core/chart-narration.js` narrates a diagram | Mermaid's | The same service; with Mermaid off the fence renders as code and there is nothing to narrate |
| Fence walk (`scanFences`, `normalizeInfo`) | the linter, the Studio's fence catalog, off-fences and code commands, the preview's grammar loading | **The engine's**: CommonMark fences are markdown | Stays in the engine |
| `shellFenceFindings` | the linter | A lint rule | Stays in `lint-core` (#7) |
| `splitCodeLines` | the `build` and `focus` transformers | **The engine's**: section transforms are engine-owned (plugin-system §4.3) | `@laticent/markup` |
| `parseIndexList` | `focus.js` (`_focus: 3-5 9`), `lint-core.js:258` | **The engine's**, and all three readers must agree | A Segno value type; the host parses for the code plugin |

**Result: no package beyond the three in §5.**

**The rule that sorts a member** (apply it to anything not listed):

1. Is the **logic** the host's: the deck, the surface, the install, other plugins, or trust? **`ctx`** or a
   host service. A palette or a deck as *input* does not make plugin logic the host's (that is why
   `diagram-theme` goes to Mermaid).
2. Is it a value a host tool needs without running the plugin? **Manifest.**
3. Otherwise it is pure. It stays in the plugin, unless an engine caller does the engine's own work with it;
   then it goes in a `@laticent/*` package named for its job.

## 3. The reverse direction: emptying `hostApi`

`followups.d/2630-p2-host-tools-read-plugins-as-data.md` (on #2997's branch) sorts the ~60 members into
manifest data, generic slot-driven host code and sandboxed calls; this note adopts it, with three guards the
trio added:

- **A golden first.** Snapshot every lint finding, fix and editor result over the galleries and fixtures
  before any member moves. Any change is shipped behavior and stops for the owner.
- **Synchronous where it must be.** `lint-core` is synchronous and on the `lintCoreGz` budget. Vocabularies
  reach it as the data projection plugin-system §4.3 already prescribes; anything that needs a sandboxed call
  (async) runs in the fix driver or the editor, never in `lintTextWith`.
- **No manifest DSL.** A behavior the manifest cannot express without growing a mini-language is a
  plugin hook (`resolve`, `fixes`), not new schema.

## 4. The contract

**Shape rules for every point:**

- `ctx` is frozen. Per-render members (`deck.*`, `data()`, `slideAt`) are getters that read the current
  render, because `ctx` is built once per memoized parser (`host.js:96`) and a captured value would go stale
  (the bug recorded at `lib/engine/index.js:634-640`).
- `ctx` never carries a live host object. A syntax rule gets a host facade over markdown-it's `state` with no
  `.md` and no `.env`, and the host refuses a pushed token whose type the manifest does not declare (no
  `html_*`). Renderers get the token's content and attributes, not `tokens`, `idx` or `self`. The red team
  showed the old shape lets a rule inject `<img onerror>` past any fragment sanitizer and hijack the
  memoized parser's `code_inline` renderer across renders.
- Each member is either **serializable** (data, or a function the host can proxy) or **in-process only**.
  A sandboxed plugin (a frame, the locked page, QuickJS) receives the serializable part as data; the draw
  frame's `env` on `main` (`lib`, `box`, `faces`, `px`, `token`, `hydrate`) is that projection.
- Hydrate writes markup only by returning it or through `ctx.drawInto`. It still receives its own live
  element in process; the sandboxed live previews (threat model decision 15, not yet built) remove that reach.
- A hydrate is serialized with `toString()` for the plain `.html` export (`hydrate-script.js:46`), so it is
  **dependency-free**: owned dependencies are for render, bake and service code.

| Point | Keeps from today | Adds | Drops | Serializable? |
|---|---|---|---|---|
| every point | `name`, `options` | `report(id, detail)`, `service(plugin, name)`, `data()`, `dataPending()`, `vocabulary.*` | | yes (`service` proxied) |
| `syntax` | | a `state` facade, declared token types only | raw `state` | in-process |
| `fences`, `code` | `family`, `escape`, `escapeAttr`, `encodeConfig`, `hydrateAttrs` | `deck.frontMatter(key)`, `section.mark(…)`, resolved record options | `env`, `tokens`, `idx`, `self` | yes |
| `inline` | | parsed `fields`, `resolve(fields, raw, ctx)` for kinds that post-process | the plugin compiling its own slot | yes |
| `services` | | the **owning** plugin's `ctx`, bound by the host | | yes |
| `bake` | `BAKE_SERVICES` (all ten), `paneOrientations`, `state.rebake` | `slideAt(offset)`, `fonts`, `media`, `payload(key)`, `vendor(lib, key)` | | in-process (whole-deck, runs in the host's confined page) |
| `hydrate` | `lib`, `draw`, `drawInto`, `decodeConfig`, `token`, `settle` | `payload(key)` | | yes |
| `pass` | `ownScript`, `fences` | | `host()`; `win` becomes the frame's own window only | in-process |
| `draw-*` | the draw frame's `env` | | | yes (it is the projection) |
| `extensionPoints` | unchanged until chart-family is settled (§7) | | | |

**Versions.** The zip and door contract that third-party plugins use today (`render.js` receives
`{type, kind, text, record, fields, id}`; `plugin.schema.json:18-21` pins `api: 1`; the scaffold
`lib/packages/new-plugin.js:52` writes it) stays `api: 1`, unchanged, so approved zip plugins in users'
libraries keep working. The in-tree role-module contract above is `api: 2`. The host accepts both, each with
its own contract (`KNOWN_API` in `resolve.js:70` becomes `[1, 2]`), and every in-tree plugin switches in the
same PR, so the tree never mixes them. **Only the render and data parts of `api: 2` are public**, since those
are what the npm door admits; the bake, hydrate, pass and draw context stays internal until the door admits
those points, so it can change without an `api: 3`. A public member needs two users.

## 5. The packages

| Package | Holds | Depends on | Published |
|---|---|---|---|
| `@laticent/plugin-api` | The contract: types for each point's `ctx`, the manifest schema, the `api` versions | nothing | yes, when the PR lands (§7 Q3) |
| `@laticent/markup` | Balanced-HTML string walking: matching close tags, lists, `<section>`s, splitting highlighted code into balanced lines | nothing (module splits listed in §2) | yes |
| `@laticent/segno` | Already a package: author syntax. Gains the slot spec compiler and the line-range value type, versioned with `api` | nothing new | yes |
| `@laticent/plugin-test` | The fixtures harness, running the **real** host so it cannot drift into a fake one | the engine | dev-only, private |
| `@laticent/plugin-<name>` | One plugin: role files, its own helpers, data, vendored libraries | `plugin-api`, `markup`/`segno` if used, third-party libraries; **never another plugin** | **private now**; published as the npm door's bundle (`lattice-plugin.js`, threat model decision 8) once that plugin can build one, pure render plugins such as pills first |
| the engine (`@laticent/lattice`) | The host: builds `ctx`, owns walls, sanitizers, data loaders and the catalogs | `plugin-api`, `markup`, `segno`, the plugins it ships | as today |

- **Why private now.** The npm door the owner already decided on downloads one self-contained file per plugin
  and never runs `npm install` (decision 8); in v1 it admits no bake or hydrate (decisions 3 and 4). A
  published source package would have no loader. The private `package.json` still does the work that matters
  today: it declares what the plugin may import, and the structure gate holds it to that.
- **Versioning.** In-tree plugins carry no separate version (plugin-system §4.5); a plugin's `package.json`
  mirrors the engine's version and moves in lockstep. Independent versions wait for the first plugin that
  ships outside the engine's release.
- **Layout.** Plugins stay in `lib/plugins/<name>/`. Shared packages go in a top-level `packages/`, with
  **every** workspace library `lib/` imports (on `main`: segno, cadenza, calco, fluido, mosaico, squadra,
  trama, ltt), not segno alone, because the reason (the engine must not import from `docs/`) applies to all
  of them. Whether nested private `package.json` files under `lib/` change what the root tarball ships is
  checked with `npm pack` in the PR.
- **What a published package carries.** `LICENSE-EXCEPTIONS` (the output exception) ships in each, and a
  published bundle's vendored hashes are verified when the host loads it, not only at the repo's build.

## 6. Delivery: one complete PR

The owner's rule: nothing ships broken, no transitional debt. So the redesign lands as **one PR** (HARD RULE
#17: one feature, one branch, increments in place), one commit per item, each commit green, merged only
when all of it holds:

1. `ctx` extended additively (§4), with the facade and getter rules.
2. Host-owned trust: output kinds and profiles, fail-closed strict checks, the KaTeX wall kept in
   `lib/core/`, the bake confinement from the existing kernel.
3. Each plugin switched to `ctx` and its manifest, one commit per plugin; the kit never exists on `main`.
4. The lint and editor golden, then `hostApi` emptied (§3).
5. The packages (§5) and the module splits.
6. The structure gate from #2997: layering, the site's untangling, and a plugin rule of "own folder plus the
   packages its `package.json` declares", with no plugin exception and a text backstop for any `require(`
   or `import` in a plugin folder that resolves outside it (the ternary that hid `mermaid.bake.js:442`).

**Merge bar:** every deck in `examples/` and the baseline decks exported byte-identical (PDF, PPTX, HTML,
`--player`); the lint JSON over every gallery byte-identical; the route budget measured; `npm run bench`
before and after. Any byte change stops for the owner's export sign-off.

**What this costs, said plainly.** While #2997 sat unmerged, imports into plugin folders grew from 8 to 49
(#2997's own table). Holding it again lets drift continue until this PR lands, and this PR is large. The
owner accepted that over landing the kit as debt. Rebase on conflict only (#16).

## 7. Open questions for the owner

1. **Who builds it.** #2997's layering and site work, and its gate, belong to the session that pushed it
   (HARD RULE #31). Either that session builds this PR on its branch's work, or the owner says it is finished
   and a new branch from `main` takes it over.
2. **chart-family.** Reclassify it as engine code (recommended: its registry imports 28 component transforms,
   so it is the bucket's dispatcher, not a capability), or keep it a plugin with a named exception. Either
   way plugin-system §5 changes, which is the owner's call.
3. **Publishing.** Publishing `plugin-api`, `markup` and `segno` adds packages to the release workflow
   (`release-publish.yml` runs one `npm publish` today, and the multi-package versioner is still an open pick
   in `2026-10-07-first-npm-release.md` §8). That CI change comes back for a decision when the PR is ready.

## 8. Adversarial review (HARD RULE #25), 2026-11-01

Run on this note at `9ea3f68`: red team, Munger inversion and an independent checker, in parallel. Every
finding is either folded in above or listed in §7.

| Finding | From | Disposition |
|---|---|---|
| `ctx` and hook arguments leak live host objects (`state`, `state.md`, `env`, `tokens`/`self`); demonstrated injection and cross-render hijack | red team | §4 shape rules |
| A per-call host sanitizer empties Mermaid, breaks paired tokens, changes every export's bytes; a plugin-named profile is a back door | all three | §2 `sanitize` row: host profiles by output kind, narrow-only, token-balanced, byte-identical bar |
| KaTeX strict check falls back to a weaker sanitizer | red team | fixed in the PR (#18, on path) |
| The note ignored the sandbox work and draw frame on `main` | checker | §1 table and the `sandbox` row |
| `ctx.theme.diagram` reversed phase D and LPM §4.5 | checker | `diagram-theme` goes to Mermaid; rule 1 tightened |
| §4 incomplete: missing `pass`, `draw`, `inline`, `services`, `syntax`, existing bake and hydrate members, wrong rows for `theme` and `media` | checker, red team | §4 table |
| §2 built from a kit grep; missed checks → pills and `mermaid.bake.js:442` | red team | §2 inventory; gate text backstop |
| Gallery gate fails open behind a nullable service | red team | fails closed (§2a) |
| Stamped video provider drops the URL re-validation; overlay cannot be a hydrate | red team, checker | host keeps both (§2a) |
| `@laticent/markup` not pure (`coda`, `prose-code`) | red team, checker | excluded (§2) |
| Line-range grammar still parsed twice | red team | host parses the record and the default (§2) |
| checks vocabulary missed by the audit | checker | `ctx.vocabulary.checks` (§2) |
| `fenceLanguages` as deck state cannot serve `engine.languages` | checker | `needed`/`missing` move into the engine (§2) |
| Bake must stay whole-deck | checker | `slideAt(offset)` (§2, §4) |
| `api: 2` would break zip plugins | checker, red team | `api: 1` kept for the door (§4) |
| Fixtures harness cannot depend on nothing | checker, red team | `@laticent/plugin-test` (§5) |
| Per-plugin npm packages have no loader; ~20 packages strain releases | inversion, red team | private now, door bundle later (owner, §5) |
| Steps did not stand alone on `main` | red team, inversion | one complete PR (owner, §6) |
| Land #2997 first with ratcheted ceilings | inversion | declined by the owner: no transitional debt (§6 states the cost) |
| Lint parity, sync `lint-core`, manifest DSL risk | inversion | §3 guards |
| Single-user bake members make `ctx` a god object | inversion | bake context internal; public members need two users (§4) |
| Segno-only move inconsistent | checker | every engine-used workspace library moves (§5) |
| Path-taking `payloadPath` allows traversal | red team | keyed (§2) |
| Services had no `ctx` | red team, checker | host binds the owner's `ctx` (§2, §4) |
| Hydrate `toString()` loses module scope | red team | hydrates are dependency-free (§4) |
| License exception and load-time integrity for published packages | red team | §5 |

## References

- `engineering/decisions/2026-09-27-plugin-system.md` §4.1, §4.3, §4.5, §4.6, §4.12, §5, §7
- `engineering/decisions/2026-10-16-npm-plugin-threat-model.md` §4, §5.5, §6 (decisions 3, 4, 8, 11, 14–17), §6.1
- `engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md`
- `engineering/decisions/2026-08-18-post-sanitize-injection-queue.md`, `2026-08-17-theme-css-is-a-preview-sink.md` (HARD RULE #22)
- `engineering/decisions/2026-10-07-first-npm-release.md` §8
- `spec/LPM.md` §4.3, §4.5
- `followups.d/2749-p3-migrate-in-tree-plugins-to-sandbox-model.md`, `2800-p3-mermaid-bake-one-browser.md`
- On #2997's branch only: `engineering/decisions/2026-10-11-codebase-structure.md` §5,
  `followups.d/2630-p1-plugin-api-ctx-or-kit.md` (settled by this note) and
  `followups.d/2630-p2-host-tools-read-plugins-as-data.md` (adopted with §3's guards)
- PR #2997 (`claude/codebase-structure-v2`, `cf61608`), superseding PR #2630
