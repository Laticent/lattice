---
status: in-progress
summary: >
  E2 result: the HTML scan of a rendered deck needs a median 21% of the minified bytes (195 of 933 KB), misses
  no module on 281 decks, and renders identically in a computed-style gate; Markdown hints alone miss modules
  in every deck. The E0 baseline and the E1 split for the on-demand style loader of 2026-10-17-on-demand-styles-brief.md,
  plus the owner's rulings on the §5 forks and a measured test of the scanner theory. Baseline: a deck
  carries 2.1 to 2.5 MB of style whatever it uses, 40 to 48% of it fonts, while one slide matches about
  40 KB of rules and a 14-slide deck about 57 KB. E1 cuts dist/lattice.css into 183 ordered modules that
  join back byte for byte (gate: test/unit/cli/css-modules.test.js), but cutting the big base files only
  at their existing run boundaries cuts a typical deck's unminified fetch by about 26%, not 90%; minified,
  the picture is better (see E2) and the regrouping left is §7. The scanner reads the rendered HTML (0 missed files, under 8 ms
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

### The minified twin (`dist/styles-min/`, added 2026-10-18 at the owner's request)

Same cut, each module minified with the existing `minifyCss` rules (the Marp `@theme` / `@size` directive
comments are kept; the banner and directives ride on the first file). Concatenated with nothing between the
files they are `lattice-min.css` byte for byte, because esbuild minifies each piece to the same bytes it gives
the whole bundle (checked on the real bundle; the build throws and a unit test fails if that ever stops
being true). Same ids, file names and order as `dist/styles/`, so one manifest index addresses both. Five
modules minify to nothing and stay as empty files so the indexes line up. Cost: 0.98 MB raw, 0.14 MB
gzipped. The loader (E3) and the per-deck bundler (E5) should read this set; `dist/styles/` stays as the
readable twin and the byte-identity reference for the unminified bundle.

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
- **Package size.** `dist/styles/` adds about 2.7 MB raw on disk (0.8 MB gzipped) to a tarball that already ships `dist/`
  (`package.json` `files`; about 0.8 MB gzipped, measured on the tarball-equivalent `tar czf`; the minified twin adds
  about 0.14 MB). The duplicate gzips well, but the owner should decide
  whether it ships or is generated on install. It is in `dist/`, which is gitignored, so the repo does not grow.
- **#19.** E1 is structure only and adds no performance claim, so no bench baseline moves. The first
  performance claim is E3's, with its own cold and warm numbers.

## 7. E2: the dependency inventory (2026-10-18)

`tools/style-needs.js` builds, from the module CSS alone, what each module needs; `tools/style-needs-audit.mjs`
checks it against the real renderer. Decks: the 280 in `examples/` plus the 120-slide gallery, Chromium
131 (all 281) and Playwright's Linux WebKit (every 10th, 29 decks). Not iOS.

**How a module's needs are written down.** Per module, a list of alternatives, each a set of tokens (classes,
attribute names, tag names, ids) that one selector requires; the module is needed if any alternative is fully
present in the document. `:is()` / `:where()` arms become alternatives; `:not()`, `:has()` and `:nth-*()`
arguments, and attribute values, are ignored, which only loosens. Besides selectors there is one more kind of
edge, found in the CSS itself rather than invented: a module that defines `@keyframes`, an `@font-face`
family or an `@property` is needed when a needed module mentions the name. That gives 33 `requires` edges
today (for example `component:flowchart` needs `tail:chart-family.styles`). 13 modules are unconditional
(the banner, `@layer` statement, `:root` and `*` rules): 220 KB unminified, 59 KB minified.

**Scanner, measured (Chromium, 281 decks; WebKit sample alongside).**

