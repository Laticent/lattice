---
status: in-progress
summary: >
  E2 result: the HTML scan of a rendered deck needs a median 21% of the minified bytes (195 of 933 KB), misses
  no module on 281 decks, and renders identically in a computed-style gate; Markdown hints alone miss modules
  in every deck. The E0 baseline and the E1 split for the on-demand style loader of the 2026-10-17 on-demand-styles brief,
  plus the owner's rulings on the §5 forks and a measured test of the scanner theory. Baseline: a deck
  carries 2.1 to 2.5 MB of style whatever it uses, 40 to 48% of it fonts, while one slide matches about
  40 KB of rules and a 14-slide deck about 57 KB. E1 cuts dist/lattice.css into 183 ordered modules that
  join back byte for byte (gate: test/unit/cli/css-modules.test.js), but cutting the big base files only
  at their existing run boundaries cuts a typical deck's unminified fetch by about 26%, not 90%; minified,
  the picture is better (see E2) and the regrouping left is §7. The scanner reads the rendered HTML (0 missed files, under 8 ms
  for 5,849 elements); Markdown hints can only warm the loader (they miss files on 6 of 9 decks).
---

# On-demand styles: baseline, split and rulings (2026-10-18)

Follows the brief `2026-10-17-on-demand-styles-brief.md`. Read that first for the ask. The brief is not part of this PR; it reached `main` with #2782. This note records what was
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
checks it against the real renderer. Decks: the 292 in `examples/` plus the 120-slide gallery (293), run in
full on Chromium 131 and on Playwright's Linux WebKit. Not iOS. The first table below was measured on the
281 decks that existed when the harness was first run; the final full runs on current `main` are the next
table.

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

**Final audit on current `main`, all 293 decks, both engines (2026-10-19).**

