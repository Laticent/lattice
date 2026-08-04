# Part 5: Mermaid Diagram Integration

## 5.1 Diagrams in Markdown

Write a fenced ` ```mermaid ` block. That is the whole authoring surface — the
engine owns the render on both paths, and neither one is Marp's built-in Mermaid:

````markdown
<!-- _class: diagram -->

## How signals move from input to decision.

```mermaid
flowchart LR
  A[Input] --> B[Process]
  B --> C{Decision}
```
````

| Path | Who renders | When |
| --- | --- | --- |
| PDF / export (`lattice-emulator.js`) | `mmdc` (Mermaid's CLI, one process per diagram) | build time, pre-rendered to inline SVG |
| Live preview (`dist/lattice-runtime.js`) | `mermaid.render()` in the browser | on the live DOM, in the Playground / Studio / marp-vscode |

Component contract, slots, and the anti-patterns:
`lib/components/diagram/diagram/diagram.docs.md`.

A hand-written `<div class="mermaid">` renders on NEITHER path and is a silent
no-op: the emulator's pre-pass matches fences only
(`preprocessMermaid`, `lattice-emulator.js`), and the runtime picks up
`pre > code.language-mermaid` and treats a sibling `div.mermaid` purely as the
SVG *target* it inserts itself (`lib/runtime/index.js`). Earlier advice here to
prefer that div over a fence was wrong; use the fence.

## 5.2 Node Shapes Reference

| Syntax     | Shape             | Use For             |
| ---------- | ----------------- | ------------------- |
| `root`     | Default           | Auto                |
| `((Text))` | Circle            | Emphasis nodes      |
| `(Text)`   | Rounded rectangle | Leaf nodes / items  |
| `[Text]`   | Square            | Category nodes      |
| `{{Text}}` | Hexagon           | Root / group nodes  |
| `)Text(`   | Cloud             | Ideas / concepts    |
| `))Text((` | Bang              | Alerts / highlights |

Use different shapes for different hierarchy levels to aid visual scanning.

## 5.3 Theme matching, and your own `%%{init}%%`

**Do not hand-copy theme variables into your diagram.** The engine already hands
Mermaid the whole set — 150-odd keys resolved from the active palette — on both
paths. Hand-copying freezes a snapshot of one palette: the diagram then ignores a
theme switch, a dark slide, and the print look.

**One map, two readers.** Which Mermaid variable is fed by which palette token is
decided once, in `lib/core/mermaid-theme-map.js`. Each path supplies only a
`readToken` — `getComputedStyle(section)` in the preview, offline token
resolution against the palette text in the PDF path — and `buildDiagramTheme`
does the rest. Before that, the two paths held separate copies of the same map
and 38 values had drifted apart; `fontFamily` is now the one sanctioned
divergence (`DIVERGENT_KEYS`), and
`test/unit/core/diagram-theme-parity.test.js` fails on any other.

The two paths deliver it differently, because they have to. The **live preview**
is in-process, so it sets the palette once on the global config
(`mermaid.initialize`); Mermaid then merges your in-source `%%{init}%%` over that
per render, which is where the guarantee below comes from. The **PDF path** shells
out to `mmdc`, one process per diagram, so its config can only travel *in* the
diagram source — hence the merge kernel described at the end of this section. What
the two share is the token→variable map, not the plumbing.

The mapping is `MERMAID_VAR_MAP` in `lib/core/mermaid-theme-map.js`, imported by
both paths. `test/unit/mermaid/mermaid-var-map.test.js` asserts every token it
names resolves in every self-declaring palette;
`test/unit/palette/diagram-ink-contrast.test.js` holds each ink key to AA against
the surface it is actually drawn on, per palette and per scheme.

**A `subgraph` box is drawn entirely from the containment tier** — fill
`--c-container`, boundary `--c-container-edge`, label ink `--c-on-container` (and
the `-subcontainer` trio one rung in). Not `--bg-alt`, which is the deck's *card*
fill; not `--diagram-stroke`, which doesn't flip with color-scheme and so went
dark-on-dark; not `--cat-on-fill`, which is the *categorical* tier's ink. The distinction matters because a
cluster sits *behind* the categorical node fills and must not compete with them,
which is a different job from a card sitting on the canvas. `--c-container` is
part of the 91-token per-theme contract, so every theme curates it (they differ
sharply — indaco `#E8F0F7`, concrete `#A8A8A8`). This only reaches PLAIN
clusters: a `.section-N` cluster (mindmap, timeline, kanban) is overridden to
`--cat-N-fill` by `mermaid.css`'s band cycle.

Legibility is **gated**, not assumed —
`test/unit/palette/containment-contrast.test.js` holds every theme in both schemes
to ink ≥ 4.5:1 on its rung and edge ≥ 3:1 on the fill it outlines. The fill is
deliberately a barely-there step from the canvas (it is a surface, not an accent),
which is exactly why the *boundary* is what has to carry the grouping semantic and
is what the gate measures. Curate a new theme's edge from its own stroke hue and
lighten it only as far as 3:1 demands; that keeps it on brand.

### Writing your own directive

An `%%{init}%%` of your own is fine and costs nothing — the engine's directive
goes in ahead of yours and Mermaid merges init directives in source order, later
winning. So you set what you name; everything you don't name keeps the palette:

````markdown
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TB
  subgraph g["Group"]
    A["A"] --> B["B"]
  end
```
````

Renders with `curve: linear` **and** the theme's cluster fill, node fills and
label ink. Same for `layout`, `defaultRenderer`, per-diagram-type config, or a
partial `themeVariables` override — name `lineColor` alone and only `lineColor`
changes.

### One non-palette config, both paths (#1347)

`engineInitConfig` (`lib/integrations/mermaid/init-directive.js`) holds the shared
**non-palette** options, and the preview builds its `mermaid.initialize` argument from
it rather than hand-rolling a second copy. It always claimed to be shared; the runtime
did not call it, so eight keys diverged with nothing watching — `DIVERGENT_KEYS` covers
`themeVariables` only.

The one that bit was `flowchart.wrappingWidth`: 480 in the preview against Mermaid's
default 200 in the export. Wrapping width decides where a label breaks and a label
break decides the node's **width**, so the same deck laid its flowcharts out
differently on the two paths. Measured on one long-labeled node, exported:
`461.86 × 151` before, `741.86 × 88` after — narrow-and-tall becomes wide-and-short,
which is what the preview had been showing all along.

Now shared: `flowchart.wrappingWidth`, `flowchart.htmlLabels`, `markdownAutoWrap`, the
seven `quadrantChart` type sizes (preview-only before, so an exported quadrant rendered
its labels at Mermaid's much smaller defaults), and `c4.c4ShapeInRow` /
`c4BoundaryInRow` (export-only before, so a C4 diagram crammed one row live and fanned
across two in the export).

`DIVERGENT_CONFIG` is the enumerated exception set, and three of its four entries are
not choices at all. `securityLevel`, `startOnLoad` and `suppressErrorRendering` are on
Mermaid's own **secure-key list**, and its `sanitize` deletes them from anything that is
not `mermaid.initialize` — so the PDF path, whose config can only travel in a
`%%{init}%%` directive, structurally cannot state them. Putting them in
`engineInitConfig` would emit keys Mermaid silently drops and call it parity. (The
effective values agree anyway: Mermaid's default `securityLevel` IS `strict`.) The
fourth, `flowchart.useMaxWidth`, is a deliberate preview behavior — inside
`section.diagram` mermaid.css forces sizing with `!important` and the key cannot be
seen; outside one, flipping the export would change how every exported diagram is
constrained, which is a layout change rather than a parity fix.

`test/unit/mermaid/init-config-parity.test.js` fails on an unlisted divergence, on a
sanction that no longer diverges, and on a Mermaid upgrade that takes one of those three
off its secure list (which would make it shareable).

**The two paths use different diagram fonts, and there is a constraint behind it.**
The preview uses `--font-body`; the PDF path uses `"JetBrains Mono", monospace`
(`DIAGRAM_FONT_STACK` in the kernel). That is not arbitrary: `sanitizeDirective`'s
allow-list for `themeVariables` values (`/^[\d "#%(),.;A-Za-z]+$/`) has **no
hyphen**, so a stack containing `system-ui` / `sans-serif` is silently replaced
with `""` the moment it rides in a directive — and a blank font is worse than an
absent one, because Mermaid then measures labels in the host's default font while
the page renders them in the inherited one, and they clip mid-word. The preview
escapes this only because `mermaid.initialize` runs the far more permissive
`sanitize`. The kernel drops any value the directive filter would blank rather
than shipping one to be emptied. (Preview and export therefore disagree on
diagram font — a real, pre-existing WYSIWYG gap, tracked separately.)

The one thing that *does* stand the engine down is naming a Mermaid **theme** in
a `%%{init}%%` directive:

````markdown
```mermaid
%%{init: {'theme': 'forest'}}%%
```
````

Any theme name Mermaid actually resolves — `dark`, `forest`, `neutral`, `neo`,
`redux`, … — other than `base`, reads as an explicit opt-out, so the engine
injects nothing and
you get Mermaid's stock `forest` — off-palette by definition, immune to a theme
switch, and reported as "kept their own colors" by the export's look re-bake.
Reach for it only when you genuinely want a diagram outside the deck's palette.

A name Mermaid does **not** resolve is not an opt-out. `theme: 'Forest'` (wrong
case), `theme: ''`, or a typo would leave you with no theme from Mermaid *and* no
palette from the engine — stock `#ffffde` — so the engine keeps the diagram
instead. Theme lookup is case-sensitive and exact on Mermaid's side.

**Two spellings the stand-down does NOT cover**, both pre-dating #1311:

- **`%%{INIT: …}%%` in caps.** Mermaid's directive scanner is case-insensitive
  but its init-type filter is not, so Mermaid applies nothing from an uppercase
  directive. The engine matches that case-sensitively and injects as if it
  weren't there — the palette lands, and your directive is ignored by both of us.
  Write it lowercase.
- **A theme set in YAML front matter** (`---\nconfig:\n  theme: forest\n---`).
  Mermaid merges front-matter config *under* the directive, so the engine's
  `theme: base` wins and you get the palette, not `forest`. The stand-down reads
  the `%%{init}%%` spelling only. Use the directive form to opt out.

The reconciliation lives in `lib/integrations/mermaid/init-directive.js`, which
the **PDF path** calls; the preview needs no kernel because Mermaid's own merge
over the global config already delivers the same guarantee. One consequence worth
knowing: the theme stand-down is PDF-path-only — a `theme:` pin previews on-theme
and exports stock. Before #1311 the build path was worse: ANY directive made it skip the
injected palette entirely, and the diagram silently fell back to Mermaid stock
(`#ffffde` clusters, `#333` label ink). If you are looking at an off-theme
diagram with a directive in it, that regression is what
`test/integration/mermaid/mermaid-init-merge.test.js` guards.

**`layout: 'elk'` still does nothing — and says so only in a log.** The directive
now survives the merge, but elk ships as a separate package
(`@mermaid-js/layout-elk`) that neither `mmdc` nor the runtime bundle registers.
Mermaid does not fail on an unregistered algorithm: `getRegisteredLayoutAlgorithm`
falls back to dagre with a `log.warn` you never see, so the diagram renders
on-palette, laid out by dagre, looking like the directive worked. Verified on
Mermaid 11.14. Installing elk is separate work from #1311.

---

## 5.3d Which ink goes where

Diagram text comes from **three** tokens, chosen by what the text sits on:

| site | token | examples |
|---|---|---|
| on a categorical **fill** (the pale band) | `--cat-on-fill` | node label, gantt bar, pie slice, sequence actor, band |
| on a categorical **mark** (the saturated band) | `--cat-on-mark` | gitgraph branch label |
| on the **canvas** (`--bg` / `--bg-alt`) | `--text-heading` | diagram title, pie legend, quadrant axis labels, gantt margin text |

The mark tier joined last (#1348). `gitBranchLabel0-7` sits on `git0-7`, which is
fed from `--cat-1..8-mark`, and was being inked with `--cat-on-fill` — ink curated
for the *pale* band, used on the saturated one, at 1.2:1 to 3.0:1 in every palette
and both schemes. `--cat-on-mark` already existed and is already gated ≥4.5:1
against every `--cat-N-mark`; nothing had ever pointed at it. Note the scope
honestly: this fixes the **baked** SVG. On a Lattice slide `mermaid.css` repaints
the branch chip with `--cat-N-fill` and its text with `--cat-on-fill` (both
`!important`), so the slide already showed a matched pair and is unchanged — the
baked values are what matters wherever our CSS does not ride along.

It used to be one token for the first and third. That is invisible on 27 of the 32 palettes,
where `--cat-on-fill` is declared as `var(--text-heading)` — and wrong on the
`a11y-*` family, which **pins** its categorical tier mode-invariant (fixed pale
chips carrying the CVD textures) while the canvas still flips. In a dark context
that gives `--cat-on-fill: #000000` on a `#000000` canvas: 1.00:1.

**Flowchart edge labels are the exception, and they need CSS.** Mermaid paints
node labels and edge labels from a single rule (`.label text, span`), so no
themeVariable can serve both — a node label is on a chip, an edge label is on
`edgeLabelBackground`. `mermaid.css` re-pairs the edge label's ink with the
canvas, out-specifying Mermaid's ID-scoped rule.

`test/unit/palette/diagram-ink-contrast.test.js` holds each ink key to AA against
the surface it is actually drawn on, for every palette in both schemes. Its
`SITES` table — ink key → the themeVariable it lands on — is deliberately
hard-coded rather than derived from the map: derive it and the gate simply
re-judges a mis-assigned key against its new tier and stays green.

---

## 5.3c The subgraph box — corner, and what "padding" can and cannot reach

The cluster (`subgraph`) box is a **containment surface**: `--c-container` fill,
`--c-container-edge` border, `--c-on-container` label ink. Its corner is
`--diagram-cluster-radius`, applied by `mermaid.css` as a CSS `rx`/`ry`:

```css
:is(section, figure) g.cluster:not([class*="section-"]) > rect {
  rx: var(--diagram-cluster-radius); ry: var(--diagram-cluster-radius);
}
```

Three things about that rule are load-bearing:

- **`border-radius` does nothing to an SVG `<rect>`.** Rounding is `rx`/`ry`, and
  Chromium accepts both as CSS geometry properties. Mermaid writes no `rx` for a
  flowchart cluster (`node.rx` is undefined for a subgraph), so there is no
  presentation attribute to fight and no config knob to use instead — CSS is the
  only lever.
- **One rule covers both render paths.** The mmdc SVG is embedded inline in the
  exported HTML, so the same bundle cascades onto it that the preview applies.
- **The value is in SVG USER SPACE, not `cqi`.** A geometry property is read in
  the diagram's own viewBox coordinates and then scaled by the fit, so a
  container-relative unit would land at a different size on every diagram. User
  space is also the right space: 14-unit type, 8-unit dagre margins and 1-unit
  strokes all live there, so the corner stays proportional to the box at any
  scale.

`.section-N` clusters are excluded — they are painted from the **categorical
band**, not the containment tier, and Mermaid already rounds them at `rx=5`.
Enumerated from rendered output, three things emit `g.cluster`: a flowchart
`subgraph`, a classDiagram `namespace` (so that rounds too), and kanban
(excluded). Timeline and mindmap emit none, and a stateDiagram composite carries
`statediagram-cluster`, a different class token.

**Padding — read this before reaching for `flowchart.padding`.**

| what you want | the knob | reality |
|---|---|---|
| space between a node's label and its border | `flowchart.padding` | works — `DIAGRAM_NODE_PADDING`, one constant, both paths |
| the cluster's own inset from its children | — | **hardcoded** `marginx/marginy: 8` on the sub-graph Mermaid hands to dagre. No config reaches it. |
| space between the subgraph title and its content | `flowchart.subGraphTitleMargin` | **do not use** — Mermaid grows the outer box but does not push a NESTED child cluster down with it, so the inner rect paints over the outer title |

`flowchart.padding` is a **node** inset despite the name. Raising it from 8 to 24
leaves cluster-minus-node constant at 70 × 100 user units — it grows the nodes,
and the cluster only follows because its children got bigger.

---

## 5.3b Which band a diagram is baked for

A Mermaid SVG **bakes** its colors: `themeVariables` are resolved to literal hex
before the shape reaches the page, so a later CSS restyle cannot recolor a node
label. The chip *underneath* it — the categorical fill, the texture, the canvas —
is live, per-section CSS. Ink and chip are two halves of one decision, and they
agree only if both halves answer the same question the same way.

`lib/core/diagram-band.js` **is** that question. `resolveDiagramBand({
frontMatter, slideClass, flagPrint })` returns `light` | `dark` | `print`, in this
precedence:

1. **Print wins.** Paper is ink-on-white — not a color scheme, so nothing about
   light/dark outranks it. `color-mode: print`, the engine `--print` /
   `--image-mode print` flag (which writes that key), or a per-slide `_class: print`.
   The legacy `class: print` also sets it — but only on a deck with no `color-mode:`
   key at all, because the key supersedes the whole legacy color axis
   (`lib/core/deck-class-register.js`).
2. **A slide that names a color-mode token owns its scheme.** `_class: light` on
   a dark deck renders light. "Names a color-mode token" is whole-token
   membership in `COLOR_MODE_TOKENS` (`lib/core/color-mode.js`) — the same test
   the deck-class propagation guard uses to decide what the section's class ends
   up being.
3. **Otherwise the slide inherits the deck.**

Rule 3 is the one that was missing (#1340). The emulator used to spell rule 2 as
*"did this slide name **any** `_class:`?"*, so `_class: diagram` — which says
nothing about scheme, and is how every component is selected — forced light on a
`color-mode: dark` deck. The section genuinely was `.dark`; only the bake
disagreed.

**Only the PDF path calls it, and that asymmetry is the port, not a gap.** The
preview never resolves a band as such: it reads tokens through
`getComputedStyle(section)`, so CSS inheritance hands it whatever the section's own
classes resolved to, band included.

**Granularity — both paths are per slide (#1332 step 3).** The preview used to
configure Mermaid *once per document*, from the first `<section>`, so slide 1's
scheme was baked into every diagram in the deck: a light first slide gave slide 9's
`_class: dark` diagram light ink on a dark chip. That was the last surviving
instance of the #1326 bug class — chip is per-section CSS, ink is baked, and the two
were describing different slides. The reader now takes the section as a parameter
(`openSectionReader(scopeEl)`), which is all it takes: passing the right element in *is*
the fix, because inheritance already does the resolving.

Three things follow, and all three are load-bearing:

- **The palette is applied per BAND, not per diagram.** `mermaid.initialize` is
  global and `mermaid.render` takes no config, so per-slide themeVariables mean
  re-initializing between diagrams that resolve differently. Diagrams are grouped by
  the slide's cascade-context key (`lib/core/diagram-scope.js`) and the palette is
  built and applied once per group — one to three groups per deck, never one per
  slide. Rebuilding 166 variables per fence on a 150 ms debounce is what that avoids.
- **The renders are ordered against the config.** One promise chain, so
  `initialize` for band B cannot land between band A's render calls. Diagrams
  *within* a band still render concurrently, exactly as the whole deck used to.
- **The SVG cache is keyed by (scope, source), not source.** A source-only key was
  sound only while one palette served the deck; per-slide ink makes it hand slide 2
  slide 1's baked SVG, which is the same mismatch arriving through the cache.

**What per-band configuration costs.** Measured on the real Playground with a
20-diagram deck that ALTERNATES bands — the worst case, since every slide is a new run:
first render 936–948 ms before, 987–1013 ms after (+5–8%); the keystroke re-pass is
unchanged, because everything but the edited fence comes from the (scope, source) cache.
Re-measure with `node tools/bench-preview-diagrams.mjs` (needs the docs site running);
`npm run bench` cannot reach this path at all, since it drives the Node renderer and
there is no `getComputedStyle` there to be slow.

### The kernel drives; the paths supply capabilities (#1332 step 4)

Neither path assembles a palette any more. `renderDiagrams`
(`lib/core/render-diagrams.js`) walks the deck, resolves each slide's
`themeVariables` from the one map, and calls the path back:

```js
renderDiagrams(deck, { readToken, renderOne, scopeKey, beginRun, finishTheme })
```

A `scope` is whatever a path needs in order to read a token for one slide, and the
two hand in genuinely different things — the PDF path a resolved band
(`'light' | 'dark' | 'print'`), the preview the `<section>` element itself.
`scopeKey(scope)` names the palette that scope resolves, so the theme is built once
per distinct palette rather than once per slide: the band string on the PDF path, the
section's class signature (`lib/core/diagram-scope.js`) on the preview. Two spellings
of "these slides paint the same", which is all the kernel needs.

`finishTheme` is the ONE place a path may differ from the other inside the palette,
and its only licensed use is `DIVERGENT_KEYS` — today `fontFamily`, per §5.3. The
parity gate fails on any other key that comes apart, and on a sanctioned key that
stops diverging.

**The acceptance test was a deletion.** #1332 stated it: *"a correct fix should let us
DELETE the reconciliation devices, not accumulate more."* `data-lattice-slide-bake` —
a marker that announced "this render baked per slide" — is gone, along with
`SLIDE_BAKE_ATTR`/`stampSlideBake` and the qualifier on all nine pinned theme
selectors. Once both paths resolve per slide there is no granularity left to announce.
See `engineering/textures.md`.

**It also closed #1329 for free.** The PDF path used to take the last `_class:`
directive appearing anywhere before the fence, and `before` never reset at a slide
boundary — so a bare slide following a `<!-- _class: dark -->` slide got a dark-baked
diagram on a light canvas. Walking real slides means each fence reads its OWN slide's
directive (`lib/core/slide-class-spans.js`, boundaries from markdown-it's `hr` tokens
plus the `split: headings` points, not a line regex). Measured on the same three-slide
deck: `origin/main` logged `light, dark, dark`; this logs `light, dark, light`.

### 5.3.1 The source-side reconstruction, and why it keeps drifting

`slideClassSpans` answers a question the renderer already answers — "which slide is
this byte on, and what class does that slide carry?" — and it has to, because the PDF
path bakes a diagram's palette before a single `<section>` exists. **A second answer to
a question the renderer already answers will drift; the only question is whether the
drift is caught.** It was not, three times, each with the same signature: baked ink
against a live chip that does not match it.

| It disagreed when… | Because | Divergence live in the corpus at |
|---|---|---|
| the deck used a GLOBAL `<!-- class: X -->` | only the spot `_class` form was read; the bare form carries forward to the end of the deck | — (no committed deck uses the form) |
| a directive was QUOTED as prose | a raw text scan can't tell `` `<!-- _class: kpi -->` `` in a bullet from a real one, and the last on a slide wins | `kit/Sample-Deck.md` (slide 3) |
| a slide held a `$$…$$` equation | its LaTeX was parsed as Markdown, and a lone `=` line is a setext H1 — a boundary under `split: headings` | `lib/components/math/math/math.gallery.md` (16 sections, 17 spans) |

**Read that third column precisely.** It names where the RECONSTRUCTION diverged, not
where a diagram came out wrong. Both live instances land on slides that carry no
Mermaid fence, and all 119 fences in the tree resolve the same band before and after
the fix — so nothing in the corpus was rendering wrong, and the fix repairs no
committed artifact. That is the honest claim, and it is the one worth defending: the
value here is that three reachable shapes are closed and gated, on a question whose
last five defects (#1326 ×4, #1329) each shipped green.

Three structural answers, in the order they close the gap:

1. **One parser.** `lib/core/boundary-parser.js` is the single markdown-it instance for
   every off-render boundary caller (`bake-splits.js`, `section-source-split.js`,
   `slide-class-spans.js`). Each used to build its own beside a comment claiming it
   "mirrors the lib/engine parser"; a comment cannot make that true. It carries the
   `math_block` rule (`lib/core/math-block-rule.js`, split out of the KaTeX plugin so
   the grammar has one definition and no render dependency).
2. **One directive grammar on the RENDER + BAND path.** `lib/core/comment-directive.js`
   owns the `<!-- key: value -->` parse; `lib/engine/slides.js` binds the engine's
   vocabulary to it, `slide-class-spans.js` binds `class` alone. Directives are read off
   the TOKEN STREAM, so a `fence` or `code_inline` token is prose — as the renderer
   already treats it. Two source-side readers of the same syntax survive OUTSIDE that
   path and are tracked rather than claimed fixed: the deck linter
   (`lib/authoring/lint-core.js`) and the editor's autocomplete
   (`docs/src/playground/slide-context.js`) each still carry a `_class:`-only line regex
   with all three defect shapes intact. Neither decides a palette, which is why they are
   #1383 and not this change.
3. **One gate.** `test/unit/core/slide-class-span-parity.test.js` renders the WHOLE
   committed corpus through the real engine and asserts the reconstruction matches its
   sections — count and class, ~6,600 slides. None of the three defects was reachable
   by a test that only covers cases someone thought to write down; all three fail this.

The one sanctioned divergence is `_focusSteps`, which EXPANDS one authored slide into
several at render time. It is safe for the BAND because every expanded copy carries the
class of the slide it was copied from, and it is safe for the COUNT now too: `focusSteps`
used to group on `t.type === 'hr'` with no `level === 0` guard, unlike `splitOnHr`, so a
focus slide containing a nested `---` (inside a blockquote or a list) rendered one section
more than it should. Both grouping sites take the predicate from `lib/core/slide-rule.js`
(#1387). The gate detects the divergence off the token stream, not a text scan — a decision record that merely *discusses* `_focusSteps` in
prose must not be excused from the slide-count check.

**What the gate structurally cannot see**, and is worth knowing before trusting it: it
verifies `spans(md) ≡ render(md)`, while production needs
`spans(md) ≡ render(preprocessMermaid(md))`. The bake splices SVG back into Markdown,
and a blank line followed by `---` inside that SVG really does produce a section the
reconstruction has no span for. That gap is not closable from this side — it is a
consequence of baking before rendering at all, which is the question #1385 asks.

**#1385 is answered: this module is on a RETIREMENT path, not a growth path.**
Nothing between the bake and the render needs the baked SVG — measured, not argued:
of the nine real `rawMd` reads in the emulator, one is the render itself, one (the
player envelope's "verbatim source") is actively harmed by it, one already
re-derives a fence-intact source to work around it, and six read front matter and
do not care. `engine.render` is called exactly once, so the early bake amortizes
nothing either. The ordering is an accident of module-evaluation position.
Inverting it — render first, bake per `<section>`, which is what the runtime path
already does — deletes this module, its corpus gate, and the SVG-through-markdown-it
hazard above. Scheduled, with the plan and the one piece that can go silently wrong
(the image-set re-bake's index alignment), in
`engineering/decisions/2026-08-05-bake-before-render-ordering.md`. **A new defect
here is a reason to bring that forward, not a reason to add a fourth layer.**


---

## 5.4 Diagram Titles

**Convention.** The slide's `## heading` is the canonical title. Mermaid's own title (whether set via YAML frontmatter `title:` or in-body `title` directive) is suppressed by CSS so the audience sees one source of truth, not two. Authors keep the `title` directive in source for portability — the diagram still makes sense if extracted — but it does not render on the slide.

**Where the suppression lives.** A single rule in `lattice.css`'s DIAGRAM OVERRIDES section (`section .titleText, section .pieTitleText, …, section [class$="TitleText"] { display: none; }`). Loaded by every render path; reaches the inline SVG via the host page cascade. No per-palette duplication.

**Class list (verified from rendered output, Mermaid 11.14).**

| Class | Diagram type | Title syntax |
| --- | --- | --- |
| `.titleText` | gantt | in-body `title` |
| `.pieTitleText` | pie | in-body `title` |
| `.radarTitle` | radar-beta | in-body `title` |
| `.packetTitle` | packet-beta | in-body `title` |
| `.flowchartTitleText` | flowchart | frontmatter |
| `.classDiagramTitleText` | class diagram | frontmatter |
| `.erDiagramTitleText` | ER diagram | frontmatter |
| `.requirementDiagramTitleText` | requirement diagram | frontmatter |
| `.gitTitleText` | gitgraph | frontmatter |
| `[class$="TitleText"]` | safety net | catches future `*TitleText` variants |

**Known gap — bare `<text>` titles.** Six diagram types render their title as a `<text>` element with no CSS class: sequence, journey, C4, quadrant, timeline, xy-chart. These cannot be class-targeted from CSS and remain visible. The slide heading still provides the canonical title; the in-SVG title shows alongside it. This is a documented gap, not a bug. Trying to target these by structural position (e.g. "first text element") would be fragile across Mermaid versions.

**Two title syntaxes in Mermaid.**

1. **YAML frontmatter** (`---\ntitle: My Title\n---\nflowchart LR\n...`) — flowchart, sequence, class, state, ER, requirement, gitgraph, mindmap, and most types support this.
2. **In-body directive** (`gantt\n  title My Title\n...`) — gantt, pie, journey, quadrant, C4, timeline, xychart, radar, packet.

Some types accept both. The rendered CSS class is determined by diagram type, not by which syntax was used to set the title.

**Diagnostic recipe (when Mermaid adds a new diagram type).**

1. Add a `title` directive to the diagram in `lib/components/diagram/diagram/diagram.gallery.md`.
2. Build to HTML via `node lattice-emulator.js lib/components/diagram/diagram/diagram.gallery.md ...`.
3. Open the HTML in a browser so Mermaid renders the SVG client-side.
4. Save the post-render DOM (DevTools → Elements → copy outerHTML on the `<svg>`).
5. Grep for the title text string. Inspect the surrounding `<text>` element's `class` attribute.
6. If the class follows the `*TitleText` pattern, the existing safety net catches it automatically.
7. If it uses a bespoke class (like `radarTitle` or `packetTitle`), add it to the suppression rule in `lattice.css`'s DIAGRAM OVERRIDES section.
8. If the title renders as a bare `<text>` with no class, document it under the known-gap list above; do not attempt a structural selector.

**Never guess class names.** They are inconsistent across diagram types — some use camelCase suffix `TitleText`, some use bespoke names like `radarTitle`, some have no class at all. Always verify from rendered output.

**Marp-vscode preview parser quirk.** One CSS pattern is silently broken in the marp-vscode Chromium build (the preview applies via JS but the rule never matches): `:not(:has(...))` and `:is(:has(...), :has(...))`. Plain `:has()` is fine; nested inside `:not()` / `:is()` it isn't. Use descendant combinators or compound selectors instead. See `engineering/gotchas.md`. (Historical note: when the build path injected CSS via Mermaid's `themeCSS` init parameter, two additional limits applied — no CSS comments, no `>` combinator. That path no longer exists; rules now live in `lattice.css` and reach the SVG via host-page cascade, so both restrictions are gone.)

---
