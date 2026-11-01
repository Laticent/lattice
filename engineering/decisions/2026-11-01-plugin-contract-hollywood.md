---
status: proposed
summary: >
  The plugin contract follows the Hollywood principle: the host calls a plugin and hands it what it needs;
  the plugin never reaches into the engine, and the host never reaches into the plugin. Three channels
  carry everything a plugin touches: `ctx` (host state and capabilities), the manifest (contract data the
  host reads), and the plugin's own versioned dependencies (pure helpers it owns). Replaces #2997's
  `lib/plugin-kit/` and empties `hostApi`. Settles `followups.d/2630-p1-plugin-api-ctx-or-kit.md` for `ctx`.
  Every plugin becomes its own npm package (`@laticent/plugin-<name>`); the contract is `@laticent/plugin-api`;
  shared helpers are packages named for their job (`@laticent/markup`, `@laticent/segno`), not a plugin grab-bag.
---

# The plugin contract is Hollywood: the host calls, the plugin owns its dependencies (2026-11-01)

**Answer.** A plugin is called; it does not call in. Everything a plugin's code touches arrives through one
of three channels, and each channel has one job:

| Channel | Carries | Who owns it | Example |
|---|---|---|---|
| **`ctx`** | Host state and host capabilities: anything that depends on the deck, the surface, the theme or the trust boundary | The host builds it per call | `ctx.slide.class`, `ctx.theme.diagram()`, `ctx.data()`, `ctx.service('icons','drawHtml')`, `ctx.payloadUrl('katex.css')` |
| **Manifest** | Contract data: vocabularies, slots, specs, constants a host tool reads without running plugin code | The plugin declares it; the host reads it | pill `SHAPES`, the `checks` spec, an inline kind's `slot` |
| **Owned dependencies** | Pure, stateless helpers: same input, same output, no host knowledge | The plugin, through a versioned `@laticent/*` package it declares, or its own code | HTML list parsing (`@laticent/markup`), code-line splitting and video provider ids (inside the code and video plugins) |

Two directions, both closed:

1. **Plugin → engine.** A plugin's code imports only its own folder and the packages it declares. It never
   imports `lib/core`, `lib/engine` or a kit that re-exports them.
2. **Engine → plugin.** Host code never imports a plugin's file. It reads the manifest, calls a hook the
   manifest declares, or reads a generated table. `hostApi` goes away.