| | Result |
|---|---|
| False negatives of the HTML scan against selector truth | **0 modules in 281 decks** (token scan and verified scan) |
| Computed-style gate: every element, plus `::before` and `::after`, in screen, print and dark scheme, full render against a render with only the scanned modules | **281 of 281 decks identical** |
| Index size | tokens only 334 KB raw, 29 KB gzipped; with selectors 1,052 KB raw, 71 KB gzipped |
| Scan cost in the page | token filter about 1.5 ms; verified scan median 6 ms, p95 10 ms, max 17 ms (gallery: 12,501 elements) |
| Bytes loaded per deck, minified (`dist/styles-min/`), of 933 KB | p10 149 KB, **median 195 KB (21%)**, p90 255 KB, max 628 KB (gallery) |
| The same, gzipped | median about 31 KB, against 117 KB for all of `lattice-min.css` |
| Bytes loaded per deck, unminified, of 2,600 KB | token scan median 824 KB, verified scan median 659 KB; selector truth median 608 KB |
| Rules that actually match, per deck | median 42 KB |
| WebKit sample (29 decks, final code) | 0 false negatives; computed-style gate 29 of 29 identical; verified scan median 642 KB unminified, 9 ms in the page; Markdown hints miss modules in all 29 |

- **Two scanners were compared, as the brief asked.** The HTML scan above, and a Markdown-only scan (the
  `_class` / `class` directives, granted every attribute, tag and id for free, which is its best case). The
  Markdown scan misses modules in **all 281 decks** (3,379 modules, about 31 MB of CSS in total, about 12 per
  deck), because the engine adds classes and slides no Markdown line names. So the owner's ruling holds as a
  measurement: **the HTML scan is the authority, hints only prefetch.**
- **Verification is worth its index.** The token scan alone loads 824 KB (unminified) at the median because
  generic selectors (`section svg path`, `section ul p`) are always "possible". Asking the document about the
  alternatives that are met (`querySelector`) brings it to 659 KB, close to selector truth (608 KB). The
  price is the larger index (71 KB gzipped, against 29 KB) and about 4 ms. This is a knob, not a given: a
  consumer with a tight index budget can ship tokens only and load about 20% more.
- **Minified, the base is not the problem it looked like.** §3 says the base is not small. That was true of
  the unminified sheet, whose big files are mostly comments (`base.tokens` is 109 KB unminified, and all
  the custom-property declarations in every module `focus.md` needs add up to 29 KB). Minified, the median deck needs 195 KB and the always-on floor is 59 KB. The
  regroup question below is about the last 150 KB, not the first 700 KB.

**What the gate caught that the selector check did not.** On the first full run, 8 pane decks
(`examples/panes*.md`, `chart-lead-*.md`) rendered differently with the scanned modules, with zero selector
misses. The engine rewrites a pane deck's stylesheet (lib/core/pane-css.js adds `section lat-pane.x` twins),
so the raw `section.list > .cell-stage > ul` cannot be asked about a document whose list is a `<lat-pane>`.
The fix is the adapter's: for a deck with panes the audit asks no selectors and trusts the token filter
(`neededModules(index, tokens)` with no `doc`). The independent checker confirmed no other `composeCss` /
`packSelector` rewrite loosens a selector the other way. That is why the gate stays in the harness: a scanner
and a truth check built from the same CSS share their blind spots.

**What the independent checker broke, and what changed.** The first version claimed zero false negatives as a
property of the code; the checker built 13 counterexamples. Each is now fixed and pinned by a unit test
(21 tests in `test/unit/tools/style-needs.test.js`):

- `:focus-visible` / `:focus-within` were stripped as `:focus`, leaving `.btn-visible`; a state pseudo-class
  inside `:not()` / `:is()` changed the selector's meaning. Asking is now sound or skipped: top-level state
  pseudo-classes and pseudo-elements are removed, and a selector that keeps one deeper, is nested (`&`),
  sits in `@scope`, starts with a combinator or carries `:scope` is never asked (its alternative is kept).
  The state list is broader than the export prune's on purpose.
- A scan is a snapshot, so script-added state was a false negative (`section[data-guide]` stamped at Play,
  `:root[data-lattice-view]`, `[data-copied]`, `.anima-live`). The caller now names **runtime tokens**; the
  Lattice list comes from the export prune's own keep-lists (`lib/export/player-prune.js`, now also exporting
  `GUIDE_PRUNE_SAFELIST`). Cost: `component:scene` (21 KB), `base:focus` (16 KB) and `tail:base.fluid-view`
  (7 KB) load for every deck, which moved the verified median from 599 KB to 659 KB unminified.
