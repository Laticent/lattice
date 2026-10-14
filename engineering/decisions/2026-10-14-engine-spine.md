---
status: shipped
summary: >
  The Studio's JavaScript is measured and cut. The route budget now counts the engine and the
  preview runtime, which had grown unwatched. The engine bundles one markdown-it instead of two.
  The Studio loads its lint core after first paint, through one door that keeps the lint parser
  on the deck's plugin admission. The docs site loads the engine as ES modules whose chart kernels
  arrive on demand, above the synchronous render, the way KaTeX does. Studio startup JS: 668KB to
  493KB gz; engine plus runtime: 912KB to 691KB gz. The proposed shared lint/engine build was cut
  after review: it would merge module state between them for a 56-80KB post-paint saving.
---

# The engine spine — what the Studio loads, and when

Asked on 2026-10-14: the Studio "is getting fairly big", is it, and what can we do. This note
records what we measured, what the adversarial review changed, and what shipped. The PR that
carries it lists one commit per item.

## 1. What we measured (main `82c7247`, gzip level 6)

| Piece | Realm | gz | raw |
|---|---|---:|---:|
| Studio island JS (126 chunks) | page | 668KB | 1.89MB |
| of which the lint core (`authoring-core.generated`) | page | 176KB | 521KB |
| Engine `lattice-playground.js` | page | 551KB | 1.58MB |
| Runtime `lattice-runtime.js` | each preview iframe | 383KB | 1.10MB |

- The route budget counted only `/_astro/`. The engine and runtime load from
  `/playground/v/<hash>/`, so nothing watched them, and the runtime had grown from 163KB gz (the
  2026-08-17 loading audit) to 383KB.
- The engine bundled markdown-it twice: `lib/engine` `require`s it and
  `lib/core/boundary-parser.mjs` `import`s it, and the package's `exports` map sends those to
  different builds, each with its own copy of `entities`.
- Chart kernels were 178KB gz of the engine, 61KB of it map basemaps, and a deck uses a few.
- The engine and the runtime share 243 modules, but they run in DIFFERENT windows (the page and a
  `srcdoc` iframe), so each parses its own copy however the files are cut. Not a target.

## 2. What already ruled on this area

- **2026-07-19 §3, front 1b (chart lazy-split): CUT.** It put `import()` inside the registry,
  which the CLI and export read synchronously. Front 3 (a lean preview runtime): CUT.
- **2026-07-11 B⑤ (basemaps out of the runtime): REVERTED.** The runtime is the only map
  renderer in Export-to-Marp decks.

What shipped here touches neither the registry's Node path nor the runtime.

## 3. The proposal, and what the adversarial review changed

The first design (the owner picked it): one esbuild ESM build whose entries are the engine, the
lint core and each chart kernel, so modules they share land in shared chunks. Red team,
inversion and an independent checker reviewed it against the real code. What they found:

| Finding | Who | What changed |
|---|---|---|
| A missing kernel does not draw bullets: `KERNELS[layout].transformSection` on undefined throws out of the WHOLE render. The 2026-07-19 record assumed bullets too. | red team (reproduced) | The dispatcher skips a missing kernel and records it; the host loads it and renders once more. |
| `import()` leaves no `<script data-lattice-engine>`, and the KaTeX, grammar and plugin-data loaders found their directory through that tag. All three would have skipped silently: math as source text, grey fences, no icons. | red team, checker | `engine-base.ts` records the engine's directory; every loader asks it. |
| Each deploy deletes the old hash directory, so a long-lived tab that first meets a chart type after a deploy gets a 404, and a failed `import()` cannot be retried. | all three | A failed kernel load throws a `ChunkLoadError`, which the hosts already show as "part of the app didn't load" with a reload offer. Never a list. |
| A shared lint/engine chunk merges module state: `setBoundaryPluginsOff` would also switch the engine's parser, used by Marp bakes and section splits. | all three (red team built it) | Cut. See §5. |
| The lint win is 56-80KB gz after first paint, not "59% of 176KB". Splitting out the charts moves the shared modules too. | inversion (measured) | The owner chose to defer lint now and leave the shared build for later. |
| Speaker notes read lint synchronously while rendering, and an earlier checker rejected "apply the plugin setting on load". | checker, red team | The lint door applies it AS the lint core evaluates, before any caller gets the module. |
| 14 e2e `page.route('**/lattice-playground.js')` holds would match nothing and stay green. | red team, checker | One `ENGINE_GLOB`, built from the same constant the pages use. |
| The asset hash covers only enrolled files; seven pages spelled the engine URL by hand. | red team, checker | `esm/` is staged and hashed whole; pages name the engine through `engineAsset()`. |
| The ESM module graph is five levels deep: five round trips on a cold load. | inversion | `esm/chunks.json` lists each entry's static chunks; the host preloads them at once. |
| Content-hashed chunk names never repeat, so the service worker's same-suffix eviction can never reach an old one. | inversion, checker | A fresh `esm/` file evicts older-deploy `esm/chunk-*` entries. |

