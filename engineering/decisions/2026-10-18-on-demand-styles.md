---
status: in-progress
summary: >
  The E0 baseline and the E1 split for the on-demand style loader of 2026-10-17-on-demand-styles-brief.md,
  plus the owner's rulings on the §5 forks and a measured test of the scanner theory. Baseline: a deck
  carries 2.1 to 2.5 MB of style whatever it uses, 40 to 48% of it fonts, while one slide matches about
  40 KB of rules and a 14-slide deck about 57 KB. E1 cuts dist/lattice.css into 183 ordered modules that
  join back byte for byte (gate: test/unit/cli/css-modules.test.js), but cutting the big base files only
  at their existing run boundaries cuts a typical deck's fetch by about 28%, not 90%: the base needs
  regrouping, which is the E2 question. The scanner reads the rendered HTML (0 missed files, under 8 ms
  for 5,849 elements); Markdown hints can only warm the loader (they miss files on 6 of 9 decks).
---

# On-demand styles: baseline, split and rulings (2026-10-18)

Follows `2026-10-17-on-demand-styles-brief.md`. Read that first for the ask. This note records what was
measured, what the owner ruled, and what E1 changed. It does not repeat the brief.

## 1. The owner's rulings (2026-10-18)

| Fork (brief §5) | Ruling |
|---|---|
| 1. What is a module | **Per-component file plus a split base.** Components stay one module each; the large base files are cut. |
| 2. How the scanner knows what a unit needs | **The library works on HTML and takes hints.** The core scans the rendered HTML in full. Hints (from Markdown and front matter) only warm the loader early. Test the idea before building on it (§4). |
| 3. Delivery | **One manifest, two modes.** A build-time per-deck bundle (CLI, PDF, PPTX, player export) and runtime content-hashed chunks (docs site, Studio, Playground). Fonts by URL at runtime, `data:` only for standalone exports and poster capture. |
| 8. Scope this round | **E0 baseline, this note, and E1, then stop for review.** |

Defaults kept unless the owner says otherwise: modules concatenate in `lattice.css` order, no `@layer`
(HARD RULE #26), chunks install once and never on a hot path, and `--_sec-1cqi` plus the section size
stay build-time constants.

## 2. E0: the baseline (reproducible)

Run `node tools/style-baseline.mjs <deck.md|deck.html> [--modules] [--runs N]`. It prints this table for
any deck on Chromium and Playwright's Linux WebKit. Not iOS (HARD RULE #23). Sizes are exact; timings are
medians of 3 runs and vary about 2x run to run on WebKit.

Decks: `test/integration/baseline-decks/gallery.md` (120 slides, `size: 4K`) and `examples/focus.md`
(14 slides). `dist/lattice.css` is 2,662,086 bytes.

| Fact | gallery, Chromium | gallery, WebKit | focus, both |
|---|---|---|---|
| `<style>` bytes (blocks) | 2,497 KB (4) | 2,497 KB (4) | 2,133 KB (2) |
| of which `@font-face` | 1,187 KB (48%), 37 faces, 17 families | same | 845 KB (40%), 17 faces, 5 families |
| of which rules | 1,278 KB, 4,972 rules | 1,293 KB | 1,253 to 1,268 KB, 4,687 rules |
| HTML of the slides | 423 KB | 423 KB | 29 KB |
| Rules one slide matches | median 39 KB (3%), 33 to 57 KB | 40 KB | median 40 KB (3%) |
| Rules the whole deck matches | 311 KB (24%) | 316 KB | 57 to 58 KB (5%) |
| Matcher cost | 5.0 s / 120 slides | 12.2 s | 0.66 s / 14 slides (Chromium), 1.5 s (WebKit) |
| One poster capture of the whole sheet | 2,499 KB SVG, 171 to 335 ms | 106 to 491 ms | 2,137 KB SVG, 129 to 161 ms (Chromium), 208 to 258 ms (WebKit) |

**What reproduces and what does not.** The sheet size, the font share (47 to 48%), the face and family
counts, the HTML size and the capture cost match brief §3. **The brief's "one slide matches 400 to 420 KB
(31%)" does not reproduce:** the loose matcher in `tools/style-baseline.mjs` (selector matches the
section, a descendant, or an ancestor; pseudo-elements and interaction states stripped) finds about 40 KB
(3%). The deck-wide union of 311 KB (24%) is the nearest figure to the brief's, so the brief may have
counted a different thing. The script is committed, so the next number is checkable. The finding favors
the loader: a slide uses far less than the brief assumed.