- Escaped names (`.a\:b`), namespaces (`[*|lang]`) and case (quirks mode) are normalized; two modules defining
  one name both count; font names compare without case; an inline `style="animation: spin"` creates the edge;
  CSS the parser cannot read keeps its module instead of failing the build.
- The harness: `@media` rules were not counted in the truth, and the truth shared the scanner's pseudo-class
  stripping. Both fixed; the gate remains the independent evidence.

**Limits that stay.** Anything that changes after the scan and is not a declared runtime token (a class a
script adds from data) is invisible, which is E3's job: a unit that appears later asks the loader for its
modules before it shows. `::highlight(x)` rules (the Guide's read-along) can only be requested by the script
that registers the highlight. The gate never enters hover or focus, so those rules rest on the sound-asking
rules and the unit tests, not on a render. Custom properties declared in unscanned modules differ on 260
of 281 decks (registered `@property` initial values and unused tokens); no rendered property differs, and
script that reads tokens at run time must request their modules. Verified in Chromium and WebKit on Linux
only; iOS Safari is UNVERIFIED.

**The regrouping question, answered with data.** Loaded bytes whose rules match nothing, summed over the 281
decks, concentrate in a few modules (unminified sizes): `head:base.tokens#head` 107 KB (15% of all waste;
most of it is comments and font faces), `component:journey` 51 KB (8%; it
carries a `:root` token block, so it is unconditional), `tail:mermaid.styles` and `tail:chart-family.styles`
114 KB each (14% together, loaded by 116 and 98 decks because a generic `section svg path` alternative is
met), `tail:stage` 39 KB, `head:base.elements` 28 KB, `base:card-tag` 25 KB (a `*`-style rule makes it
unconditional). Three moves would remove most of it, each a source change with its own review:
1. **Move global rules out of component files** (the `:root` block in `journey`, the universal rule in
   `card-tag`, `variants#rest`) into the tokens/elements modules. Removes about 90 KB unminified from
   the always-on floor.
2. **Give the diagram sheets a real gate.** Their `section svg path`-style selectors meet in every deck with
   an icon. Verified mode already drops the Mermaid sheet for 165 decks and the chart-family sheet for 183; a
   pane deck or a token-only consumer still loads them. A marker class on diagram figures would make the token filter enough.
3. **Split `base.tokens` by token family**, with the `var()` edge used for named definitions (a module that
   declares `--x` is needed when a needed module reads `--x`). Estimated from the closure: 75% of the
   declarations in the needed modules are read for `focus.md`, 93% for the gallery, so the saving is
   smaller than the module's size suggests. Not worth doing before the minified numbers are the baseline.

## 8. Open items

- **Owner decision, package size.** Ship `dist/styles/` and `dist/styles-min/` in the tarball (about 0.94 MB
  gzipped together, measured by `tar czf`) or generate them on install.
- **Owner decision, index shape.** Ship the verified index (71 KB gzipped, 21% fewer bytes loaded) or the
  token-only index (29 KB gzipped). The harness measures both on any deck.
- **Unify the state-pseudo lists.** `tools/style-needs.js` and `lib/export/player-prune.js` each keep one;
  the core must not import the export pipeline, so the shared piece belongs in a generic kernel (E4).
- **WebKit** was sampled (29 of 281 decks), not run in full.
- **Not built:** E3 (the loader), E4 (the generic core and a second domain), E5 (integrations and export
  bytes, which need the owner's dark and light sign-off).

## 9. Next

E3 (the Playground loader prototype: first-slide bytes and time against the §2 baseline, cold and warm,
Chromium and WebKit, no flash of unstyled content, and a late-appearing unit loading its modules before it
shows) and the three regrouping moves in §7, in that order of value. Both wait for the owner's review of E1
and E2. E3 is a style sink (HARD RULE #22) and gets the adversarial trio on its final shape.
