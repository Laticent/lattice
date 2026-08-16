---
status: shipped
summary: >
  Theme identity got one owner (the manifest) in #1668; the theme GRAPH did not. A palette's
  parent was declared twice — `extends` in the manifest, `@import 'x'` in the CSS — and three
  distinct regexes re-derived it from the CSS. They had drifted (the emulator's missed a
  minified `@import"indaco"` the other two handled), latently rather than live. The emulator
  also flattened imports itself and inlined its own stylesheet, which is why nobody noticed
  that the engine's `render().css` was WRONG on the CLI path for every `-dark` theme — ~2 KB
  of scaffold against ~768 KB. This note makes the manifest the contract for DISCOVERY: one
  `themeChain(name)` from `extends`, baked into one generated edge map, used by the CLI, the
  browser and the Marp bundler alike. It does NOT make the CSS directive decorative — the
  store still splices the parent via `@import` on every render, and an earlier draft of this
  note wrongly claimed otherwise (§3). The adversarial trio also caught a real regression in
  the first cut (a caller-supplied `--css` sheet stopped inlining its own import), a gate that
  duplicated an existing one and disagreed with it, and evidence that could not have detected
  a regression.
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

And the edge had **three distinct regexes** re-deriving it (a fourth consumer,
`deck-export.js`, imported the docs one, so it could not drift from it):

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
fixed in one of the places it existed.

**Be precise about the severity: that divergence was LATENT, not live.** The emulator only
ever reads `themes/*.css`, which are all source-form with the space; the minified form is
served only to the browser, where the docs resolver handled it. So no shipped render was
wrong. What the divergence demonstrates is that a fix applied to one copy does not reach
the others — the standing cost of duplicated derivation, not a fire.

**And the sweep is partial.** Deleting the emulator's and the docs' copies leaves the
engine's (deliberately — §5) plus a family of chain-flatteners in `tools/` and `test/`
that regex `@import` for their own purposes: `tools/build-docs-portal.js`,
`tools/derive-cat-ink.js`, `tools/derive-chart-cat-ink.js`, `tools/contrast-audit.js`,
`tools/cvd-audit.js`, `checkThemeRoles`, and six palette tests — several still carrying the
`\s+` form. They are a knowing scope boundary, not a claim of completeness: they read
source-form themes off disk, where the whitespace divergence cannot bite. Converting them
is worth a follow-up; this note does not.

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
CLI-shaped setup gets an unstyled deck for any `-dark` theme, and no gate would catch it —
nor would the corpus harness this note originally cited as evidence (§8).

## 3. The distinction #1668 missed

#1668 framed the question as *"should `@theme` be in the CSS?"* and answered "yes, because
Marp needs it." Correct, and beside the point. The better question is **"who DISCOVERS the
graph?"**

- **The manifest is the contract for DISCOVERY** — which themes exist, what each extends,
  which files to load. No first-party path re-derives that from a stylesheet any more.
- **`@theme` and `@import` stay in the CSS**, gated against the manifest so they cannot lie.

**What this note must NOT claim — and an earlier draft did.** It said the CSS directives are
"Marp's copy, which Lattice never reads." That is false, and the measurement is one line:

```
chain registered, CSS intact           : 767,712 bytes
chain registered, @import DELETED      :   2,305 bytes
```

`ThemeStore.resolveThemeImports` parses `@import` on **every** engine render, and it is what
splices the parent into the composed sheet. Registering the chain decides what is *available*
to splice; the CSS import is still what performs the splice. So the honest statement is:
**chain discovery no longer parses CSS; composition still does.** Making composition
chain-driven too is a real follow-up, and until it lands the directive is load-bearing, not
decorative.

That is the same shape as `@size`: one owner, a stamped/gated projection for the foreign
consumer. The only difference is that this projection lives in a source file, because the
source file is itself a published export.

## 4. The design

