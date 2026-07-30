---
status: shipped
summary: The Export-to-Marp bundle shipped a deck that rendered wrong, and had for a long time. Rendering examples/bloom-engineering-journey.md through the bundle with real marp-cli surfaced four independent defects (a fifth, the auto-glossary's generated slide going MISSING from the export entirely, came out of asking the same question of every other transform) — escaped runtime <script> tags (marp-core defaults to html:false), ~835 CSS rules dead to marp-core's selector scoper (a leading `:is(section.x, figure.x)` head scopes to a slide-inside-a-slide), no bundled fonts (stylesheet-relative `url(fonts/…)` with no directory), and two transforms with no live-DOM mirror (premise, matrixGridCells). All four fixed. Root cause underneath all four: NOTHING on our side ever rendered the bundle, so every claim about it was inference. Whether the marp-vscode PREVIEW pane executes the deck's scripts is UNVERIFIED from this environment and is NOT settled: this note originally asserted it does not (repeating gotchas.md), but the field report that opened the follow-up describes structural components rendering correctly there, which would require the runtime to run. Treat the CSS-only framing as an unconfirmed reading of the extension's behavior, not a finding.
---

# Export to Marp was broken, and nothing would have told us

**Ask:** "we broke ability to export our deck and support marp? look at what
bloom journey deck produces. I should be able to take the lattice.css,
lattice-runtime.js and indaco.css and get things working in vscode preview."

## TL;DR

The export was not *recently* broken — it was broken in four independent ways,
each of which had been shipping. The reason none of them was caught is
structural and worth more than the four fixes: **`engineering/marp-independence.md`
calls Export-to-Marp "the boundary that's clean" because "it never runs on our
side," and treats never running it as a reason there's no cost line.** Never
running it is exactly why four defects accumulated. A handoff nobody exercises
is not verified; it is unobserved.

The method that found all four in an afternoon: export the deck, install
marp-cli, render it, and *look at the pages* beside the engine's own PDF.

## What the bloom deck actually produced

| Slide | Engine render | Through the bundle, before the fix |
|---|---|---|
| 1 title | correct | correct, but system serif — Playfair never loaded |
| 3 premise | claim + 6-row ledger | loose `<h2>`, collapsed ordinal rail, overflow badge |
| 4–9 split-panel | two-zone panel + cards | flat markdown in undifferentiated columns |
| 11 matrix-grid | swatch grid + rotated axes | literal `[x]` / `[-]` / `[ ]` text in a bare table |
| 13 closing | correct | plus a visible `<script src="lattice-runtime.min.js"></script>` |

## The four defects

### 1. marp-core escapes raw HTML, so the runtime never loaded

`marp-core` defaults to `html: false`, which **escapes** raw HTML rather than
dropping it. The two `<script>` tags `withRuntimeScripts` appends to every
exported deck therefore came out the far end as visible text on the last slide,
and `lattice-runtime.min.js` was never fetched. Every transform-driven component
— split panels, the chart family, Mermaid — rendered as bare markdown.

The owned engine parses with `html: true` (`lib/engine/index.js`), so this was
invisible on our own path. Fix: the generated `marp.config.cjs` sets
`html: true`, the generated `.vscode/settings.json` sets
`markdown.marp.enableHtml`, and the repo's own `.vscode/settings.json` does too
(it had the same gap, so `examples/gallery-jargon.md`'s runtime `<script>` tag
had presumably never loaded in preview either).

**The payoff was bigger than expected.** With `html: true`, marp-cli's `--pdf`
and `--html` routes are *full fidelity* — marp-cli drives a real headless
browser, so the runtime executes during the render. The generated README had
been telling recipients the opposite ("It does **not** run the
Mermaid/component runtime").

### 2. ~835 CSS rules were dead to marp-core's selector scoper

Marpit scopes a theme rule off its **leftmost compound**: a literal leading
`section` IS the slide and is root-replaced; anything else is treated as a slide
**descendant** and prefixed. Lattice's dual-surface head —

```css
:is(section.map, figure.chart-frame) .map-region { … }
```

— is not a literal `section`, so marp-core emitted
`div#… > section :is(section.map, …) .map-region`: a slide nested inside a
slide, which cannot exist. Measured on the bloom render: **913 dead selectors**,
of which **835 are real** (the rest are legitimate `:is(h1, marp-h1)` heads),
spread across 518 declaration blocks. *(The "913" figure could not be reproduced
under any later measurement and should be read as 862 all-in / 835 real.)* Two
populations: the chart bucket (matrix-grid, roadmap, gantt, kanban, radar,
quadrant, funnel, piechart, progress, map, timeline-list, word-cloud), and **465
`:is(section, figure)` selectors across 199 rules over MERMAID diagram
internals** — first written up here as a "466-rule Form layer", which is wrong on
both the count and the name. The Mermaid half is invisible until a deck has a
diagram, which is why the surviving symptom looked chart-only.

We already knew this bug. `lib/engine/css.js` has carried a fix since someone
hit it on the owned path (the comment names the symptom: "`--map-base` is never
defined, and every map/quadrant/radar fill that reads it falls to SVG's black
initial value"). Nobody connected it to the export, because nobody rendered the
export.

Fix: the distribution moved to a shared kernel (`lib/core/leading-is.js`) that
`lib/engine/css.js` now imports, and `marpScopableCss` in `lib/core/marp-bundle.js`
applies it to every stylesheet the bundle ships.

> **SUPERSEDED 2026-07-29.** This section originally added *"`dist/lattice.min.css`
> is untouched for every other consumer — the rewrite happens at export time."*
> Export-time-only was the wrong layer: it left the manual marp-vscode recipe
> (themes pointed straight at `dist/lattice.css`) fully broken. The distribution
> now runs in `tools/build-css.js` `bundle()`, so **every** stylesheet `dist/`
> ships is distributed, and the min sheet grows ~3.0%.

`:where()` heads are deliberately left alone. Distributing them wouldn't help
(a `:where(section…)` arm is still not a literal leading `section`), and
unwrapping them would change the zero specificity they are chosen for.

### 3. No fonts shipped

`lattice.css`'s `@font-face` srcs are stylesheet-relative `url(fonts/<file>.woff2)`
— correct for the npm package, where `dist/fonts/` sits beside `dist/lattice.css`.
The bundle shipped the stylesheet and not the directory, so all 37 faces 404'd
and every slide fell back to system serif/sans. marp-cli even warns about it
("Some of the local files are missing and will be ignored"); nobody was reading
that output because nobody was running it.

Fix: `fontAssetsFor(latticeCss)` derives the supply by reading the `url(fonts/…)`
refs back **out of the stylesheet the bundle carries**. That is the one source
that cannot drift from what the CSS asks for — add a face, drop a face, or bump
KaTeX, and the supply follows with no second list to update. Both producers use
it; the docs site stages `export/fonts/` so the in-browser export ships the same
bytes as the CLI.

### 4. Engine-only transforms never ran on the Marp route

`premise` and `matrixGridCells` ran only on the engine's render path, so on any
Marp surface a premise slide lost its claim grouping (ledger collapsed, overflow
probe tripped) and a matrix-grid printed raw bracket markers. `matrixGridCells`
was the one row in `gotchas.md`'s "Known preview gaps" register; `premise` was
never logged at all, which is that register's documented failure mode.

Fix: both mirrored through shared kernels — `lib/core/premise.js` `applyToDom`,
and the new `lib/core/matrix-grid-cells.js` (which the markdown-it plugin now
also uses, replacing its inline copy).

**Then the same question was asked of every other transform, and it found a
third — worse — case.** Every registry transformer now has a DOM adapter (17/17;
`premise` was the last hole), but the markdown-it PLUGINS are a separate
population, and the **auto-glossary** was not merely unstyled in the export: the
generated slide was **missing entirely** (6 pages against the engine's 7), while
the slide before it still read "The next slide is generated — you didn't write
it." Two distinct causes stacked:

- `appendAutoGlossary` is a SOURCE transform — it appends a slide and strips its
  own trigger — and `lattice-emulator.js` + `docs/src/lib/render-engine.ts` both
  run it, but neither export producer did. Its own doc comment says "the
  CLI/export builds `rawMd` through it," which was true of the CLI and never of
  the export. Now baked exactly like splits (`appendAutoGlossary` then
  `bakeSplits`, in both producers), so the emitted `.md` is self-contained and
  still editable by the recipient.
- `glossaryListToTable` + `glossaryRange` then rendered it as a bare bullet list
  with no table, headers, or `A – N` pill. Mirrored through the new shared
  kernel `lib/core/glossary-slide.js`.

Checked: heading-period normalization is CLEAN (not applied by default, so
nothing to mirror).

> **CORRECTED 2026-07-29.** `animaSceneFences` was recorded here as "clean —
> renders identically." It is not. That check compared page count and one slide;
> a full render shows **three raw JSON code blocks** on the `scene` slides of the
> exported deck that the engine render does not emit (engine: 0 `language-anima`
> nodes; export: 3 visible). `functionplot` fences fail the same way — a visible
> code block, never a plot, because `function-plot.js` is not in `STATIC_ASSETS`.
> Math also falls back to marp-core's MathJax rather than Lattice's KaTeX. All
> three are PRE-EXISTING (fences were never handled on any Marp surface) — but
> the "clean" claim was new, and wrong, and it is exactly the shape of error this
> note exists to warn about: verifying the cheap thing and writing up the
> expensive one.

The cheap guard that would have caught the missing slide is now a test:
`export-marp.test.js` asserts the exported deck's slide count matches what the
CLI renders. A page-count diff is the single highest-yield export check there
is, and it costs nothing.

### 4b. …and one more drift the same investigation surfaced

Which layouts lift a slot label was maintained **twice** — a class regex in the
markdown-it plugin, a selector string in `lib/runtime/index.js`. The runtime's
copy had fallen behind: `premise` and `q-and-a` were added to the plugin only.
So even after the premise mirror landed, the ledger's row terms rendered without
their corner tag. Both now derive from `lib/core/slot-label-lift.js`, with a
parity test that fails if either re-lists the layouts inline.

### 4c. …and three more the follow-up closed

Small, and all found by asking the same question of the same code rather than by a
new report:

- **The glossary slide's descendant-table guard.** Both halves of the DOM mirror
  asked "does this section hold ANY `table`?" — so a glossary slide carrying an
  unrelated table (a source note) skipped the list→table conversion entirely AND
  drew its range pill from that table's first column: a pill reading `X` where the
  engine, whose own range rule only ever reads the table IT generated, read `A`.
  Both now key on the `Term` / `Definition` header row, which is the only thing
  that identifies a generated table without changing the markup. The mirror also
  converts EVERY top-level list, as the token path does, and reads the last table
  for the pill, as the token path does.
- **The generated `npm run pdf` interpolated the raw deck title.** Exporting
  `Q3 Board Review.md` wrote a bundle whose only documented render command was
  `marp Q3 Board Review.md …` — three arguments to marp-cli, none of which exists.
  Every path in the bundle now uses the sanitized slug; prose keeps the real title.
- **`cellHtml` did not escape its label.** The label is the concatenated
  `.content` of a cell's inline children — decoded source text, which markdown-it
  would have escaped on its own way out. Handing it to an `html_inline` token
  skipped that, so `[x] Fees & Duties` emitted a bare `&` and `[x] <b>Tier 1</b>`
  turned author text into live markup on the engine while the DOM mirror kept it
  text. Escaping is what makes the two paths agree.

Two pre-existing, off-path duplications were left where they are rather than pulled
into the diff (HARD RULE #18): `docs/src/playground/drawing-board-export.js` keeps
its own copy of `safeName` (it is called from PDF/PPTX paths that have no access to
the playground's marp namespace), and `stripComments` exists three times over
(`lib/engine/css.js`, `lib/layout/gate.js`, `tools/check-ownership.js`) — the
browser-safe fourth caller now shares `lib/core/leading-is.js`'s comment walk
instead of adding a fifth.

## Deck-wide front-matter registers — deferred here, FIXED in the follow-up

A fifth family, found while producing the light/dark artifacts for export
sign-off, and left for its own change (HARD RULE #17):

`color-mode: dark` renders dark on the engine and **light** through the export's
`npm run pdf`. Deck-wide front-matter axes (`color-mode:`, `class:`, `logo:`,
`meta:`) have no Marp equivalent, so the runtime recovers them by FETCHING the
deck's source `.md` from beside the rendered document.

> **CORRECTED 2026-07-29, after the adversarial trio.** The original text here
> read: *"Verified: that fetch resolves when you open the exported `<name>.html`
> — every section correctly carries `dark`."* **That was false, and the way it
> was produced is the point.** The artifact came from a headless Chrome launched
> with `--allow-file-access-from-files` — a non-default flag no recipient has.
> Re-run on the real surface, a recipient double-clicking the file:
>
> | | sections with `.dark` |
> |---|---|
> | `file://`, default flags | **0** |
> | `file://`, `--allow-file-access-from-files` | 13 |
>
> Chrome: *"Access to fetch at 'file:///…/deck.md' from origin 'null' has been
> blocked by CORS policy."* `fetch` does not work on `file://` in any modern
> browser — not intermittently, never. This is a HARD RULE #23 violation
> committed in the same document that argues for #23: the claim named one
> surface and the artifact came from another.

**The diagnosis was also wrong, which matters more than the miss.** This is not
a marp-cli PDF quirk — it is the `file://` scheme, so the **HTML route fails
identically**, and the generated README's *"opens standalone in any browser —
same scripts, same result, no install"* (`lib/core/marp-bundle.js`) is false for
the double-click case it is describing.

The fix is therefore bigger than first written. Baking the color axis into a
Marp-native global `class:` directive covers `color-mode` and `class` — **two of
four**. `logo:` and `meta:` carry payloads a class cannot express.

> **RESOLVED in the follow-up (2026-07-29).** All four axes, and the whole
> finish / mode / claim / stamp / tone / spectrum / rule / eyebrow / headline /
> lift family with them, by taking the network out of the path rather than
> translating axis by axis: the export BAKES the deck's front matter into the
> document as an inert `<script type="application/lattice-front-matter">` block,
> and the runtime reads it from the DOM (`lib/core/deck-front-matter.js`). The
> payload is the raw YAML, so the runtime's existing readers parse the same string
> they used to fetch — one grammar, no second format. The block is REMOVED once
> read — hygiene, so a consumed snapshot doesn't linger where something may copy,
> serialize, or sanitize it, and so it can't be read twice. (An earlier draft called
> removal a LAYOUT requirement — "an inert zero-height element still takes a `gap`
> in a flex column." That was wrong, and is worth recording as wrong: a `<script>`
> is `display:none`, and a measured flex column with `gap:40px` is 80px tall with or
> without one. The removal is still right; the reason given for it was not.) The
> fetch survives as the fallback for a document that predates the bake.
>
> Re-measured on the surface that failed, a `file://` open with default Chrome
> flags: **0 → 10 of 10** sections carrying the deck's color mode, the logo
> injected on the title slide, and the masthead meta filled. The front-matter
> `logo:` asset is now localized into the bundle too — it never was, so the
> register working would have pointed at a file that wasn't there.
>
> The generated README's *"opens standalone in any browser — same scripts, same
> result"* was false for the double-click case; it is now true for it, and the
> sentence says what a recipient does instead of claiming an equivalence.
>
> **Page-by-page against the engine's own PDF** — `examples/marp-export-fidelity.md`
> (7 pages), both rendered and rasterized at 100 DPI. Differing pixels per page:
> 325 / 51 791 / 50 905 / 0 / 3 504 / 8 803 / 42 out of 1 000 500.
>
> **CORRECTED after the trio.** The first version of this paragraph read *"every one
> of those deltas is the atrium finish's 9 %-alpha hairline gradient, not content —
> the TEXT is pixel-identical on every page."* That is false on two of the seven
> pages, and it contradicted this same document two sections above:
>
> | page | what differs |
> |---|---|
> | 1, 2, 3, 4, 7 | only the atrium finish's hairline gradient — text pixel-identical |
> | **5 (math)** | **content** — KaTeX vs MathJax: different glyph metrics AND position |
> | **6 (functionplot)** | **content** — a plotted curve vs the literal JSON config |
>
> Pages 5 and 6 are the two `unmirrored` gaps the ledger lists; of course they
> differ. Writing "text is pixel-identical on every page" over a measurement that
> includes them is the HARD RULE #23 failure mode this note exists to warn about —
> a real artifact produced, then described as showing something it does not show.
>
> On the five pages where parity IS the claim, it holds, and the finish's computed
> geometry (`background-size`, `background-position`, the gradient, the box) is
> byte-identical between the two documents — two Chrome print pipelines landing a
> hairline `repeating-linear-gradient` on different subpixel phases. Page 4 happens
> to agree exactly. Worth knowing, not worth chasing: the deck-wide finish did not
> render in an export AT ALL before this change.
>
> The `0 → 10 of 10` figure above is a DIFFERENT deck — a 10-slide scratch probe
> built to exercise all four register axes at once. Two numbers, two decks, named.

## What we did NOT fix (can't): the marp-vscode preview pane

The ask named the VS Code preview specifically. It cannot be made to work, and
the honest answer is a ceiling, not a bug:

- marp-vscode renders with raw marp-core and has no engine extension point, so
  it never runs Lattice's markdown-it plugins.
- Its webview CSP does not execute the deck's `<script>` tags, so the runtime
  can't cover for that either.

Both halves have to work for a transform to appear, and neither does. The
preview shows **palette, typography, and every CSS-driven layout** — which is
genuinely useful for drafting — and nothing the runtime composes. `enableHtml`
is still necessary (without it the `<script>` tags print as text) but not
sufficient.

`gotchas.md` previously claimed the opposite, via a mitigation note asserting
structural transforms "run at build time — before the webview CSP applies."
That is wrong for any Marp surface: there is no build-time pass to be early for,
because marp-core never runs our plugins. That single wrong sentence is the most
plausible reason the export README promised fidelity it never delivered. It's
corrected in place.

**Not verified from here:** everything above about the preview PANE is read off
marp-vscode's documented behavior and this repo's own prior notes, not observed
— there is no VS Code in this sandbox. Every claim about marp-**cli** rendering
IS verified: bundles exported, rendered to PDF with `@marp-team/marp-cli` 4.5.0,
rasterized, and compared page by page against the engine's own PDF.

## The lesson worth keeping

Three of the four defects were **visible in the first render** and none was
subtle. What was missing was not skill or care; it was the render. A one-way
handoff with no consumer on our side accrues defects at exactly the rate
upstream changes, and reports zero.

### The follow-up's answer to "what stops the fourth instance?"

Fixing three missing mirrors does not stop the next one. Nothing forced a NEW
markdown-it plugin to say whether the export covers it, and the export's own
README was free to keep promising fidelity either way. So the classification is
now DATA — `lib/core/marp-fidelity.js`, one entry per plugin, each `baked` /
`mirrored` / `unmirrored` / `moot` — and two things read it:

- `test/unit/core/marp-fidelity.test.js` fails when a plugin is added without a
  verdict, when an entry outlives its plugin, and when a `mirrored` claim names a
  symbol the runtime never calls (the two ways a coverage claim could be
  aspirational rather than true).
- the generated bundle README prints the `unmirrored` rows, so a gap cannot be
  quietly dropped from the docs while staying in the code.

Six gaps came out of that classification, every one observed on a real marp-cli
render rather than read off the source: `_focusSteps` (stays one slide instead of
N), `no-period` / `with-period` headings, `functionplot` and `anima` fences (each
degrades to a code block showing its JSON), and math (typesets with MathJax, not
KaTeX). The README's heading no longer calls that route "full fidelity".

## What the adversarial trio found in the fix itself

The follow-up went through red team + Munger inversion + independent checker
(HARD RULE #25) before merge. They found nine things; six were defects the change
had introduced, and the two most serious were invisible from the diff.

**1. Removing the network removed an accidental guard (red team, HIGH).** The
runtime's ~20 front-matter readers are `/^\s*<key>:\s*…$/m`, and `\s` matches
newlines — so on an N-byte whitespace run each is O(N²). That never mattered on the
export surface because the readers only ran after a SUCCESSFUL fetch, and the fetch
always failed over `file://`. Baking the front matter made them reachable. Measured
against the real bundled runtime in a `file://` document:

| front matter | before the fix | after bounding the readers |
|---|---|---|
| 128 KB | **8.1 s** blocked | 0.2 s |
| 512 KB | **131 s** blocked | 0.2 s |

Attacker-authorable (a long run of blank lines is valid YAML), silent, and it hits
`npm run pdf` too, since marp-cli runs the runtime in headless Chrome.

**The first fix was incomplete, and CodeQL caught the remainder.** Bounding `\s` to
`[ \t]` removed the NEWLINE dimension — the multiline blowup — but left a
single-line ambiguity: `[ \t]*`, the lazy `(.*?)`, and the trailing `[ \t]*$` can
all match the same tab, so `logo:` followed by a long tab run still made the engine
try every split. Five HIGH alerts, correctly.

The readers whose value class already excluded spaces and quotes
(`([A-Za-z0-9_-]+)`, `(-?[\d.]+)`) were never ambiguous and are unchanged. The ten
that used `(.*?)` now go through `lib/core/front-matter-key.js`
`frontMatterValue(fm, key)`, which uses the shape `lib/core/chart-narration.js` had
already adopted and documented for this exact reason: one GREEDY `(.*)` to
end-of-line, which cannot fail and so never backtracks, then trim and unquote in JS
where both are linear. A 512 KB tab run reads in 0 ms, and the two independent
single-character quote strips reproduce the old `["']?…["']?` behavior exactly,
including its odd `a "b"` → `a "b` case.

`lib/authoring/lint-core.js` has the same original shape and is NOT in the runtime
bundle; it is off this path and left as a tracked follow-up.

**2. The snapshot silently overrode the file it sits in (all three, independently).**
The block wins over the front matter it was copied from, and the bundle's own
`AGENTS.md` says *"Edit this file; re-render."* So a recipient who changed
`color-mode: dark` to `light` and re-rendered got a dark deck — the same silent
wrong render this mechanism exists to fix, arriving through the edit path.
Compounding it, `withRuntimeScripts` was not idempotent: a re-export stacked a
SECOND block and the reader took the FIRST, so a re-export was read through the
stalest snapshot in the file. Fixed three ways: the bake now REPLACES an existing
block (and the duplicated runtime tags, which had always duplicated), the reader
takes the LAST block and removes them all, and the emitted deck carries a generated
comment plus a README section saying front-matter edits need a re-export.

The deeper tension is real and is not "fixed": the front matter now lives in two
places, and the snapshot is authoritative for every key Marp doesn't consume. The
alternative that would eliminate it — strip the Lattice-only keys from the visible
front matter so each key has exactly one home — costs the deck's round-trip back
into Lattice and needs a keys-Marp-consumes allowlist that can rot. Not taken.
Inversion's other suggestion, baking the deck-wide token set into each slide's own
`_class:` directive, would additionally work in the marp-vscode preview pane (no
script execution needed) but cannot express `logo:`/`meta:` payloads; it remains
available as an ADDITION, which is the main reason the current shape is not a fork.

**3. A seventh unmirrored gap, found by taking inversion's prediction seriously.**
*(CLOSED in the follow-up — see §"The imagery gap, closed" below.)*
The completeness claim had been measured on two decks with zero `![bg]` and zero
Mermaid. Rendering an imagery-bucket slide through the bundle: the engine lifts
`![bg]` into a `.lattice-bg` panel and wraps the prose in `.image-text` (a
source-level transform, engine-only); Marp uses its own advanced-background
machinery instead, so the image goes full-bleed and the prose sits on top of it
UNSCRIMMED — the heading over a bright area is barely legible. That one does not
degrade gracefully. It is now a ledger row, the README's *"they degrade rather than
break"* is gone, and the universal *"everything else renders the same"* is now a
claim about what has been checked.

**4. The glossary fix had traded one disagreement for another (checker).** Keying
the DOM mirror on a `Term`/`Definition` header row fixed the "any table" bug but
introduced a new one: the token path's range rule accepted any raw-HTML
`html_block` table, so a deck with a raw `<table>` got engine `Z` and mirror
`A – N` where the two had previously agreed. The shipped test could not catch it,
because a markdown PIPE table is the one shape the token path already skipped. Both
paths now stamp and select a marker class (`lib/core/glossary-table-class.js`), so
neither reads a table it did not build — and an author's own table feeds neither.

**5. The CSS scanner's two layers disagreed about where strings are (checker).**
`eachCssSpan` split on comments without quote awareness, then handed fragments to a
quote-AWARE walk — so `content:"/* x */"` swallowed every boundary to the next
`*/` and silently disabled distribution for the rest of the file: dead rules, the
exact class this file exists to prevent. Rewritten as ONE state machine over typed
runs (`code` / `comment` / `string`). That also fixed a corruption the regex version
had shipped: `.a /* mid */ :is(x, y) .c` distributed as `.a /* mid */ x .c, y .c`,
dropping `.a` from every arm — it is not a leading `:is()` at all. And the 64 KB
prelude bound the old regex carried, which the first rewrite dropped, is back:
without it a crafted head amplified 80 KB into 171 MB, and 460 KB OOM'd a 512 MB
heap.

**6. Two crashes and an invisible file-copy channel in the new localizer (red team).**
`logo: assets/logo-50%.png` — an ordinary filename — threw `URIError` from
`decodeURI` and left a half-written bundle; `logo: .` threw `EISDIR`. Both are now
handled. And `logo: ../.ssh/id_rsa` copies that file into the bundle: the traversal
CLASS is pre-existing (a body `![](../../secret)` did the same) and confining it
would break this repo's own decks, which legitimately reach out of their directory —
but the summary said only "assets: 1", so an unexpected file was invisible. Every
copy now prints its resolved source path.

**7. The gate was narrower than the ledger claimed.** `definedPlugins()` matched
`function x(md)` and missed `function x(md, opts)` (the conventional markdown-it
signature), `function x (md)`, and `function x(state)`. It now detects plugins by
what they DO — a function whose body registers a rule — and a second gate covers
the wider door the checker found: a registry transformer that grows an `applyToHtml`
with no `applyToDom` is an export gap that needed no ledger row and tripped nothing.
The ledger header now states plainly what the gate does NOT cover (plugins outside
`plugins.js`, the engine's HTML-stage post-processors, and any divergence in the
other direction).

**8. `form: off` was a divergence in the OTHER direction.** The engine honors it;
the runtime ignored it, so a `form: off` deck exported to Marp came out WITH the
full Form chrome. `lib/forms/form-default.js` documented itself as front-matter-blind
"by design" — on a premise this change invalidated. Now honored from the baked front
matter (synchronously, since it must be known before the first stamp), and the false
rationale is corrected in place. The ledger has no vocabulary for reverse
divergences, which is itself worth remembering.

**9. Smaller, all fixed:** the browser producer baked a `logo:` path it cannot
carry (it has no filesystem), turning a silently-absent register into a visibly
broken image — it now passes `localAssets: false`; `readFrontMatterBlock` rejected
the trailing-whitespace fences Marpit accepts, so the block asserted the wrong
front matter for such a deck; and two comments described the CLI as if it were both
producers ("byte-identical deck", "prose keeps the deck's own title").

**What the trio verified and did NOT break:** the escaping (no payload can close
its own `<script>`, confirmed against `</SCRIPT>` and CDATA forms); DOMPurify strips
the block, so it cannot spoof a docs-site Studio preview (HARD RULE #22 holds); the
numeric logo fields reject CSS injection; `cellHtml` escaping breaks no shipped
deck; `safeName` leaves no raw-name path in either producer; and the headline
`0 → all` result reproduces independently, including the CORS message.

One thing the checker could not confirm and worth stating: whether the docs Studio
reuses a preview iframe across deck switches. If it does, the memoized
"no front matter here" answer could outlive a deck that has one. Unverified.

## The imagery gap, closed

Disclosing a gap is not fixing it, and this one was the worst of the seven: not a
graceful degradation but an unreadable slide. It closed the same way the glossary
did — by noticing that half of it is a SOURCE transform, which the export can bake.

Two halves, and the measurement that proves neither is sufficient:

| baked | mirrored | result on a Marp render |
|---|---|---|
| — | — | Marp's advanced-background machinery: photo FULL-BLEED, prose unscrimmed on top |
| `liftImageBgImages` | — | photo correct; prose scattered — eyebrow floating, heading over the canvas edge |
| `liftImageBgImages` | `wrapImageTextToDom` | **0 differing pixels** against the engine's own PDF |

The lift runs after localization, so the URL it embeds is the bundle's own
`assets/…` path rather than the author's — a panel pointing at a file the bundle
doesn't carry would have been the same class of defect as the un-localized `logo:`.

The DOM mirror needs two keep-outs the string version does not: `.image-scrim` and
`.backdrop`. Both are ordering artifacts rather than a difference of intent — on the
engine path the scrim is injected AFTER the fold and the backdrop after that, so
neither can be present; in the runtime the registry's scrim adapter and
`injectBackdrops()` both run BEFORE it. Folding the backdrop in would bury it and
break `section.finish > .backdrop`, which is precisely the hazard the engine avoids
by ordering alone (see the comment on `applyBackdropToHtml` in lib/engine/index.js).

**And a count that was wrong the whole time.** `marp-independence.md`, the
`gotchas.md` register row, and the exporter header all said "six enumerated
exceptions". They were written before the imagery gap was found, so all three shipped
at six while the ledger shipped seven — then closing imagery would have made six
right again by accident. A hardcoded count in prose beside a list that lives in code
drifts silently; all three now point at the ledger and name no number.

### …and what a checker found in THAT fix

The imagery fix went out for maker-checker only after being asked whether one had
run — it hadn't, and the rule (shared kernel + engine transform + multi-file) says it
should have. The checker found six defects in it, two of them regressions:

**A prose-less image slide grew a spurious white card, with the deck logo duplicated
behind it.** The fold answered "no prose → leave it alone" on pass 1, correctly. Then
`startOverflowWatcher()` — which runs AFTER the first transform pass — appended a
`.overflow-tab` reading "Overflows". Pass 2 found text, wrapped, and swept in
everything not on the keep-out list: the tab and `img.deck-logo`. Both owners guard on
their element being a DIRECT child, so both re-injected, and the logo's frame insets
then resolved against a `position:absolute` card instead of the slide.

Two fixes, and the second is the one that matters: the missing keep-outs were added,
AND the decision is now stamped on the section whether or not a panel was built. "No
prose" is only a safe answer while the DOM still looks the way it did on pass 1, and it
doesn't — so the stamp makes the whole class unreachable for the next injector nobody
remembers to list here.

**The runtime `<script src>` tags were being folded into the last slide's panel.**
`withRuntimeScripts` appends them at EOF, which makes them children of the LAST
section. On a deck ending with an image slide, one became the panel's `:last-child` and
took the `> :last-child { padding-bottom: 0 }` collapse away from the real content:
the panel measured 24px taller than the engine's and sat 24px higher. `script`, `style`
and `template` are keep-outs now; re-measured, both paths give an identical `589×149`
panel with `0px` padding on the heading.

**The bake was in the wrong place in the pipeline.** It ran after `bakeSplits`, but the
lift needs the `_class: …image…` comment and the `![bg]` in the SAME slide part. Once
heading boundaries are literal `---`, an image slide with TWO top-level headings has
its `_class` in one part and its `![bg]` in the next — so the lift skipped it silently
and Marp's advanced-background machinery took the image: precisely the defect the bake
exists to prevent, on a deck shape that is entirely ordinary. It now runs on the
UNSPLIT body, which is also exactly where the engine lifts.

**Three parity breaks, two of them in the STRING half.** `wrapImageText` pulled out
only the FIRST `.lattice-bg`, so a slide with two `![bg]` folded the second into the
panel — `:has(> .lattice-bg-left)` then stopped matching and the composition mirror
fired on one path and not the other, swapping panel and photo between renderers. It
also gated on `/\bimage\b/`, which matches `image-hero`, a class the CSS
(`section.image`) does not. And the DOM half counted a comment node as prose. All three
fixed on whichever side was wrong.

**`bgDiv` escaped `'` but not `"`.** `![bg](p.jpg "A caption")` — markdown's ordinary
optional title, which `BG_RE` captures as part of the URL — closed the `style`
attribute and got re-parsed as attributes. A crafted URL could add an `onerror`. The
title is now stripped (it was never part of the URL) and `"` / `<` / `>` are
percent-encoded alongside `'`. Pre-existing on the engine path, but this change bakes
the result into the file a recipient reads, so it is on-path.

**And the verification claim was too general.** "0 differing pixels vs the engine's own
PDF" was true of a deck the repo didn't contain, so nobody could reproduce it — and the
checker contradicted it on two ordinary shapes, both of which were the regressions
above. The probe deck is now a committed fixture,
`test/fixtures/image-bucket-parity.md`, and the measurement is **0 of 1 000 500 pixels
at 100 DPI** with the two regressions fixed. Where a `finish:` or an SVG asset is in
play the page still differs in the backdrop's hairline gradient and the SVG's
rasterization, as recorded above — so the claim is scoped to the fixture rather than
stated of imagery in general.

**Logged, pre-existing, off-path:** an `image spotlight` slide in a deck with a
`finish:` renders `.lattice-bg` at height **0** — the photo does not appear at all,
because `position` computes to `relative` instead of the base `absolute` so `inset: 0`
cannot size it. Measured identically on BOTH paths (`1280×0`, `position: relative`), so
cross-renderer parity holds and this change did not cause it; but it means the imagery
fix delivers no visible photo on that composition+finish combination.

### The lesson, restated

The cheapest durable guard is not a new gate — it is that
`marp-independence.md` no longer says "clean boundary" without also saying
"clean is not self-verifying," and `test/unit/tools/export-marp.test.js` now
asserts the three structural properties an eyeball would otherwise have to
catch: fonts present for every `url(fonts/…)` the bundled CSS references, no
stylesheet leading a rule with `:is(section…)`, and HTML enabled in both
generated configs. Those are cheap and they hold. They do not replace
occasionally exporting a real deck and looking at it.
