---
status: shipped
summary: The Export-to-Marp bundle shipped a deck that rendered wrong, and had for a long time. Rendering examples/bloom-engineering-journey.md through the bundle with real marp-cli surfaced four independent defects (a fifth, the auto-glossary's generated slide going MISSING from the export entirely, came out of asking the same question of every other transform) — escaped runtime <script> tags (marp-core defaults to html:false), ~835 CSS rules dead to marp-core's selector scoper (a leading `:is(section.x, figure.x)` head scopes to a slide-inside-a-slide), no bundled fonts (stylesheet-relative `url(fonts/…)` with no directory), and two transforms with no live-DOM mirror (premise, matrixGridCells). All four fixed. Root cause underneath all four: NOTHING on our side ever rendered the bundle, so every claim about it was inference. The marp-vscode PREVIEW pane remains CSS-only by construction — its webview executes no scripts — and the docs now say so instead of promising fidelity it can't deliver.
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
of which ~835 target real slide state — the entire chart bucket (matrix-grid,
roadmap, gantt, kanban, radar, quadrant, funnel, piechart, progress, map,
timeline-list, word-cloud) plus the 466-rule shared `:is(section, figure)` Form
layer.

We already knew this bug. `lib/engine/css.js` has carried a fix since someone
hit it on the owned path (the comment names the symptom: "`--map-base` is never
defined, and every map/quadrant/radar fill that reads it falls to SVG's black
initial value"). Nobody connected it to the export, because nobody rendered the
export.

Fix: the distribution moved to a shared kernel (`lib/core/leading-is.js`) that
`lib/engine/css.js` now imports, and `marpScopableCss` in `lib/core/marp-bundle.js`
applies it to every stylesheet the bundle ships. `dist/lattice.min.css` is
untouched for every other consumer — the rewrite happens at export time.

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

Checked and CLEAN: heading-period normalization (not applied by default, so
nothing to mirror) and `animaSceneFences` (the `.anima-spec` div is a spec
carrier the scene transform strips on both paths — `examples/anima-scene.md`
exports at identical page count and renders identically).

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

## What we did NOT fix (deliberately): deck-wide front-matter registers

A fifth family, found while producing the light/dark artifacts for export
sign-off, and left for its own change (HARD RULE #17):

`color-mode: dark` renders dark on the engine and **light** through the export's
`npm run pdf`. Deck-wide front-matter axes (`color-mode:`, `class:`, `logo:`,
`meta:`) have no Marp equivalent, so the runtime recovers them by FETCHING the
deck's source `.md` from beside the rendered document. Verified: that fetch
resolves when you open the exported `<name>.html` — every section correctly
carries `dark` — and does NOT resolve during marp-cli's PDF conversion, so the
registers never populate there.

The fix shape is known and small for the color axis: bake the deck-wide axis
into a Marp-native global `class:` directive at export time. marp-core honors
front-matter `class:` on every section, which removes the fetch dependency
outright — the same "bake the source transform" move that fixed splits and the
auto-glossary. Logged in `gotchas.md`'s register rather than pulled into this
change.

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

The cheapest durable guard is not a new gate — it is that
`marp-independence.md` no longer says "clean boundary" without also saying
"clean is not self-verifying," and `test/unit/tools/export-marp.test.js` now
asserts the three structural properties an eyeball would otherwise have to
catch: fonts present for every `url(fonts/…)` the bundled CSS references, no
stylesheet leading a rule with `:is(section…)`, and HTML enabled in both
generated configs. Those are cheap and they hold. They do not replace
occasionally exporting a real deck and looking at it.