**A small deck pays the same bill.** `focus.md` has 14 slides, uses 57 KB of rules, and still ships
2.1 MB of style.

## 3. E1: the split (structure only)

`tools/css-modules.js` and `tools/build-css.js` now cut the bundle into 183 ordered modules and write
`dist/styles/manifest.json` plus one file per module. Joined with `"\n"` (no separator inside a source cut
into runs), the modules are `dist/lattice.css` byte for byte. `test/unit/cli/css-modules.test.js` proves
it, proves each module parses, and proves a built `dist/styles/` matches the build; `css:check`
also fails on a stale `dist/styles/`.

- **Source cuts.** Every source the bundler emits is one module: 75 components, the head files, the
  plugin sheets, the base files. The bundler names them in `assemble()`; nothing is guessed.
- **Run cuts.** Five base files are too big whole: `base.tokens` (116 KB), `base.modifiers` (290 KB),
  `base.finish` (82 KB), `base.sketch` (56 KB), `base.variants` (47 KB). Their top-level rules are grouped
  by the first class they name, runs are contiguous (no rule moves, so the cascade is untouched), and runs
  under 2 KB fold into the previous module. Result: 3 + 46 + 10 + 4 + 5 = 68 modules from those five.
- **Why the build derives the cut instead of editing the sources.** The source files stay as authors
  know them, and one function (`MIN_RUN_BYTES`, `RUN_SPLIT`) tunes the cut. If E2 shows a real regrouping
  is worth it, that is a source change with its own review.

### What the split buys today

`node tools/style-baseline.mjs <deck> --modules` counts a module as needed when any one of its rules
matches (the loose matcher, per rule):

| Deck | Modules needed | Bytes to fetch | Rules actually matched | Before E1 (whole files) |
|---|---|---|---|---|
| `focus.md` | 44 of 183 | 535 KB | 44 KB | about 725 KB (7 component files 105 KB + 8 base files 619 KB) |
| gallery | 108 of 183 | 1,849 KB | 248 KB | about 1,720 KB (58 components + base) |

For a typical deck the run cuts save about 26%. That is far short of the 44 KB the deck matches, because
the biggest needed modules are always-on: `head:base.tokens#head` (104 KB of custom properties),
`tail:stage` (38 KB), `head:base.elements` (28 KB), `base:card-tag` (25 KB), KaTeX (21 KB). **So the
base is not small yet, and the work that moves the number is in the base, not in more component files.**
The gallery is the worst case and barely moves, as expected.

This is the answer to "how well do contiguous cuts do?" Where the source already groups rules by feature
the cut is clean (`divider`, `form`, `lat-pill`, `deck-logo` come out as modules). Where it interleaves
(`title`, `rest`, `cell-footer` each appear 3 or 4 times in `base.modifiers`), a module is a mix and loads
for any of its members. E2 must say whether regrouping by feature is safe.

## 4. The scanner theory, tested (2026-10-18)

The owner's idea: the library works on HTML, and hints (from Markdown, which the engine already reads)
only make loading start early; the HTML scan is the authority. Test on 9 decks (gallery, `focus`, and 7
examples), Chromium and WebKit. The scan collects every class and attribute name once. A file is needed
when some rule in it has all of its class and attribute tokens present (a necessary condition: arguments
of `:not()` / `:is()` / `:has()` are dropped, so it can load too much but cannot skip a needed file).
Ground truth is "some rule in the file matches the DOM." Throwaway scripts; the method moves into E2.

