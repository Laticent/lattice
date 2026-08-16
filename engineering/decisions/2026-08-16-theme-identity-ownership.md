---
status: shipped
summary: >
  A palette's name lived in three places — the manifest's `name`, the filename, and the
  `@theme` directive — and NOTHING bound them: `checkThemeRoles` keys by filename and never
  read the directive, so `themes/foo.css` declaring `@theme bar` would pass every gate and
  register under a name nobody expects. Worse, the engine SEARCHED for identity it was
  already being handed: every one of the eight in-repo registration sites holds the name and
  discarded it, leaving `ThemeStore.add` to regex it back out of a 1.5 MB sheet —
  `theme-fetch.ts` used `name` and threw it away on the same line. The manifest now OWNS the
  name; the filename and `@theme` are machine-verified projections of it. `add(name, css)`
  takes identity as an argument, the legacy `add(css)` survives for the published API with
  its scan bounded to the file header, and a nameless registration throws instead of
  returning a `false` nobody checked. `@theme` stays in source CSS — unlike `@size` — because
  `@workwel/lattice/themes/<name>.css` is a published export README.md documents as a Marp
  theme file, and Marp throws without it.
---

# The manifest owns a theme's name; the directive and filename are projections

**Date:** 2026-08-16
**Status:** shipped
**Follows:** `2026-08-16-size-registry-ownership.md` — the same question ("what metadata
should CSS carry?") asked about identity rather than geometry, and answered differently.

---

## 1. The question, and why it does not answer like `@size`

Having moved `@size` out of theme CSS, the obvious next move is to do the same to `@theme`:
name the file and be done. The instinct is right about the disease and wrong about this
particular cure, and the difference is worth stating precisely, because it is the general
rule this pair of decisions establishes.

**`@size` was a VALUE the engine owns.** A page box, derivable, needed by nobody who has the
engine. It had no business in a stylesheet.

**`@theme` is IDENTITY, and identity travels with content.** Two hard constraints:

- **`@workwel/lattice/themes/<name>.css` is a published package export**, and `README.md`
  documents it as *"a Marp theme file"*. Marpit **throws** without the directive. A missing
  `@size` merely degraded a deck to the default box; a missing `@theme` is a hard failure in
  a documented, working integration.
- **`themes/indaco-dark.css` is literally `@import 'indaco'; :root{…}`** — CSS referencing
  another theme BY NAME (`THEME_NAME_IMPORT_RE`). Strip the directive from source and that
  import points at a name appearing nowhere in the source tree.

So the directive stays. That is not the end of the problem.

## 2. The actual defect: identity is searched for, not given

`ThemeStore.add(cssText)` took CSS and recovered the name with a regex. Every caller already
had the name:

| Site | The name it holds |
|---|---|
| `docs/src/lib/theme-fetch.ts:125,134` | the literal `'lattice'` it just fetched |
| `docs/src/lib/theme-fetch.ts:157,171` | `name` — the parameter of the enclosing `register(name)` |
| `docs/src/components/studio/share-export.ts:63` | `extra.name` (`ExtraTheme = { name, css }`), returned on the next line |
| `docs/src/lib/single-slide-render.ts:800` | `extra.name`, used eight lines later |
| `lattice-emulator.js:1605` | `paletteName` — `palettePath` is `themes/${paletteName}.css` |
| `tools/emulator-engine-parity.mjs:47` | the `palette` variable |

`theme-fetch.ts:157` is the whole argument in one line:

```js
if (!PG.hasTheme(name)) PG.addThemes([css]);
```

The name is used and discarded in the same statement, so that `add` can go find it again in
a 1.5 MB string.

**This is not a performance fix, and must not be sold as one.** Measured: the happy-path
`THEME_RE.exec` costs **0.150 µs** on the base sheet and **0.074 µs** on a palette — five
orders of magnitude below the ~26–104 ms `composeCss` the store's memo exists to avoid.

What the search actually cost was **correctness**, in two ways:

- **An unbounded scan on the failure path.** A sheet with no directive scanned the entire
  buffer before giving up — hundreds of µs to ~1 ms depending on content (183.6 µs over a
  synthetic 1.5 MB sheet; 884 µs forcing a full traversal of `dist/lattice.css`).
- **A silent no-op.** It then returned `false`, which **no caller checks**. The theme
  vanished and the deck rendered scaffold-only with no signal.

## 3. Three names, nothing binding them

The name existed as the manifest's `name` field, the filename, and the directive.
`checkThemeRoles` (`tools/check-ownership.js`) keys by filename and **never reads `@theme`
at all**. All 32 palettes agreed — by discipline, not by machine — while
`design/skills/theme.md` already told authors the directive "MUST match the filename," a
promise nothing kept.

## 4. The model

- **The manifest OWNS the name.** It is already the single declaration of which palettes
  exist (`tools/build-theme-catalog.js` reads it for the picker, roles, swatches).
- **The filename and `@theme` are PROJECTIONS**, bound by a gate. Same shape as the size
  registry: one owner, verified projections — the difference is only that one projection
  lives in a source file, because that source file is itself a published artifact.
- **Identity is passed, never searched.** `add(name, css)`.

## 5. What shipped

1. **`ThemeStore.add(name, css)`** — the contract. `add(css)` remains for external consumers
   (`./engine` is a published export; `window.LatticePlayground.addThemes` is documented
   API), with its scan **bounded to the first 4 KB** — the directive is a header comment by
   construction, so the bound costs nothing real and removes the unbounded miss. A nameless
   two-argument call **throws**; the legacy form keeps its `false` return, which external
   callers may rely on.
2. **`addThemes([{ name, css } | cssText])`** on both the engine and playground facades —
   additive, so no version break.
3. **All eight in-repo sites migrated**, except one that legitimately cannot know the name:
   `lattice-emulator.js`'s layout-CSS slot, where `--css` lets a caller substitute their own
   engine stylesheet whose identity is genuinely whatever it declares. That is sanctioned
   with its reason, and the gate fails on a **stale** sanction so the list cannot rot.
4. **`checkThemeIdentity`** — filename ≡ manifest `name` ≡ `@theme`, for every palette, plus
   `lib/_theme.css` declaring `@theme lattice` (the name all 32 palettes `@import`).
5. **`checkThemeRegistrationCallSites`** — new bare-CSS callers are rejected. It scrubs JS
   comments and string literals before scanning, because three docblocks in this repo quote
   `addThemes([cssText])` while explaining the legacy form, **including this gate's own error
   message**; without the scrub the gate fired on the documentation telling you how to
   satisfy it.
6. **`test/unit/engine/theme-identity.test.js`** — the contract, both shapes, the throw, the
   scan bound, and the three-way binding asserted in the fast suite as well as the gate.

### Two bugs found by the new tests

- **An explicit `null` name fell through to the content scan.** The first implementation
  branched on `name === null`, which conflated "one argument was passed" with "the caller
  passed a broken name". `add(null, css)` silently regexed the sheet instead of throwing.
  Now the branch keys on the *form* (`cssText === undefined`).
- The gate's own false-positive on comments (item 5) surfaced the same way.

## 6. Verification

- `npm test` — 6145 pass, 0 fail. `npm run lint` clean. `npm run build:check` OK.
- **528 renders byte-identical** — the 132-deck corpus at four canvases, `html` + `css`
  hashed against `origin/main`. This change is behavior-preserving by construction.
- **Real artifact**: a `size: story` deck rendered through `lattice-emulator.js` (the
  migrated call site) still produces `MediaBox [0 0 810 1440]`.
- **Both gates confirmed to fire**, five failure modes: a directive disagreeing with the
  filename, a manifest `name` disagreeing with the filename, `lib/_theme.css` renamed, a new
  bare-CSS call site, and a stale sanction.
- Measurements above are from this machine, `node --test` conditions, and are quoted to make
  the *non*-claim explicit: the win here is correctness, not speed.

## 7. The rule this pair establishes

> Metadata belongs in a stylesheet when a consumer must read it **without running the
> engine** — and identity is the only thing that qualifies today. A value the engine owns
> (geometry) does not. And identity a caller already holds is **passed, never searched for**:
> searching costs an unbounded miss and a silent failure, and buys nothing.