| | Chromium 131 | WebKit (Playwright, Linux) |
|---|---|---|
| Decks audited / skipped | 293 / 0 | 293 / 0 |
| HTML-scan false negatives (verified and token scan) | **0** | **0** |
| Computed-style gate, screen, print and dark, every element and `::before` / `::after` | **0 decks differ** (186 decks recorded in full; the other 107 decks' lines read `html-FN 0 gate-diff 0`, their JSON was lost when the sandbox restarted) | **293 of 293 identical** |
| Verified scan median, unminified, of 2,642 KB | 640 KB (186 decks) | 647 KB |
| Selector truth median | 605 KB (186 decks) | 612 KB |
| Verified scan cost in the page, median | 3.8 ms | 9 ms |

The Chromium run was interrupted twice by sandbox restarts and finished in chunks (`107 + 186` decks); the
WebKit run in eight chunks. A harness bug found on the way: the baseline render went through the default
pipeline while the subset went through `-c <file>`, and `claim.md`, `adaptive-image.md` and
`chart-hue-collapse*.md` differed with no module missing. The first fix rendered the baseline through a `-c` copy
of `dist/lattice.css` too. **That hid the cause instead of removing it, and the second fix does** (2026-10-19,
followup P8): the engine masks a slide-own `::after { content }` (`isPaginationTarget`, `lib/engine/css.js`)
by reading the selector's SPELLING. On the minified text the default render ships, `:is(.chart-frame,.big-number)`
has no space and the mask fires. On the source spelling, `:is(.chart-frame, .big-number)` has one, the regex
for "a slide's own pseudo" reads it as a descendant, and `content: none` stays live. So `-c <any unminified
file>` was never the default path, and `-c <copy of dist/lattice-min.css>` is: its render is byte-identical to the
default one (pinned by `test/unit/tools/style-subset-default-path.test.js`). The audit now renders the baseline
with no `-c` at all and feeds each subset as the **minified** modules (`dist/styles-min/`), which the harness
checks join back into `dist/lattice-min.css` before it starts. All three decks are identical, in Chromium, on the
real default path. The spelling-sensitive mask is a defect of its own, off this path, logged as a followup.
iOS Safari is still UNVERIFIED.

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
(all 293 decks each); iOS Safari is UNVERIFIED.

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
- **Index shape: decided by measurement (2026-10-19), §11.** The token-only index ships (14 KB gzipped after
  dropping subsumed alternatives); the verified index (77 KB gzipped) costs more than the bytes it saves.
- **Unify the state-pseudo lists.** `tools/style-needs.js` and `lib/export/player-prune.js` each keep one;
  the core must not import the export pipeline, so the shared piece belongs in a generic kernel (E4).
- **WebKit** now runs in full (293 decks, 0 misses); only iOS Safari on a real device is open (followup P7).
- **Built, opt-in:** E3, the Playground loader (§11). **Not built:** E4 (the generic core and a second
  domain), E5 (integrations and export bytes, which need the owner's dark and light sign-off).

## 9. Next

*(Superseded by §11 for E3, which is built.)* E3 (the Playground loader prototype: first-slide bytes and time against the §2 baseline, cold and warm,
Chromium and WebKit, no flash of unstyled content, and a late-appearing unit loading its modules before it
shows) and the three regrouping moves in §7, in that order of value. Both wait for the owner's review of E1
and E2. E3 is a style sink (HARD RULE #22) and gets the adversarial trio on its final shape.

## 10. Package size, measured once (2026-10-18)

The followup `2780-p3-slim-the-package-tarball.md` rests on these figures. They are one-off measurements,
not a committed benchmark; re-derive them with the method below before acting on them.

- **What an install is.** `npm pack --dry-run --json --ignore-scripts` (read the JSON after the `prepare`
  build output): 24,134,209 bytes gzipped, 80,084,014 unpacked, 1,670 files, on the base before the module
  folders landed. On the base with `dist/styles/` and `dist/styles-min/` (187 modules), an independent
  re-run read 24.80 MB gzipped and 82.45 MB unpacked, with 376 files under `dist/styles*`. The folders add
  about 0.94 MB gzipped. `dist/` is 76 MB on disk, but `marp-kit/`, `agent-kit/` and `engineering/` are
  excluded by `package.json` `files`, so that figure is not what an install downloads.
- **Minify everything minifiable.** For each file in the pack list: JS and CSS through `esbuild` `minify`
  (legal comments dropped, which a real build must not do; the AGPL headers stay), JSON compacted, then
  gzip level 9, summed per file. Today's files sum to 25.5 MB gzipped on this method (the real tarball
  gzips as one stream and is 24.1 MB); minified they sum to 12.9 MB. The gain sits in `dist/lattice.js`
  (21.3 MB to 3.2 MB raw, 6.3 MB to 1.1 MB gzipped) and `dist/lattice-runtime.js` (9.6 MB to 1.2 MB raw,
  2.8 MB to 0.4 MB gzipped). The minified CLI was not run, so its correctness is untested.
- **Exact duplicates.** Files over 20 KB with identical bytes: the KaTeX woff2 set stored in `dist/fonts`,
  `lib/plugins/math/vendor/katex/fonts` and `lib/plugins/mermaid/vendor/mermaid-cli/assets`; and
  `jetbrains-400/500/600`, `outfit-300/500/600`, `playfair-400/700` and `playfair-italic-400/700` under
  different weight names. Mermaid ships three bundles (`mermaid.min.js`, `mermaid-zenuml.min.js`, and the
  CLI asset bundle) and Font Awesome in both TTF and woff2. Estimated 3 to 4 MB gzipped together; whether
  each is used is not checked.
- **Audit time.** `node tools/style-needs-audit.mjs --all --jobs 3` took about 95 minutes for 281 decks in
  Chromium on a 4-core sandbox, with the computed-style gate on. The WebKit run of 293 decks took about 90
  minutes in chunks of 40 decks.

## 11. E3: the Playground loader (2026-10-19)

**Status: built, gated, opt-in.** `/playground/?styles=modules` loads only the style modules a deck uses.
Without the parameter the Playground registers the whole `lattice.css`, as it always did. The default stays
whole on the evidence below; flipping it is one line (`loaderOn` in `docs/src/lib/playground-engine.ts`).

**How it works.** `docs/src/lib/style-loader.ts` fetches `styles/needs.json` (the index) and a **floor**
(the 13 always-needed modules plus the 44 that at least 70% of the 292 example decks need,
`tools/style-needs-common.json`), starting in parallel with the engine bundle. The bridge
(`playground-engine.ts renderInto`) renders, scans the rendered HTML (`lib/core/style-needs-scan.mjs`, one
copy shared with the audit), fetches the modules still missing, re-registers the `lattice` base, and takes the
new sheet by rendering again (the second render costs 200 to 500 ms on a heavy deck). An engine hook that
recomposed the sheet alone (`render().restyle()`, 30 to 70 ms, about 70 bytes of engine JS) was built and
measured, then removed: `getting-started` sits within 20 bytes of its `engineJsGz` ceiling, and raising a ceiling is
the owner's call (followup 2794-p5).
Past 55% of the sheet's bytes the loader answers "whole" and the host loads the whole file. Every module passes
`sanitizeStyleText` on arrival (HARD RULE #22), and the composed sheet reaches the frame only through
`docStyleText`, which sanitizes it again. Four **fallbacks never raise an error**: a failed index, a failed
module, and a failed whole-sheet fetch all keep drawing with what is loaded; an idle backstop (4 s after the
first render) fetches the whole sheet and makes it the base, so a module no scan could name heals, and a tab
that outlives a deploy has a complete sheet in memory.

**The shared slot.** The engine has ONE `lattice` slot and every consumer on the page renders against whatever
is in it. `theme-fetch.ts` therefore tracks `baseMode` (`none | subset | full`) and a `baseVersion`: a consumer
with no loader always gets the whole sheet; a whole sheet is never replaced by a subset; and a render hands
`growBase` the version it began under, which answers true when the base moved while it waited (the independent
checker found the case where it did not: a whole sheet landing mid-fetch left the frame painted with the
floor's sheet; two regression tests pin it).

**Measured (production build, Chromium 131, loopback, 5 runs, medians, idle machine).**
`docs/scripts/style-loader-bench.mjs`; "styled" means the first slide's computed `container-type` is `size`.

| Deck | Style bytes on the wire | Cold, first styled slide | Warm |
|---|---|---|---|
| `focus.md` (14 slides) | 116 KB in 1 request, then **62 KB in 57** | 1835 → **1590 ms** | 1543 → **1140 ms** |
| `claim.md` | 116 KB, then **65 KB in 57** | 1681 → **1629 ms** | 1437 → **1231 ms** |
| `system-design-foundations.md` | 116 KB, then **93 KB in 78** | 2741 → 2843 ms (noise) | 2449 → 2348 ms |

Bytes fall 45% on a typical deck and 20% on a heavy one; time is flat to 25% better, and on loopback bytes are
nearly free, so the unthrottled column understates the win on a slow link. **Not measured:** a throttled run
(`--throttle cable|4g` exists and was not run before the review), WebKit timing, the gallery deck (the
benchmark died on it twice; the loader loads the whole sheet there by design, and a loaded-machine run read
209 to 230 KB on the wire against 116), a real phone.

**Gate.** `tools/style-loader-gate.mjs` loads the real Playground twice (whole sheet, loader), reads the sheet
each frame built, and compares every element's computed style plus `::before` and `::after` in screen, print
and dark, whole vs loader, on the static page and on the LIVE frame (the slides after the host's split and the
runtime, read until two fingerprints in a row agree, with a second whole-sheet session as the noise floor).
**Final build, all 294 decks (293 examples plus the gallery): Chromium 294 of 294 identical; WebKit 293 of 294
identical, and the one that differed, `anima-scene`, is an animated scene: it differed on 1 of 3 re-runs, one
element in 107, with no rule missing from the loader's sheet (a rule diff of the two frames is empty).** Real
bugs the gate found along the way, each now pinned by a test that fails without the fix: the progress rail and
other markup the runtime writes from HTML strings (`dark-canvas-ownership.md`: 9 diffs), function-plot's
browser-built classes (`plugin-system-phase-b.md`: 149 diffs), and a font face only a `lattice.css` module
defines that a palette names (`accent-on-accent.md`).

**Timing and bytes, `docs/scripts/style-loader-bench.mjs`, median of 3, first slide styled** (the local server
is HTTP/1.1, so the 68 requests queue six at a time):

| engine, network | deck | whole sheet | loader |
|---|---|---|---|
| Chromium, none | focus (14 slides) | 116 KB wire, 1167 ms | 70 KB wire in 68 requests, 1075 ms |
| Chromium, cable | focus | 3977 ms | 3759 ms |
| Chromium, 4g | focus | 11429 ms | 12251 ms |
| Chromium, none | gallery (120 slides) | 116 KB, 1927 ms | 181 KB in 59 requests, 2106 ms |
| WebKit, none | focus | 116 KB, 1620 ms | 71 KB, 1552 ms |
| WebKit, none | gallery | 116 KB, 2740 ms | 182 KB, 2964 ms |

**Read this honestly.** The loader cuts first-slide bytes by about 40% on a typical deck and is level on time on a
fast link; on a throttled link it is slightly slower, because round trips cost more than the bytes saved. A deck
that needs most of the sheet (the gallery) loads the floor, then the whole sheet, and pays for both (181 KB
against 116). The 4 s backstop also fetches the whole sheet after the first render, so a session that stays
longer than that has downloaded both; the saving is on the critical path, not in total bytes. Production serves
over h2, where 68 small requests multiplex, so the throttled rows are a worst case; that is UNVERIFIED here
(`astro preview` is HTTP/1.1). A warm reload re-validated every module (68 network hits) on this server; the
immutable cache headers in `docs/public/_headers` are what production relies on, also UNVERIFIED here.

**What the reviews found (HARD RULE #25), and what changed.**

1. *The runtime-token list was hand-kept and wrong.* The runtime toggles `.overflow` on a slide that
   overflows, and the rule that draws the author's red outline lives in an on-demand module; with the loader
   the outline was gone. The gate could not see it: it compares a static page with no runtime. The list is now
   **derived from the source** that writes the tokens (`tools/style-needs-lattice.js derivedRuntimeTokens`),
   kept only where a module keys on the name, and a unit test pins `.overflow`. A token built at run time from
   a variable stays invisible to it, so the live-frame comparison is still owed (below).
2. *Default-on was not supported* (inversion): first visitors take the newcomer bake, which carries the whole
   sheet, so the bytes never help the visitor they matter most for; the gain is a returning visitor's first
   paint. That is why the loader is opt-in.
3. *An offline tab or one that outlives a deploy raised a render error on every edit that needed a module.*
   Now non-fatal, plus the backstop above.
4. *Measurement flattery:* both harnesses seed `localStorage` (so the newcomer path never runs) and block the
   service worker. Stated here, not fixed.

**Still owed before the default can flip:** a timing table over h2 (or a bundled floor file, which turns 68
requests into a few), a real-iPhone check (followup P7, still UNVERIFIED), a measurement of the per-keystroke
scan on a phone (3.6 ms for 14 slides and 23 ms for 120 on desktop Chromium; 5 and 42 ms on desktop WebKit), and
a cheaper way to load heavy decks than floor-then-whole. The loader stays opt-in (`?styles=modules`).

**Smaller facts.** The token index is 14 KB gzipped, from 33 KB, by dropping every alternative another
alternative of the same module is a subset of (exact for "any alternative met"; 5,802 alternatives to 1,735).
The floor costs no bytes for most decks: over 292 decks the median deck loads 243 KB minified with the floor
and with the always-needed set alone, and waits for 5 modules after the first render instead of 43. The route
budget: `playground` eager JS +2,061 bytes (declared +2,200 in `docs/route-budget.d/`). The engine's content
mask reads selector spelling (`isPaginationTarget`): the minified text the default render ships is masked,
the source spelling is not, so a `-c` file of unminified CSS differs from the default render; logged as a
followup.