The owner chose this on 2026-11-01 ("plugins get called with what they need and they should own their
dependencies; our API for plugins can pass in context, so the plugin contract should define the
interchange"), and in the same round chose to **hold #2997 for this redesign** and to have pure helpers
become **owned dependencies**, not `ctx` members. A second round the same day settled the packages (§5): each
plugin is its own npm package, the contract is a contract-only `@laticent/plugin-api`, and shared helpers are
packages named for what they do.

## 1. Why, and what was wrong with the kit

`2026-09-27-plugin-system.md` §4.6 already says "a plugin's code reaches the engine only through `ctx`",
and `lib/plugins/host.js:5` repeats it. #2997 (superseding #2630) added `lib/plugin-kit/`: 17 modules,
each a thin re-export of `lib/core` internals, that plugins `require` by relative path. The structure gate
then admitted "own folder + kit". That made the boundary checkable, which was the real win, but it put the
dependency arrow the wrong way:

- **The plugin pulls.** A plugin picks which engine internals it wants, and the kit grows each time one asks.
  The kit is `lib/core`'s surface under a second name, so a core refactor is still a plugin break.
- **It cannot leave the repo.** A relative `require('../../plugin-kit/…')` resolves only inside this tree.
  Phase G (the npm door) would have to publish the kit, and the kit carries module state
  (`plugin-data.js`'s loader map, where two copies silently disagree) and a repo-layout assumption
  (`payload-path.js` reads `lib/plugins/<name>/`). The followup recorded both.
- **The trust boundary sits in the wrong place.** `mermaid/shared/render-worker.js` requires
  `plugin-kit/sandbox.js` and launches its own sandbox; `math/shared/katex-wall.js` requires
  `plugin-kit/sanitize.js` and sanitizes its own output. A plugin should not choose its own confinement or
  certify its own output. The threat model (`2026-10-16-npm-plugin-threat-model.md` §4) says a plugin
  "takes data in and returns markup out"; the host sandboxes the call and sanitizes the fragment.
- **The host also pulls.** 23 imports across 14 files (`hostApi` on 8 manifests) let the linter, inline
  editors, code formatting and the exports call first-party plugin code directly. A third-party plugin can
  never be read that way (`npm-plugin-loader.js` G5), so first-party plugins got lint, completion and
  editors that a third-party plugin cannot.

Hollywood fixes all four at once: what the plugin needs is decided by the contract, not by the plugin's
imports; the contract travels with the call, so nothing depends on the repo layout; the host owns the
sandbox and the sanitizer; and the host treats every plugin as data plus declared hooks.

## 2. The mapping: every kit module, and where it goes

From #2997's branch at `cf61608` (`git grep plugin-kit/ lib/plugins lib/components`):

| Kit module | Used by | Channel | The new shape |
|---|---|---|---|
| `sandbox` | mermaid (`render-worker.js`) | **host** | The manifest declares `exec.bake: "subprocess"` (already a contribution, plugin-system §4.3); the host launches and confines the worker. The plugin's bake receives its inputs and returns outputs. |
| `sanitize` | math (`katex-wall.js`) | **host** | The host sanitizes every returned fragment (threat model §6.1, "the returns surface"). The plugin stops sanitizing itself. If math needs a stricter pass than the host's, it declares a profile name in the manifest. |
| `plugin-data` | avatars, icons, pills | **`ctx`** | `ctx.data()` returns the plugin's own data or null while pending; `ctx.dataPending()`. The loader map moves into the host, per surface, so there is one copy. |
| `services` | pills | **`ctx`** | `ctx.service(plugin, name)` (null when that plugin is off). The manifest's `requires`/`optional` list bounds which plugins it may name. |
| `payload-path` | math, mermaid, `hydrate-script.js` | **`ctx`** | `ctx.payloadPath(rel)` / `ctx.vendorPath(lib, rel)`: the host resolves the plugin's own committed files from its install location. No repo layout in plugin code. |
| `fonts` | mermaid | **`ctx`** | `ctx.fonts.faces` and `ctx.fonts.faceCss(face)`: the deck's resolved text faces. |
| `diagram-theme` | mermaid | **`ctx`** | `ctx.theme.diagram({ look, hand })` returns the resolved look and the built theme; `ctx.token(el, name)` stays for hydrate (plugin-system §4.6). |
| `deck-walk` | mermaid | **`ctx`** | The host already walks the deck. A bake receives per-fence context (`slideIndex`, `slideClass`, `band`) instead of re-parsing slide classes and fences itself. `matchMermaidFences` is the plugin's own grammar and stays in the plugin. |
| `media` | mermaid | **`ctx`** | `ctx.media.webImagePlaceholder`: a host constant about the surface. |
| `slots` | avatars, checks, code, icons, pills, sparks, video | **manifest** | An inline kind declares its `slot` (already the data shape a third-party kind uses). The host compiles it and calls the kind with parsed fields. Plugins stop calling `compileSlot`/`coreSlot`. The slot compiler (`segno-spec`, `segno-slots`) moves into `@laticent/segno`, which already parses the spans. |
| `checks` | checks | **manifest** (+ owned dep) | The check vocabulary is data in the manifest. Drawing a state (`stateHtml`/`stateElement`) is the checks plugin's own code; other callers reach it as a service. |
| `video-migrate` | video | **owned dep** | Pure text step. Moves into the video plugin, which is its only user. |
| `video` | video | **owned dep** | `detectProvider` is pure. The provider table moves into the video plugin; per plugin-system §4.3, `providers` becomes a declared table later. |
| `code-text` | code | **owned dep** | `splitCodeLines`, `parseIndexList`: pure. Move into the code plugin. `topLevelFrontMatterValue` is deck state, so it becomes `ctx.deck.frontMatter(key)`. |
| `highlight` | code | **owned dep** | `fenceLanguages`, `spansFromHighlightHtml`: pure. Move into the code plugin. The host's highlighter also uses them; step 2 settles whether it depends on `@laticent/plugin-code` or the code plugin takes the highlighter over. |
| `html` | chart-family | **owned dep** | Pure HTML-rewriting helpers (`html-lists`, `find-matching-close`, `section-walk`, `prose-code`, `coda`). They become `@laticent/markup`, which about 28 engine files also use. `setRenderSection` writes host ids, so it becomes `ctx.section.mark(…)`. |
| `charts` | chart-family | **stays in-tree** | chart-family is the chart bucket's dispatcher and is already the one plugin excepted by name. It is the last plugin to move and is out of scope for phase G's first cut. |

**The rule that sorts a member** (apply it to anything not on the list):

1. Does its answer depend on the deck, the surface, the theme, the install location, or other plugins? **`ctx`.**
2. Is it a value a host tool must know without running the plugin (a vocabulary, a slot, a spec)? **Manifest.**
3. Otherwise it is pure. **Owned dependency.** If only the plugin uses it, it moves into the plugin. If two
   or more parts use it, it goes in a versioned `@laticent/*` package **named for its job**, never for who
   uses it (§5).

## 3. The reverse direction: emptying `hostApi`

`followups.d/2630-p2-host-tools-read-plugins-as-data.md` already sorts the ~60 members into manifest data,
generic slot-driven host code and sandboxed calls. That sort is the same three-way rule from the host's
side, so this note adopts it unchanged and makes it part of the redesign rather than a later followup.
When it is done, `hostApi` is deleted from `plugin.schema.json` and a third-party inline kind gets the same
lint, completion and editor as `pills`.

## 4. The contract, as one versioned interchange

`ctx` today reaches renderers only (`host.js`: name, options, family, escaping, `encodeConfig`,
`hydrateAttrs`). The redesign makes it **one shape per contribution point**, versioned by the manifest's
`api` (plugin-system §4.12):

- **every call:** `name`, `options`, `report(id, detail)`, `service(plugin, name)`, `data()`;
- **render / fences:** plus `env`, `family`, `escape`, `escapeAttr`, `encodeConfig`, `section`;
- **bake:** plus per-fence `slide` context, `theme`, `fonts`, `payloadPath`, `vendorPath`;
- **hydrate:** plus `token(el, name)`, `settle(el, state)`, `decodeConfig(el)`, `media`.

A plugin asks for a capability by using the contribution point that receives it; it cannot ask for more.
`spec/LPM.md` documents the shape as `api: 2`, and the host refuses an `api` it does not know (§4.12 of the plugin-system note). The
in-tree plugins move together, so no compatibility shim for `api: 1` is needed.

## 5. The packages

Every unit below is its own npm package. Each changes for one reason, and depends only on what it lists.

| Package | Holds | Depends on | Lives in |
|---|---|---|---|
| `@laticent/plugin-api` | The contract only: the `ctx` shape per contribution point (§4), the manifest schema (`plugin.schema.json`), the `api` version, and the fixtures harness a plugin author tests with | nothing | `packages/plugin-api/` |
| `@laticent/markup` | Reading and rewriting rendered HTML strings: matching close tags, walking lists and `<section>`s, marking prose code | nothing | `packages/markup/` |
| `@laticent/segno` | Already a package. Gains the slot compiler, since slots are Segno's job | nothing new | moves from `docs/src/lib/segno/` to `packages/segno/` |
| `@laticent/plugin-<name>` | One plugin: its role files, its own helpers, its data and vendored libraries | `plugin-api`, plus whichever of the above it uses, plus `requires`'d plugins | in place, `lib/plugins/<name>/` gets a `package.json` |
| the engine (`@laticent/lattice`) | The host: builds `ctx`, owns the sandbox, the sanitizer and the data loaders | `plugin-api`, `markup`, `segno`, and the plugins it ships | `lib/` |

**Why the contract package carries no helpers.** The owner first floated "an API package and a plugin-core
with utilities". The usage data argued against a utilities bag: four of the five pure helper groups on
#2997's branch have one plugin user, and the one widely shared group (HTML rewriting) is mostly used by the
engine. A `plugin-core` would make the engine depend on a "plugin" package, tie unrelated helpers to one
version, and attract whatever the next plugin needs, which is how `lib/plugin-kit/` grew to 17 modules.
Packages named for their job stay cohesive; the engine and the plugins depend on them as equals.

**What stays out of every package.** Shared state (the data loader map) and trust (the sandbox, the
sanitizer) live in the host and reach plugins through `ctx`. Two copies of a stateful package disagree, and
a plugin must not pick its own confinement.

**Layout.** npm publishes any folder with a `package.json`, so the layout serves the repo, not npm: plugins
stay where they are (no file moves, no conflict with open branches), and shared packages go in a new
top-level `packages/`. `@laticent/segno` moves there because the engine must not import from `docs/`.

## 6. What happens to #2997

#2997 does four things. Only one of them conflicts with this note:

| #2997 part | Fate |
|---|---|
| `tools/structure.js` + the `build:check` gate | **Keep.** The gate's plugin rule changes from "own folder + `lib/plugin-kit/`" to "own folder + declared package dependencies". |
| Layering `lib/` (the path map) | **Keep**, except the moves that exist only to feed the kit. |
| Untangling the docs site | **Keep.** Unrelated to plugins. |
| `lib/plugin-kit/` and `hostApi` | **Replace** with §2–§5. |

Recommended order (each a PR that stands on `main` alone, HARD RULE #17):

1. **Contract first, behind no gate:** extend `ctx` per §4 and move the host-owned capabilities (sandbox,
   sanitize, data, services, payload paths) into the host. Plugins switch over. No structure gate yet, so
   this PR is small and reviewable on its own.
2. **Packages (§5):** create `packages/plugin-api`, `packages/markup`, move `@laticent/segno` to `packages/`,
   move single-user helpers into their plugins, and give each plugin a `package.json` that lists its
   dependencies.
3. **Empty `hostApi`** (§3).
4. **Re-land #2997's structure work** on the new contract, with the gate's plugin rule as above and no kit.
   Its layering and site moves rebase mostly as-is.

Steps 1–3 shrink what #2997 must carry, which also shrinks its 46-file conflict surface with other branches.

## 7. Open questions for the owner

1. **Step 4's owner.** #2997's branch belongs to the session that pushed it (HARD RULE #31). Either that
   session re-lands it after steps 1–3, or the owner says it is finished and a new branch from `main` takes over.

## References

- `engineering/decisions/2026-09-27-plugin-system.md` §4.3, §4.6, §4.12, §7 phase G
- `engineering/decisions/2026-10-16-npm-plugin-threat-model.md` §4, §6.1
- `engineering/decisions/2026-10-11-codebase-structure.md` §5
- `followups.d/2630-p1-plugin-api-ctx-or-kit.md` (settled by this note) and `followups.d/2630-p2-host-tools-read-plugins-as-data.md` (adopted). Both exist only on #2997's branch; they land with step 4 or are deleted there.
- PR #2997 (`claude/codebase-structure-v2`), superseding PR #2630