**One pure resolver, two bindings** (the `lint-core` / `lint.js` shape, HARD RULE #7):

- `lib/theme/chain.mjs` — PURE, fs-free, browser-safe. `themeChain(name, edges)` walks a
  `{ name → extends }` map and returns the ordered chain **parent-first**, so a child's
  `:root` overrides its parent at equal specificity (the order `loadPaletteWithImports`
  produces today). Cycles and unknown names terminate rather than throw.
- `lib/theme/edges.generated.mjs` — the `{ name → extends }` map, baked from every manifest
  by `tools/build-theme-catalog.js`. Every runtime imports this ONE file: the CLI, the unit
  suite, and the browser bundle. It deliberately does not live in the docs catalog — that
  home is unreachable from Node, which is exactly how a second copy would start. (The
  catalog's own lists cover only the 18 picker-listed BASE palettes, so the 13 `*-dark`
  variants — which all have a parent — are absent from them. Four of the listed `a11y-*`
  palettes have parents too, so the catalog was never the right home for the edge map.)

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
chain up front**, so `resolveThemeImports` finds its targets present instead of missing.
That is what makes the CLI's `render().css` correct for the first time (§2) — and it means
the store's scan is now MORE load-bearing than before, not less. An earlier draft of this
note claimed the opposite; see §3.

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

## 7. Gate — there is no new one

The first cut of this change added `checkThemeGraph`. It was **deleted before merge**:
`checkThemeRoles` (G2) has compared `extends` against the CSS `@import` since before this
work, and side-by-side over ten mutated theme directories the two had an *identical* firing
set and identical blind spots. Worse, they used different regexes and disagreed on day one —
on the minified `@import"indaco";` form the dist build actually ships, G2 errored and the new
gate passed.

Two gates, two regexes, one fact, already diverging is precisely this note's thesis violated
inside its own enforcement — and it repeats a correction the predecessor record already had
to make about `checkThemeIdentity`. So instead, G2 absorbed the only two things the new gate
did better: comment-stripping, and `\s*` so the minified form is read correctly. One gate,
one regex.

**Known blind spot, unchanged:** a self-consistent cycle or a dangling `extends` (manifest
and CSS agreeing on a bad target) passes G2. `test/unit/theme/chain.test.js` is the backstop
— it asserts no chain repeats a name and every declared parent exists.

## 8. Verification

Rewritten after the adversarial trio. **The first version of this section was vacuous** and
that is worth recording: it cited "4224 renders unchanged" from a harness that registers
every theme up front and touches only `lib/engine` — which this change does not modify. The
inputs were byte-identical across both commits, so the fingerprints matched *by
construction*. It could not have caught a regression.

The check the claim needed replicates the emulator's ACTUAL registration, old leaf-only
shape vs new chain shape, over the same corpus:

```
4224 renders (132 decks x 32 palettes)
  html differing:                 0
  composed css differing:      2376   = 18 parented palettes x 132 decks
  CLI inlined stylesheet:      0 / 32 differing
```

The 2376 is the positive control: exactly the set §2's fix targets, and nothing else moved.

- **Byte-for-byte flattener equivalence**, re-derived by extracting the deleted function out
  of `git show 81e09e4:lattice-emulator.js` rather than trusting the copy in the test: 32/32
  identical, with two negative controls firing.
- **Real artifacts** (HARD RULE #23): `indaco-dark` at hd and `a11y-deuteranopia` at
  `size: story` (the deepest chain) rendered through the real CLI and Chrome — **both PDFs
  and both HTML files byte-identical** to the base commit, dates/ID normalized.
- **The §2 defect**: `render().css` for `indaco-dark` is **2,323 bytes** leaf-only and
  **767,712** chain-registered, measured on a `# x` deck against `dist/lattice.css`. (Figures
  move with the deck — an earlier draft quoted them without their conditions.)
- **Suites:** root 6167 pass / 0 fail; integration 720 pass / 0 fail / 7 skipped (run ALONE —
  it races the unit tier on `lib/components/`); docs 3074 pass, typecheck clean, build 88
  pages; `lint` clean; `build:check` OK.
- **Staleness of `edges.generated.mjs` is gated** in all three directions (new manifest,
  deleted manifest, changed `extends`) via `theme-catalog --check`, wired into `build:check`.

### What was NOT verified

- **The live Playground and the Studio's Export-to-Marp zip.** `deck-export.js` changed how
  bundle members are chosen, and its own failure mode is "renders stripped on the recipient's
  machine, where we never see it." `THEME_EDGES` is confirmed present in the shipped browser
  chunk and the closure was proven equivalent over all 32 themes against the real minified
  served bytes — but nobody clicked Export and opened the zip. **UNVERIFIED.**
- **A real marp-cli render** of an exported bundle, including whether Marp resolves the
  minified `@import"indaco";` form the bundle ships. Pre-existing, not changed here.
- **Whether some cyclic or dangling manifest shape escapes every gate.** Two constructed
  cases were caught only by unrelated gates, by accident.

### One regression the trio caught, and the fix

Replacing the emulator's layout-CSS read with a plain `readFileOrDie` dropped theme-name
`@import` inlining for a **caller-supplied** `--css` sheet — a documented CLI form. Measured:
an imported sheet's tokens vanished from the render. The justification in the code ("the
layout sheet never carries a theme-name import") was true of the default `dist/lattice.css`
and false of the input the flag exists to accept. Fixed with `flattenCssImports` in
`lib/theme/chain.mjs` — one named helper, `\s*` so it handles the minified form, for the one
input that has no manifest and never will.
