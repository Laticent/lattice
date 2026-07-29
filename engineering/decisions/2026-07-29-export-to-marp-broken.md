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
> they used to fetch — one grammar, no second format. The block is REMOVED before
> any transform measures the slide (an inert zero-height element still takes a
> `gap` in a flex column), and the fetch survives as the fallback for a document
> that predates the bake.
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
> **Page-by-page against the engine's own PDF**, same deck, both rendered and
> rasterized at 100 DPI: differing pixels per page were 325 / 51 791 / 50 905 / 0 /
> 3 504 / 8 803 / 42 out of 1 000 500. Every one of those deltas is the atrium
> finish's 9 %-alpha hairline gradient, not content — the TEXT is pixel-identical on
> every page, and the finish's computed geometry (`background-size`,
> `background-position`, the gradient itself, the box) is byte-identical between the
> two documents. Two different Chrome print pipelines land a hairline
> `repeating-linear-gradient` on different subpixel phases; page 4 happens to agree.
> Worth knowing, not worth chasing: the deck-wide finish did not render in an
> export AT ALL before this change.

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

### The lesson, restated

The cheapest durable guard is not a new gate — it is that
`marp-independence.md` no longer says "clean boundary" without also saying
"clean is not self-verifying," and `test/unit/tools/export-marp.test.js` now
asserts the three structural properties an eyeball would otherwise have to
catch: fonts present for every `url(fonts/…)` the bundled CSS references, no
stylesheet leading a rule with `:is(section…)`, and HTML enabled in both
generated configs. Those are cheap and they hold. They do not replace
occasionally exporting a real deck and looking at it.
