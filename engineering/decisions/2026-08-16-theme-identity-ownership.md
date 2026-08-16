---
status: shipped
summary: >
  A palette's name lived in three places — the manifest's `name`, the filename, and the
  `@theme` directive — and NOTHING bound them: `checkThemeRoles` keys by filename and never
  read the directive, so `themes/foo.css` declaring `@theme bar` would pass every gate and
  register under a name nobody expects. Worse, the engine SEARCHED for identity it was
  already being handed: every registration site in the gated roots holds the name and
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
3. **Every registration site in the gated roots migrated**, except the two that
   legitimately cannot pass a name: the engine's own legacy dispatch in
   `lib/engine/index.js`, and `lattice-emulator.js`'s layout-CSS slot *under the `--css`
   override only* — its default path constructs `dist/lattice.css` and now passes
   `lattice`. Both are sanctioned with their reason, and the gate fails on a **stale**
   sanction so the list cannot rot. `test/**` is deliberately out of scope (§7.7).
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

Rewritten after the adversarial trio (§7) — the first version of this section
overclaimed, and the numbers below are the ones that reproduce.

- `npm test` — **6159 pass, 0 fail**. `npm run lint` clean. `npm run build:check` OK.
  `docs/`: `npm run typecheck` clean, `npm test` 3074 pass, `npm run build` 88 pages.
- `npm run test:integration` — 711 pass, 0 fail, 7 skipped.
- **Behavior preservation, both shapes.** The corpus is rendered through EVERY palette
  in BOTH `addThemes` forms and hashed (`html` + `css`): **132 decks × 32 palettes =
  4224 renders**, run against a worktree of the base commit and against HEAD.

  | comparison | result |
  |---|---|
  | base legacy vs HEAD legacy | identical |
  | base legacy vs HEAD `{name, css}` | identical |

  With a **negative control** proving the harness discriminates: base + `{name, css}`
  collapses to **1** distinct CSS hash across all 4224 rows (objects are meaningless to
  the old `add`), against **192** on HEAD.