What held under attack: the class scan. The red team rendered all 613 tracked decks that set a
class and compared the charts dispatch ran against the scan, with no misses; no class reaches a
section without being written in a directive comment.

## 4. What shipped (one commit each)

1. **`engineJsGz` in the route budget.** Counts the engine and runtime boot entries a route names,
   plus their static imports. Lazy providers are not counted, for the reason `import()` is not.
2. **One markdown-it.** `oneMarkdownItPlugin` resolves every bare `markdown-it` to the CJS build.
3. **The lint door (§5).**
4. **The ESM engine.** `tools/build-playground.js` writes `docs/public/playground/esm/`:
   `engine.js` with an empty kernel table, `chart-<layout>.js` per kernel, shared `chunk-*.js`,
   and `chunks.json`. The single-file IIFE is unchanged and still carries every kernel; the docs
   site no longer stages it.
5. **The docs site on the ESM engine.** `ensureEngine` imports it; `ensureCharts` loads the kernels
   a deck's directive comments name, above the render in `renderMarkdown`.

## 5. Lint after first paint

`docs/src/playground/authoring-door.js` is the only importer of the lint core (a test enforces it).
It evaluates after the lint core and before any importer's body, and it switches the lint core's
boundary parser to the plugin set `lint-boundary-state.js` holds. So no reader, static or dynamic,
sees the lint core on a stale grammar. `plugin-admission.ts` writes that state instead of importing
the lint core; `architect.ts` loads the canon on demand before every model call. The lint core and
the door are on `inject-modulepreload.mjs`'s `lazyOnlySuffixes`, so the build fails if either
returns to startup. Speaker notes, pane pages and print keep their static import of the door,
because those modules already load lazily.

## 6. Measured, before and after

Same build script, same sandbox; gzip level 6. `before` is `main` `82c7247`.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Studio startup JS (`eagerJsGz`) | 667.6KB | 493.0KB | −174.6KB |
| Studio startup JS, raw (parse before first paint) | 1.89MB | lint core's 521KB fewer | |
| Engine + runtime, app routes (`engineJsGz`) | 912.3KB | 691.1KB | −221.2KB |
| Engine alone, gz (getting-started's `engineJsGz`) | 551KB | 324.5KB | −226.5KB |
| Engine alone, raw (parsed on every launch) | 1.58MB | 931KB (`engine.js` + 12 chunks) | −649KB |
| A chart's kernel, beyond the engine, gz | in the engine | 0.8KB (timeline-list) to 77.7KB (map); hub-spoke 39.8KB | on demand |

The route budget was ratcheted to the "after" column in the same PR
(`docs/route-budget.history.md`). The loaders add 457B to 1.2KB gz to the site shell of the four
other routes; `docs/route-budget.d/engine-spine.md` declares it.
Equivalence: all 276 example and baseline decks render byte-identical HTML, preview splits and
Marp bakes through the old IIFE, the ESM engine with every kernel, and the ESM engine loading
kernels on demand. On the real built Studio, first paint lands before the lint core is requested,
and `e2e/engine-on-demand.spec.ts` drives a chart, math, an icon, an exotic fence and a kernel 404.
Breaking `engineBase()` on purpose fails two of its three tests.

## 7. What this does not do

- **A shared lint/engine build.** Cut in review (§3). Tracked in `followups.d/`.
- **The runtime.** Unchanged, by the 2026-07-11 and 2026-07-19 records. It is now budgeted.
- **A budget on lazy code.** `engineJsGz` does not follow `import()`, so a chart kernel or the
  lint core can grow without the gate seeing it. Tracked in `followups.d/`.
- **The 36 bundled highlight.js grammars.** Kept, per 2026-08-25; the owner declined moving them
  on demand (−44KB gz) for the fetch it would add to most code decks.