| Check | Result |
|---|---|
| Files missed by the HTML scan | **0 on all 9 decks, both engines** |
| Scan time, gallery (5,849 elements) | 4.6 ms Chromium, 7.4 ms WebKit |
| Scan time, ordinary decks (100 to 840 elements) | 0.1 to 1.6 ms |
| Files missed by hints alone (`_class:` directives only) | **6 of 9 decks**; gallery 15 files (199 KB) |

Hints miss because the engine creates slides and classes no Markdown line names (`focus.md`: 11 authored
slides, 14 rendered). **Ruling stands: scan the HTML, use hints only to prefetch.** Limits of this test:
the hint reader saw `class:` directives only (not `theme:` / `finish:`), and a scan before render cannot
see classes that script adds later, so a later-appearing unit must load its module before it shows (E3).

## 5. What the maker-checker pass found, and what changed

One independent checker read the diff, ran the mutation tests and re-derived the join. The core contract held
(joined modules equal `bundle()`, and `bundle()` equals the pre-refactor output and `dist/lattice.css`).
Findings folded into this branch:

- **`bytes` counted characters, not bytes.** 181 of 183 modules hold a non-ASCII character, so the manifest
  total read 2,608,910 against 2,662,086 on disk. Now `Buffer.byteLength`; a test pins it. The table in §3
  uses the corrected numbers.
- **The dist README gained 184 "TODO: describe" rows.** Added a `styles/` group to `tools/build-dist-readme.js`
  (259 TODO rows before, 75 now).
- **The build now throws if the modules do not join to the bundle**, instead of leaving that to the unit test.
- **A source that emits nothing is no module** (it would have added a stray `"\n"` to the join).
- **`style-baseline.mjs`**: a bad `--engine` prints usage, a page with no `<section>` errors clearly, and the
  temporary render directory is removed.
- **Wording**: `dist/` is gitignored, so tests and docs say "built", not "committed".

Known limits, recorded rather than fixed (each belongs to a later step):

- **Module files keep `lattice.css`'s stylesheet-relative font URLs** (`url('fonts/playfair-400.woff2')`). Byte
  identity forces this. A module loaded from `dist/styles/` would look for `dist/styles/fonts/`. The loader
  (E3) and the per-deck bundler (E5) must resolve them against `dist/` (the manifest `note` says so). Runtime
  chunks served from a CDN will rewrite them to hashed font URLs, which is the §5.5 font decision.
- **File names and run ids are position-based** (`0042-...`, `rest~2`). Adding a component renames every later
  file. Fine while only the manifest names files; E3's content-hashed immutable chunks replace the index prefix.
- **`--modules` counts a module as used only when a style rule in it matches**, so a module of only `@font-face`
  or `@keyframes` reads as unused. Those are loaded by name from E2's dependency data, not by selector matching.
- **`component:journey` counts as used by every deck** because its `:root` token block sits in the same file.
  Real finding for E2: a component file mixing global tokens with component rules cannot be skipped.
- **`css:check` now takes about 1.2 s** (the module build assembles the bundle three times and parses the five
  split files). Acceptable; `assemble()` can be memoized if it starts to matter.
- **Not run:** Windows paths (the `source` field and the bundle's header comments use `path.join`), the
  integration tier, and the packed tarball size.

## 6. Checks and decisions still open

- **Maker-checker** (HARD RULE #25): done, one checker (§5). The adversarial trio is for the loader's final shape (E3), not this structure-only step.
- **Export sign-off.** E1 changes no export byte: `dist/lattice.css` and every other existing artifact are
  byte-identical (`css:check`). E5 will; that is where the owner inspects dark and light renders.
- **Package size.** `dist/styles/` adds about 3.0 MB on disk to a tarball that already ships `dist/`
  (`package.json` `files`; the packed size is unmeasured). The duplicate gzips well, but the owner should decide
  whether it ships or is generated on install. It is in `dist/`, which is gitignored, so the repo does not grow.
- **#19.** E1 is structure only and adds no performance claim, so no bench baseline moves. The first
  performance claim is E3's, with its own cold and warm numbers.

## 7. Next

E2 (dependency inventory: per module, what it needs, from the same token rules as §4, with zero false
negatives on all 281 decks) and the regrouping question for the base. Both wait for the owner's review of
E1.