- **Real artifact** (HARD RULE #23): `size: story` through `lattice-emulator.js` gives
  `MediaBox [0 0 810 1440]`, 56945 bytes, on both the default and the `--css` path.
- **Both gates fire.** `checkThemeIdentity`: `@theme` vs filename, `lib/_theme.css`
  renamed, a palette with no directive. `checkThemeRegistrationCallSites`: a reverted
  call site inside the regex-desync region, a non-inline array, `themes.add(css)`, and a
  stale sanction — plus a false-positive probe (prose + a regex containing an apostrophe)
  that must NOT fire.

  Correction to the first version of this note: the *manifest name vs filename* case was
  **already gated on `main`** by the theme-manifest schema check. It is not new coverage,
  and it now reports twice for one defect.

### What was NOT verified

- **The real browser Studio/Playground.** `share-export.ts` and `single-slide-render.ts`
  were exercised through vitest/jsdom and `tsc` only. The live `srcdoc` preview and the
  Studio export buttons are **UNVERIFIED** on the real surface.
- **A real marp-cli render.** `@marp-team` is not installed here, so "Marpit throws
  without `@theme`" — the justification for keeping the directive in source — is taken
  from its documented behavior, not observed.
- **The external legacy contract.** No third-party consumer exists here to test. Bounding
  the scan is safe for all 70 in-repo stylesheets (max `@theme` offset **1005**), but a
  vendored sheet with a >4096-character banner before its directive would now fail to
  register. That is a real, if narrow, behavior change to a published API and it is
  flagged in the changelog rather than buried here.

## 7. What the adversarial trio found

Red team, Munger inversion, and an independent checker were run against the shipping
diff (HARD RULE #25). All three endorsed the DESIGN and all three broke the
ENFORCEMENT. Everything below was confirmed by reproduction, then fixed in this same
change — the record keeps them because "the gate was wrong in this specific way" is the
durable lesson, not the final green.

1. **The gate was blind, and provably so.** `stripJsCommentsAndStrings` was a hand-rolled
   character scanner with no regex-literal handling. `/url\((['"]?)fonts/` — real code in
   `docs/src/lib/theme-fetch.ts:109` — opened a phantom string that blanked the lines
   after it, *including a real call site*. Reverting `theme-fetch.ts:125` to bare CSS
   passed the gate green: the file this very note calls "the clearest case" had a call
   the gate could not see. ~9% of scanned files lost most of their code the same way, and
   an apostrophe in a docblock made it fire on prose in the other direction. **Replaced
   with a real TypeScript AST scan** (`typescript` is already a devDependency and handles
   `.js`/`.mjs`/`.ts`/`.tsx`), text-pre-filtered for cost only. The scrubber is gone.
2. **`addThemes(list)` bypassed the gate entirely** — the matcher required an inline
   array literal, so `const list = [css]; addThemes(list)` was invisible. The AST scan
   checks the argument whatever its shape, and treats a forwarded enclosing PARAMETER
   (the `lib/playground/index.js` facade) as the legitimate pass-through it is.
3. **`engine.themes` is public**, so `themes.add(css)` was an ungated third door to the
   same behavior. Now gated.
4. **A NAMED registration could still silently no-op.** Branching on
   `cssText === undefined` conflated "one argument" with "a missing stylesheet", so
   `add('lattice', undefined)` took the legacy path, discarded the given name, and
   scanned the NAME as css. A sentinel default parameter did not fix it either — an
   explicit `undefined` triggers a default. The branch is now on true arity via a rest
   parameter, and **the stylesheet is validated too**: `add(name, null)` used to return
   `true` and store `null`, so `has(name)` was true forever — permanently disarming every
   `if (!hasTheme(name))` self-heal guard in `theme-fetch.ts` — while `cssFor` served
   scaffold-only CSS. A `true` meaning "registered nothing" is worse than the `false`
   this change set out to remove.
5. **A published-API regression.** Dispatching on `typeof entry === 'object'` routed a
   `Buffer` and a boxed `String` to `add(undefined, undefined)`. Both registered before
   this change and silently stopped after — and `fs.readFileSync(p)` with the encoding
   forgotten is an ordinary call shape on a published CJS export. `addThemes` now treats
   an entry as named only if it actually carries `name`/`css`.
6. **The emulator sanction rested on a false premise.** It claimed the layout-CSS slot
   "has no name to pass". The DEFAULT branch constructs `dist/lattice.css` itself
   (`lattice-emulator.js:404`), so the name is unambiguously `lattice` — and that is 100%
   of real usage. Only a caller-supplied `--css` sheet has an unknowable identity. The
   default path now passes the name; the sanction is narrowed to the override.
7. **Counting.** "Eight in-repo registration sites" was scoped, unstated, to the gated
   roots. There are **33 more in `test/`**, all bare CSS, none gated — deliberately, since
   several suites exercise the legacy path itself, but it means the legacy shape remains
   the majority idiom in the corpus a new author reads first. `THEME_REG_ROOTS` now
   **errors on a missing root** rather than silently skipping it; the asymmetry where the
   sanction list had a staleness check and the root list did not was exactly backwards.
8. **`lib/engine/themes.js` was a BINARY file to git** — a literal NUL at offset 2196,
   inside the comment describing the NUL memo-key separator. `git diff` and GitHub both
   rendered this change's most important file as "Binary files … differ", so the trio
   reviewed a file the tooling refused to display. Replaced with the `\u0000` escape.
   (This PR's own diff of that file stays binary, because the BASE blob still carries the
   NUL; every diff after this one is text.)
9. **Noted, not fixed.** Registered theme CSS is injected verbatim into the Studio's
   same-origin `srcdoc` `<style>`, and HARD RULE #22's `sanitizeSlideHtml` covers slide
   HTML, not that payload. Before this change an un-directived sheet could not register,
   so it never reached the frame; that accidental invariant is gone. Not exploitable
   today — every `extra.css` originates from `serializeTheme`, which always emits a
   header — but the channel is now unconstrained by accident rather than by design.

## 8. The rule this pair establishes

> Metadata belongs in a stylesheet when a consumer must read it **without running the
> engine** — and identity is the only thing that qualifies today. A value the engine owns
> (geometry) does not. And identity a caller already holds is **passed, never searched
> for**: searching costs an unbounded miss and a silent failure, and buys nothing.

The trio adds a second rule, about the enforcement rather than the design:

> A gate that approximates a parser will be wrong silently, and an invariant believed to
> be machine-held is more dangerous than one known to be manual. If a gate must read
> code, parse it.
