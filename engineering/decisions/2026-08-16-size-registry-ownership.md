---
status: shipped
summary: >
  The `@size` table in theme CSS is not Marp residue the engine ignores — the OWNED engine
  parses it back out of its own comment (`lib/engine/css.js` SIZE_RE → resolveSize →
  composeCss), which makes today's flow a round trip: JS writes a table into a CSS comment,
  then regexes it back out. Meanwhile the CSS the engine actually ships is already size
  agnostic: zero px-keyed `@media`/`@container` queries across `lib/**/*.css`. Geometry
  reaches a rule only as an emitted VALUE (scaffold width/height, `--_sec-1cqi`,
  `--canvas-scale`, `--safe-*`) or a stamped ATTRIBUTE (`data-orientation`, `data-family`).
  So the size registry belongs in the engine as data, the deck keeps declaring a NAME in
  front matter, and the `@size` block is STAMPED into the Marp-facing artifacts at build
  time — where the only consumer that needs it lives. Today the same 14-line table is
  byte-identical in 33 hand-maintained files, with three further partial copies; one of
  them (`lint-core.js`'s SIZE_FAMILY_FALLBACK) exists precisely BECAUSE a browser-safe
  module cannot read a CSS comment. The novel-`@size`-in-a-theme channel is retired with
  this change: the registry is the vocabulary.
---

# The size registry belongs to the engine, not to a CSS comment

**Date:** 2026-08-16
**Status:** shipped — the design and the implementation landed together
**Relates to:** `2026-06-10-marp-replacement-proposal.md` (the owned engine),
`2026-06-13-export-to-marp.md` (Marp as an export target),
`2026-07-30-slide-geometry-emitted-not-measured.md` (geometry is emitted, not measured),
`2026-08-02-marp-reference-register.md` §"Minification is safe here"

---

## 1. The question

Theme CSS opens with a Marp-shaped header:

```css
/* @theme burgundy
 * @size hd       1280px 720px
 * @size HD       1280px 720px
 …14 lines…
 * @size mobile   1080px 2340px
 */
```

Marp is retired as a render path. The engine owns geometry. `cqi` scales
naturally. So: is this metadata worth propagating, and what metadata should a
Lattice stylesheet carry at all?

## 2. The correction: it is not inert

The obvious read — "legacy Marp directives nothing consumes" — is wrong, and
that matters, because deleting the block today breaks every render.

The **owned** engine parses it:

| Where | What |
|---|---|
| `lib/engine/css.js:33` | `SIZE_RE = /@size\s+…/g` |
| `lib/engine/css.js:57` | `parseSizes(cssText)` → `Map<name, {width,height}>` |
| `lib/engine/css.js:73` | `resolveSize(sizeName, sources)` — theme first, then base, then hd, then 1280×720 |
| `lib/engine/css.js:385` | `composeCss()` resolves geometry BEFORE stripping comments |
| `lib/engine/themes.js:93,116` | `cssFor()` / `geometryFor()` — the per-render sheet and the plain-number box hosts fit-scale against |
|  `lib/authoring/lint.js:127` | `buildSizeVocab()` re-reads `dist/lattice.css` with the engine's own `parseSizes` |

So the current flow is a **round trip**. The table is authored in JS or by hand,
written into a CSS *comment*, minified through a special preservation rule
(`tools/minify-css.js:23` `DIRECTIVE_RE`), and then regexed back out by the
engine that needed it in the first place. The CSS comment is not a source of
truth; it is a serialization format we parse against ourselves.

## 3. The CSS body is ALREADY size agnostic

This is the load-bearing fact, and it is empirical:

```
$ grep -rnE "@media[^{]*(width|height|aspect-ratio)|@container[^{]*(width|height)" \
    lib --include=*.css | grep -v print | wc -l
0
```

Not one rule in `lib/**/*.css` is keyed on a pixel dimension. Geometry reaches
the cascade by exactly two channels, both **emitted**, never queried:

1. **Values the engine writes**, from a geometry it already resolved —
   `article.lattice > section { width; height }` (`css.js:146` `scaffold`),
   `@page { size }`, `--_sec-1cqi` / `--_sec-1cqh` (`css.js:131`
   `geometryVarsCss`), `--canvas-scale` / `--stat-emphasis` / `--safe-*`
   (`css.js:446` `orientationCss`).
2. **Attributes the engine stamps** — `data-orientation` (server-side) and
   `data-family` (runtime), both derived from the same aspect through the shared
   classifier in `lib/adaptive/families.js`. Component reflow keys on the
   attribute, never on a width.

`cqi` does not *replace* the registry, and it is worth being precise about why:
`cqi` is relative to a box, so something must declare the box, and a fixed-page
PDF needs an absolute `@page`. In fact `cqi` is **downstream** of the registry —
`section { container-type: size }` cannot query itself, so the engine has to
stamp the slide's own 1% from a known pixel geometry
(`2026-07-30-slide-geometry-emitted-not-measured.md`).

The conclusion is not "CSS should become size agnostic." It already is. Only the
comment header disagrees with the rest of the file.

## 4. The copies

The identical 14-line table appears in **33 hand-maintained files**: all 32
`themes/*.css` plus `lib/_theme.css`. Verified byte-identical (one hash across
the extracted `@size` lines). Three further copies are partial or derived:

| Copy | Shape | Why it exists |
|---|---|---|
| `lib/theme/serialize.js:17` `SIZE_BLOCK` | full table, hardcoded in JS | stamps the header into every Theme Studio-generated theme |
| `lib/authoring/lint-core.js:157` `SIZE_FAMILY_FALLBACK` | names + family, JS | lint-core is fs-free and browser-safe (HARD RULE #7), so it **cannot read a CSS comment** |
| `docs/src/playground/deck-sizes.js` `SIZE_OPTIONS` | curated subset + labels | the deck-config size picker |

Plus generated mirrors: `dist/lattice.css`, `dist/lattice.min.css`,
`dist/themes/*.min.css`, `dist/marp-kit/*.min.css`,
`docs/src/playground/theme-core.generated.js`,
`docs/src/playground/authoring-core.generated.js`.

Two of these are self-indicting. `SIZE_FAMILY_FALLBACK`'s own comment calls
itself "a LAST RESORT, not the source of truth" and names the drift class it
invites (#1218, every square reflow rule inert). It exists **only because the
registry is encoded in a place a pure module cannot reach.** A JS registry is
importable there, so that copy disappears rather than being documented.
`deck-sizes.js` needs a test (`test/unit/playground/deck-sizes.test.js`) to
guard a hand-written list against `lib/_theme.css`; against a registry it can be
a projection, and the drift guard becomes structural.

**The per-theme tables are already dead weight.** Verified: stripping every
`@size` line out of `themes/burgundy.css` yields identical geometry for
`hd` / `square` / `story` / `mobile` / default, because `resolveSize` falls back
theme → base and the base declares the same table. Thirty-two files carry a
block that changes nothing.

## 5. What Marp actually needs, and why stamping is the right seam

Marp is an **export target**, not a render path. `@marp-team` is not even an
installed dependency; `lib/core/marp-bundle.js` ships the prebuilt
`dist/lattice.min.css` plus `dist/themes/<palette>.min.css`, and
`tools/build-marp-kit.js` assembles the standalone kit.

For that consumer the `@size` block is genuinely required — marp-cli and the
Marp for VS Code extension read geometry out of the theme comment, and
`test/unit/tools/marp-kit.test.js:93` asserts it survives into the artifact.

But that requirement is a property of **the export**, not of Lattice's source
CSS. And the seam is already half-built: `tools/minify-css.js` carries a
special-case rule whose entire purpose is preserving `@theme`/`@size` comments
through minification *for Marp's benefit*. Today it preserves a block that came
from the source; tomorrow the build stamps that block from the registry. Same
artifact, one less copy upstream.

## 6. The model

- **Registry** → one JS table (`lib/engine/sizes.js`), imported by the engine,
  the fs-reading linter, the browser-safe lint-core, and the picker alike.
- **Deck** → declares a registered NAME in front matter (`size: story`). Already
  true: `lib/engine/index.js:447` reads `globalBase.size || directives.size`.
- **Theme CSS** → `@theme <name>`, the license header, design-contract prose.
  No geometry.
- **Marp-facing artifacts** → the build **stamps** the `@size` block into
  `dist/lattice.min.css`, `dist/themes/*.min.css`, and the marp-kit from the
  registry.

Do not sell this on cycles. The parsing is memoized on both hot paths
(`lint.js` `_sizeVocab`, `ThemeStore._cssCache`), so the runtime saving is
noise. The win is that a table with one meaning has one home, and that the
copies which exist to work around the encoding stop existing.

## 7. Decided: named presets are the whole vocabulary

Today a third-party theme *could* register a novel `@size` in its header, and
`lint.js:113-121` reasons explicitly about that case (it would win in the
renderer and be invisible to the linter — "a known bound on this vocab, not a
guarantee it does not have").

That channel is **retired**, not replaced. The registry is the vocabulary: the
14 registered names, and nothing else. Rationale — the capability was never
exercised in-repo (all 33 tables are byte-identical), it was already known to
desynchronize the linter from the renderer, and keeping a theme able to redefine
the page box reintroduces exactly the competing-source-of-truth problem
`checkSectionBoxes` exists to prevent (`tools/check-ownership.js:1530`). A deck
that needs a canvas we do not ship is a request to add a preset, which is a
one-line registry change and a picker entry.

Consequence to state plainly: an out-of-tree theme carrying a custom `@size`
stops taking effect after this change. Nothing in the repo does this, and the
Marp-facing artifacts still ship the standard table, so the export path is
unaffected.

## 8. So what metadata SHOULD Lattice CSS carry?

The test: **what must a consumer know without running the engine?**

**Keep:**
- `@theme <name>` — identity, and the registration key `ThemeStore` and Marp
  both resolve a theme by. A stylesheet legitimately self-describes.
- License / SPDX header — legal provenance travels with the bytes.
- Human design-contract prose (the palette's intent, the lightness bands) —
  documentation for whoever edits the file, consumed by nobody.

**Do not carry:**
- Anything the engine computes or already holds — geometry above all.
- Anything that would need a second copy elsewhere to be usable by a
  browser-safe or fs-free module. That is the tell: if a pure module needs the
  same fact, the fact does not belong in a comment.

## 9. What moved (as shipped)

1. **`lib/engine/sizes.js`** — the registry: `SIZES` (name → `{width, height}`,
   in declaration order), `sizeFor()`, `isRegisteredSize()`, `sizeBlock()`.
   Pure and fs-free, so `lint-core.js` and the browser bundles import it.
2. **`resolveSize(sizeName)`** now reads the registry and takes one argument.
   `parseSizes()` stays exported but leaves the render path entirely — its only
   callers are the gate and the tests, both reading a Marp-facing *artifact*.
   `ThemeStore.geometryFor()` stopped inlining a theme's imports (~1 MB) to read
   a comment; its `name` parameter is kept and ignored.
3. **The `@size` block is gone from all 32 `themes/*.css` and `lib/_theme.css`.**
   `@theme` stays. (`themes/cuoio.css` also lost a stray trailing-whitespace
   comment line that made its header differ from every other palette's.)
4. **`lib/theme/serialize.js`** no longer stamps `SIZE_BLOCK` into generated
   themes.
5. **`lib/authoring/lint-core.js`** imports the registry; `SIZE_FAMILY_FALLBACK`
   and the `vocab.sizes` injection (plus `buildSizeVocab()`, its memo, and the
   `fs`/`path` requires it needed in `lint.js`) are deleted.
6. **`docs/src/playground/deck-sizes.js` stays hand-curated** — a deviation from
   the plan above, and a deliberate one. It carries human labels and offers one
   entry per FORMAT (the `16:9` / `9:16` / `1:1` aliases are omitted); that is
   editorial, not data. What can drift is membership and the dimensions the
   labels quote, so `test/unit/playground/deck-sizes.test.js` now checks both
   against the registry instead of against `@size` lines parsed out of
   `lib/_theme.css`.
7. **`tools/build-css.js stampSizeDirectives()`** writes the block into the
   `@theme` comment of `dist/lattice.css`, `dist/lattice.min.css`, and every
   `dist/themes/*.min.css`; the marp-kit copies those. Insertion is immediately
   after the `@theme` line — where the block already lived — so the generated
   bytes did not move.
8. **`checkSizeRegistryOwnership`** (`tools/check-ownership.js`, via
   `build:check`) fails in BOTH directions: source CSS declaring `@size`, and a
   Marp-facing artifact whose stamp is missing or drifted. It reads artifacts
   with the engine's own `parseSizes`, so it fails on exactly what Marp would
   fail to read. Both directions were confirmed to fire.
9. **`lattice-emulator.js`** validates `size:` against the registry rather than
   against whatever `@size` table the loaded stylesheets happened to carry. The
   old guard disabled *itself* when no sheet declared any (`knownSizes.size &&`),
   and after step 3 it was passing only by accident of the stamp.

### Two things found on the way

- **`sizeFor()` resolved inherited properties.** `SIZES[name]` with a name from
  deck front matter answered `size: constructor` with a function off
  `Object.prototype`, which reaches `parseFloat(geometry.width)` as `NaN`. Now
  an own-property check. Caught by the new registry test, not by review.
- **The emulator's unknown-size guard was load-bearing on the old encoding** in
  a way nothing recorded (see 9.9 above).

## 10. Verification

- `npm test` — 6112 pass, 0 fail. `npm run lint` clean. `npm run build:check` OK.
- `npm run test:integration` — 707 pass, 0 fail, 7 skipped (the cross-renderer +
  PDF-page-count tier, including the 4K SVG-scaling check).
- **`dist/` is byte-identical** to what shipped before the move, except one
  whitespace-only comment line in `cuoio.min.css` (item 3). The stamp reproduces
  the hand-maintained block exactly.
- **528 renders unchanged.** The 132-deck corpus (the baseline gallery + every
  `examples/*.md`) rendered at four canvases — default, `story`, `square`, `4K`
  — with `html` and `css` hashed before and after: identical on every one.
- **Real artifacts, not a harness** (HARD RULE #23): PDFs rendered through
  `lattice-emulator.js` carry `MediaBox [0 0 960 540]` at the hd default and
  `[0 0 810 1440]` at `size: story` — 1280×720 and 1080×1920 CSS px. Every
  registered name, alias, and an unregistered one were resolved through the real
  engine and checked for geometry, `@page`, `--_sec-1cqi`, `data-orientation`
  and `data-family`.
- The gate was confirmed to fire in both directions by temporarily
  reintroducing `@size` into a theme and by removing one `@size` line from
  `dist/lattice.min.css`.
- **UNVERIFIED:** a real marp-cli / Marp for VS Code render of the kit.
  `@marp-team` is not an installed dependency here, so the check is that the
  artifacts carry the same directives, byte-for-byte, that they carried before —
  not that Marp was observed reading them.
