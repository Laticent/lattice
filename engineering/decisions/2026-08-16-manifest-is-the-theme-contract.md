---
status: shipped
summary: >
  Theme identity got one owner (the manifest) in #1668, but the theme GRAPH did not: a
  palette's parent is declared twice — `extends` in the manifest and `@import 'x'` in the
  CSS — and THREE separate resolvers re-derive it from the CSS with three different
  regexes. They already disagree: on a minified `@import"indaco"` the engine and the docs
  resolve it and the emulator does not, because the engine's copy carries a fix its own
  comment documents and the emulator's copy never got. The emulator therefore flattens
  imports itself and inlines its own stylesheet, which is why nobody noticed that the
  engine's `render().css` is WRONG on the CLI path for every `-dark` theme (2,323 bytes of
  scaffold against 767,712). This note makes the manifest the whole contract for Lattice:
  one `themeChain(name)` from `extends`, used by the engine, the CLI and the browser
  alike. `@theme` and `@import` stay in the CSS as Marp-facing projections that Lattice
  itself never reads — which is the distinction #1668 missed, and the reason that PR felt
  like it left the job half done.
---

# The manifest is the theme contract; the CSS directives are Marp's copy

**Date:** 2026-08-16
**Status:** shipped
**Follows:** `2026-08-16-theme-identity-ownership.md` (#1668) — which gave identity one
owner and left the dependency graph with two.

---

## 1. What #1668 did not fix

It counted three encodings of the NAME and bound them. There were five encodings of **two**
facts:

| Fact | Encodings |
|---|---|
| identity | filename · manifest `name` · `@theme` |
| the parent edge | manifest `extends` · CSS `@import 'x'` |

And the edge has **three resolvers**, each with its own regex:

| Where | Regex |
|---|---|
| `lib/engine/themes.js:41` | `/@import\s*(['"])([A-Za-z0-9_-]+)\1\s*;?/g` |
| `lattice-emulator.js:703` | `/@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g` |
| `docs/src/lib/theme-fetch.ts:37` | `/@import\s*['"]([A-Za-z0-9_-]+)['"]/g` |

**They already disagree**, measured:

```
source    @import 'indaco';   engine: resolves | emulator: resolves | docs: resolves
minified  @import"indaco"     engine: resolves | emulator: MISSES   | docs: resolves
```

The engine's regex carries a comment explaining exactly this — *"minified palettes ship the
import as `@import"concrete"` with no space — requiring whitespace collapsed every `*-dark`
wrapper to scaffold-only CSS"* — and the emulator's copy never received the fix. One bug,
fixed in one of the three places it exists. That is the drift a duplicated derivation
guarantees, and it has already happened.

## 2. The latent defect this hides

The emulator does not use the engine's theme resolution at all. It flattens imports itself
(`loadPaletteWithImports`, `lattice-emulator.js:696`), builds `paletteCSS + layoutCSS` by
hand (`:728`), and takes only `rendered.html` from the engine — `rendered.css` is discarded.

So the engine's composed CSS is **wrong on the CLI path today** and survives only because
nothing reads it. Measured, `indaco-dark` registered without its parent:

```
engine .css with only indaco-dark registered:  2,323 bytes   (scaffold only)
engine .css with indaco also registered:     767,712 bytes
```

The CLI registers exactly one palette. Anyone calling `engine.render().css` from a
CLI-shaped setup gets an unstyled deck for any `-dark` theme, and no gate would catch it.

## 3. The distinction #1668 missed

#1668 framed the question as *"should `@theme` be in the CSS?"* and answered "yes, because
Marp needs it." Correct, and beside the point. The right question is **"should LATTICE READ
it?"** — and the answer is no.

The confusion was never that the directive exists in the file. It is that Lattice treats it
as a source of truth, which forces every consumer to parse CSS to learn something the
manifest states declaratively.

So:

- **The manifest is the whole contract for Lattice** — identity, file discovery, and the
  parent chain. Nothing in the engine, CLI or docs parses `@theme` or `@import` for its own
  purposes.
- **`@theme` and `@import` stay in the CSS as MARP's copy** — valid CSS, gated against the
  manifest so they cannot lie, read by Marp and by nobody else on our side.

That is the same shape as `@size`: one owner, a stamped/gated projection for the foreign
consumer. The only difference is that this projection lives in a source file, because the
source file is itself a published export.

## 4. The design

**One pure resolver, two bindings** (the `lint-core` / `lint.js` shape, HARD RULE #7):

- `lib/theme/chain.js` — PURE, fs-free, browser-safe. `themeChain(name, edges)` walks a
  `{ name → extends }` map and returns the ordered chain **parent-first**, so a child's
  `:root` overrides its parent at equal specificity (the order `loadPaletteWithImports`
  produces today). Cycles and unknown names terminate rather than throw.
- `lib/theme/edges.generated.js` — the `{ name → extends }` map, baked from every manifest
  by `tools/build-theme-catalog.js`. Every runtime imports this ONE file: the CLI, the unit
  suite, and the browser bundle. It deliberately does not live in the docs catalog — that
  home is unreachable from Node, which is exactly how a second copy would start. (The
  catalog's own lists cover only the 18 picker-listed BASE palettes; the 14 `*-dark`
  variants are absent from them, and they are precisely the themes that have a parent.)

**Consumers:**

| Path | Before | After |
|---|---|---|
| `lattice-emulator.js` | `loadPaletteWithImports` + own regex | `themeChain` → read each file |
| `docs/src/lib/theme-fetch.ts` | `themeImportNames(css)` + recursive walk | `themeChain` from `THEME_EDGES` → fetch each |
| `docs/…/export/deck-export.js` | `themeImportNames(css)` to pick bundle files | `themeChain` → bundle the whole chain |
| `lib/engine/themes.js` | `resolveThemeImports` over registered CSS | unchanged *(see §5)* |

## 5. What deliberately does NOT change

`ThemeStore.resolveThemeImports` stays. It inlines `@import 'x'` against whatever is
registered, and it must, because the store serves callers who never touched a manifest —
the Studio's user-authored themes, a shared deck payload, an external `./engine` consumer.
The store is the last line, working from content alone.

The difference after this change is that **every first-party caller registers the whole
chain up front**, so `resolveThemeImports` finds its targets already present and is a no-op
in practice rather than the mechanism being relied upon. That also makes the CLI's
`render().css` correct for the first time (§2).

## 6. Cost, and who pays

- **On-disk themes need a manifest.** All 32 have one, the schema already requires `name`,
  and the CLI only ever loads from `PKG_ROOT/themes/`, so out-of-tree CLI themes are not a
  thing today.
- **Studio-authored themes are unaffected** — they register via `addThemes([{name, css}])`
  with no file and no manifest. The manifest drives *discovery of on-disk themes*, not
  registration in general.
- **The published `themes/*.css` Marp export is unaffected** — the directives stay.
- **Chain depth is 2 at most.** 18 of 32 declare `extends`; the deepest are the four
  `a11y-*` palettes (`a11y-deuteranopia` → `a11y-base` → `onyx`). This is a walk, not a
  graph problem.

## 7. Gate

`checkThemeGraph` — the manifest's `extends` must equal the CSS's theme-name `@import`
(ignoring `@import 'lattice'`, which is the engine base and declared by `role`), in both
directions, for every palette. That is what keeps Marp's copy honest, and it is the only
reason the CSS directive is allowed to remain.

## 8. Verification

- **The chain is a byte-for-byte drop-in.** For all 32 palettes,
  `themeChain(name).map(read).join('\n')` equals what the emulator's deleted flattener
  produced. Frozen as a test (`test/unit/theme/chain.test.js`) that keeps a copy of the
  old algorithm and compares — so the equivalence stays asserted, not just measured once.
- **4224 renders unchanged** (132 decks × 32 palettes, both `addThemes` shapes) against a
  worktree of the base commit.
- **The §2 defect is now a passing assertion**: registered through the chain, the CLI-shaped
  `render().css` for `indaco-dark` is 767,712 bytes; leaf-only it was 2,323.
- **Real artifacts:** a `-dark` deck through `lattice-emulator.js` is **byte-identical**
  before and after the rewrite (31,972 bytes, `/CreationDate` `/ModDate` `/ID` normalized),
  and `size: story` still yields `MediaBox [0 0 810 1440]`.
- **Suites:** root 6167 pass / 0 fail; docs 3074 pass / 231 files; `typecheck` clean; `lint`
  clean; `build:check` OK.
- **`checkThemeGraph` fires in all three directions**: manifest declares `extends` and the
  CSS drops the import; the CSS imports a different parent; the manifest drops `extends`
  while the CSS keeps the import.

### A fourth resolver, found while wiring this up

`docs/src/components/studio/export/deck-export.js` scanned `@import` to decide which theme
files to put in the Export-to-Marp bundle — a fourth copy the original survey missed, and
the one with the worst failure mode (a missing ancestor renders stripped on the
*recipient's* machine, where we never see it). It takes the declared chain now.

### Where the edge map lives, and why

`lib/theme/edges.generated.js`, not the docs catalog. The browser cannot read manifests at
runtime so the map must be baked; putting it in `docs/src/lib` would have made it
unreachable from the CLI and the unit suite, which is precisely how a second copy starts.
One generated file beside the pure resolver, imported by all three runtimes, asserted
against the manifests by a test.
