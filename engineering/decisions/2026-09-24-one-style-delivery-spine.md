---
status: in-progress
summary: Every surface shares one Markdown engine, one article builder and one player assembler, but each surface decided on its own how the deck's stylesheet reached it, and there were five answers. Every black-chart bug so far (#956, #715/#2210, #2264, #2344) was one surface's answer drifting from the rest. The engine now owns style delivery as three named modes (scoped, flat, baked), every host asks for one by name (§4.1), and `check:render` renders every mode. Steps 1–3 shipped in #2344 and #2366; step 4, the CLI onto the flat sheet, shipped in #2379 with the owner's export sign-off (§8.3). Two open items remain (§8.4): the Studio player's shared unwrap and the Read · Article word cloud.
---

# One style-delivery spine — every surface gets the deck's CSS the same way

> **In progress.** All four steps of §8 shipped: the gate (§5.1, #2344), the named modes and the
> Reading view (§4.1, §8.1, #2366), and the CLI export onto the flat sheet (§8.3, #2379, with
> the owner's export sign-off). §4.1 is the host table. §8.4 lists the two open items.

## 1. The symptom

A chart renders black, or loses its styling, on one surface while every other
surface draws it correctly. It has happened four times:

| Bug | Surface | What went wrong |
|---|---|---|
| #956 | Studio preview, Playground | The preview's scoping mis-read `:is(section.map, figure.chart-frame)`, so map/quadrant/radar tokens were never defined |
| #715, #2210 | Studio PDF/PPTX (image export) | The rasterizer copies computed styles onto HTML elements only; every chart SVG lost its CSS, then its tokens |
| #2264 | Studio in-app Reading view | The view ships no deck stylesheet; Mermaid diagrams painted black until they were baked with frozen tokens |
| #2344 | Studio Webpage (HTML) player, Read · Article | The player got the preview's slide-scoped CSS; a chart lifted out of its slide matched no rule and no token |

Each was fixed where it showed up. None of the fixes touched the cause, which is
the same every time.

## 2. What is already one spine, and what is not

The **content** path is shared. HARD RULE #1 holds here:

- **One engine** (`lib/engine`) turns Markdown into slide HTML for the CLI, the
  Studio and the docs site.
- **One article builder** (`projectDeckToProse`, `lib/transformers/prose-projection.mjs`)
  builds Read · Article for the exported player and for the Studio's Reading view.
- **One player assembler** (`lib/export/player-core.mjs`) builds the HTML player for
  both the CLI (`--player`) and the Studio's Webpage export.
- **One source stylesheet**: `dist/lattice.css` plus the themes.

The **style** path is not. Each surface decides how that stylesheet reaches the
content it shows, and there are five answers today:

| Surface | Who decides | CSS shape it gets | Content outside a slide? |
|---|---|---|---|
| CLI PDF, PNG, HTML sidecar, `--player` | `lattice-emulator.js` (`layoutCSS + paletteCSS`) | **as written** — unpacked | Yes (player Read · Article) |
| Studio preview, Playground, docs embeds | `lib/engine/css.js` `packTheme` | **scoped** to the inside of a slide; `:root` moved onto the slide | No |
| Studio Webpage player | `share-export.ts` | scoped, plus the as-written arms (`flatCss`, #2344) | Yes |
| Studio PDF/PPTX rasterizer, chart "download as SVG" | `deck-export.js` `flattenChartSvgs`, `standalone-svg.js` | **baked**: computed styles inlined per SVG, tokens frozen onto the root | No stylesheet at all |
| Studio in-app Reading view | `ReadArticle.tsx` | **none** — its own 34 prose rules only | Yes, and nothing styles it |

So "the same deck on two surfaces" means the same HTML under up to five
different stylesheets. A rule that is right in one shape can be dead in another,
and nothing compares them.

## 3. Root cause

**No one owns style delivery.** The engine owns *what* the CSS is. Each host owns
*how* it arrives, in a file that is about something else: an export, a
rasterizer, a React pane. The two questions that decide the shape are the same
for every surface:

1. **Does content ever sit outside a slide?** Read · Article lifts figures out.
   The preview never does.
2. **Does the host carry a stylesheet at all?** A detached rasterizer clone, a
   `.svg` file and the Reading view do not.

Those two answers give three shapes, not five. The extra two exist because two
hosts answered the questions privately:
- **The Studio Webpage export** used the preview's shape for a document that shows
  content outside slides.
- **The Reading view** used no shape at all.

## 4. Proposal — three named delivery modes, owned by the engine

| Mode | For a host where… | Produces | Exists today as |
|---|---|---|---|
| `scoped` | only slides are shown, inside a wrapper | the packed sheet (`render().css`) | the default |
| `flat` | slides are flat, and slide content also appears outside a slide | the packed sheet plus every re-scoped arm as written (`render(…, { flatCss: true })`) | #2344 |
| `baked` | there is no stylesheet at all | each chart SVG carries its own computed paint and frozen tokens | `flattenSvgStyles` + `applyCollectedTokens`, called from three places |

The change is ownership and naming, not new machinery:

- **The engine names the modes.** `render(markdown, theme, { styles: 'scoped' | 'flat' })`
  replaces the ad hoc `flatCss` flag. `baked` stays a browser-side step, because it
  reads computed styles, but it becomes one exported function that all three of its
  callers use.
- **Every host asks for a mode by name, and its choice is in one table.** A new
  surface picks a row instead of inventing a shape. The table is the "who owns
  color" record for delivery: `engineering/decisions/2026-08-09-color-theme-ownership.md`
  owns *which* colors; this owns *how they arrive*.
- **`baked` has a known ceiling.** It can carry SVG charts, but not the HTML charts
  (roadmap alone has 34 pseudo-element rules). A host that shows HTML charts cannot
  use `baked`; it needs `flat`. That settles the Reading view's options (§7, fork 2).

### 4.1 The host table (built 2026-09-25)

This is the one place a host's mode is recorded. A new surface that shows a slide adds
a row here and asks for its mode by name; it does not invent a shape.

| Host | Mode | How it asks |
|---|---|---|
| Studio preview, Playground, docs embeds | `scoped` | `render(md, theme)`; `scoped` is the default |
| Studio Webpage player (and its strip-notes re-render) | `flat`, unwrapped to top-level slides | `render(md, theme, { styles: 'flat' })`, ships `unwrapFlatSheet(flatCss)` (`share-export.ts`, `lib/export/unwrap-flat-sheet.mjs`) |
| Studio diagram bake (exported player, Reading view) | `baked` | `bakeSvg(svg, win, { foreignObjectLabels: 'text', freezeTokens })` (`deck-export.js`) |
| Studio PDF/PPTX rasterizer | `baked` | `bakeSvg(svg, win)` (`deck-export.js` `flattenChartSvgs`) |
| `check:render` baked pass | `baked` | `bakeSvg(svg, win, { freezeTokens })` (`tools/check-viz-render.js`) |
| Chart "download as SVG" (Studio + `tools/export-chart-svg.js`) | `baked`, to a file | `flattenSvgStyles(…, { collectTokens: true })` + `finalizeStandaloneSvg`; a file takes its tokens in its own `<style>`, not on an element |
| Studio Reading view | `flat`, pruned to the article and fenced to its figures | `buildDeckRender(…, 'flat')` (unwrapped by `unwrapFlatSheet`), then `scopedArticleCss` → `scopeReHostedCss` (`lib/export/player-prune.js`) → `sanitizeStyleText` (`article-projection.ts`) |
| CLI PDF/PNG/HTML/`--player` | `flat`, wrapper stripped, covered faces dropped | `cliDeckSheet(cliThemeStore(layout, palettes), { theme, sizeName, covered })` (`lib/export/cli-deck-sheet.js`), shared with `tools/palette-sweep.js` (§8.3) |

`render()` throws on an unknown `styles` name, and on `'baked'` it names `bakeSvg`
instead. A silent fallback to `scoped` is how #2344 shipped black charts, so an
unknown mode cannot take it.

## 5. The gate — `check:render` renders every mode, not one

`tools/check-viz-render.js` (`check:render`) already exists for this bug class. It
runs in CI through `test/integration/parity/viz-black-render.test.js`, and it
passes today (run 2026-09-24 on #2344's branch, whose preview CSS is
byte-identical to `main`'s), but it could not have caught #2344 or #2264:

- **It renders one mode.** It renders the chart gallery through `composeCss` in the
  preview shape and inspects slides. It never renders a figure outside a slide,
  and never renders without a stylesheet.
- **Its SVG coverage is complete, but its header says otherwise.** It renders the
  whole `chart.gallery.md`, so every SVG chart is inspected. Its header and `DECKS`
  comment still name seven families (funnel through word-cloud) from before the
  gallery grew. Correct the comment when the tool is next touched.
- **It looks only for black.** An HTML chart that loses its CSS goes *transparent*
  or unstyled, not black, so the check cannot see it.

Extend it (HARD RULE #15: reuse the tool, do not add a second one):

1. **One pass per mode.**
   - `scoped`: today's pass.
   - `flat`: the gallery run through `player-core`'s Read · Article, inspecting the
     re-hosted figures.
   - `baked`: each chart through `flattenSvgStyles` into a detached document.
2. **An "unstyled" signal for HTML charts.** For example, a kanban card whose
   computed `background-color` is transparent where the slide paints one. The rule:
   the same element, measured on the slide and in the re-host, must not lose a
   paint the slide had.

This changes what an existing gate *finds*, not what CI *runs*, so it is not a
CI-contract change. It does add runtime to the integration tier; measure it before
landing.

### 5.1 What was built (2026-09-24, #2344)

`collectCopies` in `tools/check-viz-render.js`, run by the same integration test.

- **The pairing.** Every element inside every slide is stamped (`data-vr`) before the
  copy is made. The article is built by the real `projectDeckToProse`, so each copy
  carries its twin's stamp. Every element meets its own original, with no matching
  heuristics.
- **The rule.** A finding is a paint the slide has and the copy loses:
  - a fill, stroke, stop or text color that goes to nothing or to black;
  - a background that goes transparent;
  - an element that is not drawn at all (`checkVisibility` plus a nonzero size).

  A changed color is allowed. Pinned without a browser in
  `test/unit/tools/check-viz-render-copies.test.js`.
- **Known limits.** These are written into the tool's header:
  - A text color that loses its token *inherits* the article's ink, which counts as
    a changed color, so it is caught only when it falls to black or nothing.
  - A `url(#g)` fill counts as painted whether or not `#g` exists. Lost gradient
    *stops* are caught; a dropped gradient is not.
  - `fill-opacity` and `stroke-opacity` are not read.
- **What the flat pass does not include.** The page uses the flat pack plus
  `playerCss()`, but not the player's sanitizer or `themeDualMode`'s light/dark
  rewrite. It gates the stylesheet's shape, not the whole player. The real-surface
  check for #2344 was a Studio export opened in Chromium.
- **Measured on the chart gallery, indaco/cuoio/concrete × light/dark:**

| | flat pairs | baked pairs | distinct losses |
|---|---|---|---|
| with #2344's flat pack | 7,218 | 5,964 | 10 (all pre-existing, sanctioned with a `why`) |
| with the old slide-scoped pack (the #2344 bug) | 7,218 | 5,964 | 309 |

- **The 10 remaining losses predate #2344 and are in the chart CSS**, not the
  delivery shape. Each has a baseline `why`, and all are tracked in
  `followups.d/2344-p2-chart-paints-lost-in-read-article.md`:
  - status chips with no `figure` arm;
  - a roadmap header that reads a token declared only on slides;
  - matrix-grid, which the projection shows as a plain table.
- **Guards against a pass that sees nothing.** Two drafts of this pass were blind,
  and each is now a failing check:
  - **Hidden article.** The first draft compared nothing and reported no losses:
    `playerCss()` hides `#lp-doc` outside the Read · Article view, so every copy
    measured zero and was skipped.
  - **Undrawn copy.** An independent checker then showed that a copy hidden with
    `display:none` still passed, because computed paint and `getBBox()` do not change
    when an element is not drawn. Hence the "not drawn" rule above.
  - **What the gate fails on now:**
    - any mode that compares 0 pairs;
    - any chart that should have a copy and compared nothing. That means every
      component the catalog re-hosts (`svg`, `flow`, `spatial`) in flat mode, and
      every component with a shape-bearing SVG in baked mode. A state-chart's static
      SVG is an empty edge layer, so it owes no baked copy.
  - **A bake that throws is a finding**, not a silent drop from coverage.
  - **A copy-loss sanction with a missing or `TODO` `why`** fails the gate.
- **Arms, committed.** The integration test proves the pass fails on each shape it
  guards, using one theme and one scheme, with the three arms run in parallel:

  | Arm | Measured (indaco, light) |
  |---|---|
  | slide-scoped pack (#2344) | 154 distinct losses |
  | article SVGs hidden (the checker's case) | 120 "not drawn" |
  | bake without frozen tokens (#2210) | 112 baked fill/stroke losses |

- **Runtime.**
  - `check:render` itself went from 14.5 s to 38 s. The two schemes run in parallel;
    it was 59 s serial.
  - The integration test file, which also runs the arms, takes 46 s.
- **Not included.** There is no Reading-view pass: how that view gets its styles is
  still fork 2. It lands with step 3.

## 6. What this does not change

- **Slide rendering in any mode.** #2344 showed that the flat mode can be purely
  additive: 278 before/after slide captures with no change.
- **The preview's scoping.** It is correct for the preview, and Marpit
  compatibility depends on it (`engineering/gotchas/marp.md`).
- **Export-to-Marp** (`lib/core/marp-bundle.js`). marp-core does its own packing,
  outside our control.

## 7. Decisions for the owner

**Decided 2026-09-25**, in one round: fork 1 **yes**; fork 2 **(b) `flat`, scoped and
pruned**; fork 3 **now, in this line of work** (not "later" as recommended, so step 4
runs after step 3 and still needs export sign-off); fork 4 **ratchet**. The options
below are kept as they were put.

1. **Adopt the three named modes, with the engine owning them?**
   - *Recommendation: yes.* The cost is one render option renamed and one
     `baked` function extracted. It buys a place where the next surface has to
     choose, instead of a fifth private answer.
2. **How does the Studio Reading view get its styles?**
   It renders in the app's top-level document on purpose: reader-mode tools only
   read the top level (`2026-09-20-reader-mode-text-extraction.md`).
   - **(a) `baked`.** Cheap, and covers the SVG charts, but cannot carry the HTML
     charts. A partial fix.
   - **(b) `flat`, scoped to the article root and pruned to the rules its DOM uses.**
     Covers every chart, and matches the exported player exactly.
     - **Cost:** a new stylesheet in the top-level document, which is a HARD
       RULE #22 style sink, so it goes through `sanitizeStyleText`. Up to about
       0.9 MB before the prune (#2344 measured the flat `lattice.css` pack at
       919,887 bytes). A scoping step (`@scope` or a selector prefix) so deck
       rules cannot reach the app.
   - **(c) A Shadow DOM per figure.** Fully isolated, but reader mode loses the
     figures' text.
   - *Recommendation: (b).* It is the only option that makes the Reading view the
     same spine rather than a sixth shape. The prune kernel already exists
     (`player-prune.js`).
3. **Move the CLI onto the engine's `flat` output?**
   The CLI concatenates the raw sheets itself, so it is the one surface whose CSS
   the engine does not produce. Moving it would make the two players byte-comparable.
   - **Cost:** export bytes change, which needs sign-off under the Quality Bar, and
     so does every CLI export.
   - *Recommendation: later.* Do it after the gate (§5) exists to prove parity,
     not before.
4. **Make the gate's "unstyled" rule strict, or ratchet it?**
   - *Recommendation: ratchet*, the way `black-baseline.json` does today. Legitimate
     differences between a slide and its re-host exist (a slide-only background
     band, for one), so a strict rule would start with false failures.

## 8. Order of work

1. **Extend `check:render` (§5) first.** It is the evidence for everything after
   it. **Done (§5.1).** The Reading-view pass waits for fork 2.
2. **Name the modes (§4)** and route the three existing hosts through them. No
   output changes; the extended gate must pass byte-identically. **Done (§4.1).**
   `check:render` passed unchanged on the branch: 12 sanctioned findings, flat 7254 and
   baked 5964 pairs.
3. **The Reading view** (fork 2). This closes
   `followups.d/2344-p1-studio-reading-view-charts-render-black.md`. **Done (§8.1).**
4. **The CLI** (fork 3), with export sign-off. It also carries the player prune's one-colon
   fix (§8.1), which changes export bytes for the same reason. **Measured, and paused
   (§8.2).** The owner asked for the one divergence it found to be fixed first. #2366 shipped
   that fix. **Done (§8.3, #2379).** The owner signed off the exports and accepted the breaking
   line: a bare `section{--token}` override loses to a palette `:root` token in CLI exports.

### 8.4 Open items

- **One shared unwrap for every flat host — done.** `unwrap` moved out of `cli-deck-sheet.js`
  into `lib/export/unwrap-flat-sheet.mjs` (`unwrapFlatSheet`), which is fs-free, so the Studio's
  Webpage player and Reading view, `check:render`'s flat and reading passes, and the CLI all call
  the one function. Measured on a deck with a raw `<section>` inside a `dark` slide, the Studio
  export before the change gave the nested section the slide's 1280px box, `overflow: hidden`
  and a white light-token panel; after it, the Studio and CLI players compute the same box
  (1171 of 1301px), `overflow: visible` and the dark ink. `check:render` pair counts did not
  move: flat 7284, reading 7284, baked 5964 on `main` and on the branch.
- **The Read · Article word cloud fills a third of its box** (`followups.d/2379-p3-word-cloud-rehost-void.md`).

### 8.3 What step 4 built (2026-09-25)

- **The sheet.** `lib/export/cli-deck-sheet.js` is the one builder. `cliThemeStore` registers
  the layout sheet (imports flattened) as `lattice` and each palette in the chain by name.
  `cliDeckSheet` asks that store for `cssFor(theme, size, { flat: true })`, unwraps it, and
  drops the faces the document supplies another way (`dropCoveredSheetFaces`, the engine's
  base64 block and KaTeX's `<link>`). A caller's `--css` sheet registers as `lattice` too: the CLI
  treats it as the layout engine, and `composeCss` inlines the base only under that name. A
  palette that imports no theme at all (an installed package may omit `@import 'lattice'`) gets
  the import, because the unpacked CLI always had the layout sheet under the palette.
- **Unwrapped, not stripped.** The Studio's Webpage player deletes `article.lattice > `, which
  turns "a slide" into "any section": a `<section>` an author nests in a slide took the 1280×720
  box and the light tokens, and clipped. The CLI rewrites the prefix to
  `section:where(:not(section *))`, the same specificity as plain `section`, matching top-level
  slides only. The Studio player now calls the same function (§8.4).
- **The deck's own CSS keeps working.** A red team, an inversion pass and the checker each found
  it: the flat sheet declares every palette `:root` token on the slides too, so an author's
  `style: ":root{--accent:…}"`, or the same in a body `<style>`, reached `<html>` and lost on
  every slide. `packAuthorCss` keeps the author's CSS as written and appends a copy of its `:root`
  custom properties packed onto the slides. Only `--*` is copied: `a11y-base` pins
  `color-scheme: light` at `:root:root` to outrank a deck's `:root{color-scheme:dark}`, and a
  slide-level copy of that turned the a11y palettes' white canvas black. What still differs: a
  bare `section{--accent:…}` override loses to a palette `:root` token, as in Marp and every
  other host. It is in the changelog as breaking.
- **One owner for geometry.** The emulator stopped emitting its own `geometryVarsCss` and
  `orientationCss`. `composeCss` appends both for the same `resolveSize(deckSizeName)`.
- **The unpacked sheet stays for the token readers.** `PALETTE_VARS` and the look's scratch
  document parse `:root` blocks as text, which the pack would hide behind rewritten selectors.
  They read the same bytes as before.
- **The sweep swaps the whole sheet.** The pack inlines the base at the palette's
  `@import 'lattice'` and strips every comment, so no palette-only span is left to splice. The
  sentinels (`lib/core/export-shell-marks.js`) now bracket the whole sheet, and the start mark
  names the deck's size. `tools/palette-sweep.js` composes each palette's replacement with the
  same builder, so the bytes it measures are the bytes the CLI writes for that palette.
  `palette-cascade-order.test.js` pins that equality on a real render. Its vacuity guard
  now swaps in a sheet composed with the base AFTER the palette, rather than cutting and
  pasting two banner-delimited spans.
- **Both player prunes read one-colon pseudo-elements** (§8.1). The CLI's and the Studio's
  (`player-prune-browser.ts`) pass `legacyPseudoElements`. The computed-style gate behind each
  prune is unchanged, so a wrong prune still falls back to the full sheet.
- **The engine's comment stripper is quote-aware.** `composeCss` read a `/*` inside a CSS string
  as an opener, so a custom `--css` sheet with `content: "/*"` lost every rule after it. It now
  uses `stripCssComments`, byte-identical on `dist/lattice.css` and every shipped theme.
- **What it measured.**
  - `npm run regress`, base against branch: 443 targets (every gallery and committed deck, light and dark),
    identical verdicts: 73 drift against their goldens in both runs, on the same pages, because
    those goldens are stale on `main` (followups.d/2317-p2). Two targets moved below the
    tolerance, both the page number on a print slide: `print-mode` (0.02143 → 0.02148 of the
    page) and `finish-canvas-print-face` (0 → 0.00005).
  - Direct base-against-branch renders, every page pixel-diffed: the 117-slide gallery 0 of 116
    pages; `board-update` light and dark 0 of 12 each; `accent-finishes` 0; `print-mode` one
    page, the page number (slate → print gray); `finish-canvas-print-face` its print-face page
    numbers, for the same reason.
  - Author CSS, computed on the slide, base → branch: `style: ":root{--accent;--bg}"` and the
    same in a body `<style>` paint as before; `:root{color-scheme:dark}` as before on indaco and
    on `a11y-base` (stays light); bare `section{--accent}` now loses (the breaking line).
  - Cost: composing the sheet is about 100 ms per export; the gallery render went 9.36 s →
    9.67–9.81 s on a loaded 4-core box. The `--player` export of `print-mode` grew 624,571 →
    657,371 bytes (+5.3%): the flat arms double some selectors. The HTML sidecar shrank 45%,
    because the composed sheet carries no comments.

### 8.2 What step 4 measured, and the fix it needed first (2026-09-25)

- **The prototype.** The CLI took `themes.cssFor(theme, size, { flat: true })` with the
  wrapper stripped and the covered font faces dropped, in place of `layoutCSS + paletteCSS`,
  behind an environment flag. `npm run regress` over all 277 committed decks drifted on 50, and
  a flag-off re-render of each showed that 48 of them drift identically without the flag.
  Those 48 are stale goldens, and `main` itself drifts on the same decks (checked on two).
- **Two slides really moved.** `print-mode`'s page number went gray. It takes
  `--marp-slide-pagination-color: var(--text-muted)`, captured at `:root`, and print
  overrides `--text-muted` on the slide, so the packed sheet is right and today's CLI is wrong.
  `accent-finishes` slide 11 lost its pinned rainbow rail, and there the packed sheet was
  wrong.
- **Why the two go opposite ways.** 50 of the pack's 199 `:root` token declarations derive
  from a token some `section` rule overrides. Unpacked, `var()` resolves once at the root;
  packed, it resolves on each slide and follows the slide's overrides. Most of the 50 want to
  follow (the `--on-accent-*` family on a dark slide, the `--seq-*` ramp). The rainbow capture
  was written to NOT follow, and so worked only in the CLI. The Studio preview, the Playground
  and the Studio player have drawn `spectrum-card: rainbow` on a `solid`/`duo`/`mono` deck as
  the quieter bar all along.
- **The fix, shipped first (owner, 2026-09-25).** A STYLE class sets `--spectrum-style` instead
  of redefining `--spectrum`, and the bar and every rail read `--spectrum-bar`. `--spectrum`
  stays the theme's ribbon on every element, so the capture reads it in both shapes. `print`
  still redefines `--spectrum`, because paper is grayscale and a pinned rainbow on it should
  turn gray. Pinned by `test/unit/css/spectrum-root-capture.test.js`. The CLI renders
  `accent-finishes` pixel-identical before and after, the flat-sheet prototype now matches
  it (0 px), and the Studio preview shows the rainbow rail.
- **Still to decide:** whether the CLI now converges. The measured cost after the fix is one
  slide, `print-mode`'s page number, which moves to the correct ink.

Step 1 rode #2344 at the owner's request. Steps 2 to 4 ride #2366, one commit each, the
line of work the owner asked for on 2026-09-25.

### 8.1 What step 3 built (2026-09-25, #2366)

- **The sheet.** The Reading view asks for the `flat` mode and ships what
  `scopeReHostedCss` keeps of it. The kernel prunes the pack to the rules the projected
  article's DOM matches, the same kernel the player's prune uses. Then it rewrites every
  selector S to `:where(.st-read-article) S:where(.lp-figure, .lp-figure *)`, so a deck rule
  can only reach a figure of this article, and it turns `:root` into `.lp-figure`, so the
  palette lands on each figure and not on the app's `<html>`. Measured on the 22-chart
  gallery: 838 KB of flat pack becomes 93 KB, 296 of 3700 rules. The two css-tree parses
  took 0.5 s in Node, and the browser adds about 7,500 `querySelector` calls on top. All of
  it runs on the main thread each time the view re-renders. Browser timing is not measured
  yet.
- **What the fence cannot hold is dropped.** A selector fence reaches style rules only. A red
  team found four ways past it, each observed in Chromium 131: a deck `@font-face` named like an
  app family takes the app's text (and per-glyph `unicode-range` sources beacon which
  characters it draws); a deck `@keyframes spin` replaces the app's own; `@property` registers
  an app custom property with a deck `initial-value`; and a deck `url()` fetches from the app's
  origin, because the Studio's top-level document carries no subresource CSP (the preview
  iframe and every export do). So the kernel drops every global-namespace at-rule at any depth
  (unwrapping a `@layer` block rather than losing its rules), and every declaration that names
  a remote resource. `data:` and relative urls stay. Figures keep their paint and lose motion
  and deck-only faces.
- **Not `@scope`.** That was the first draft, and it cannot work. Inside `@scope (R)` a
  selector with no `:scope` is read as a descendant of R, so the re-host arms, which start
  AT the figure (`figure.chart-frame .chart-status`), never match. Every chart painted
  black.
- **The one-colon pseudo-elements.** The Studio's engine bundle ships `lattice.css`
  minified, which writes `::before` as `:before`. css-tree reads that as a pseudo-class, so
  the prune asked `querySelector` for `.x:before`, matched nothing, and dropped every state
  marker. `baseSelectorString` can now treat the four CSS 2 pseudo-elements as pseudo-elements,
  and this sheet opts in. **The player's prune does not, yet.** It has the same blind spot: the
  CLI's unminified sheet still carries KaTeX's one-colon rules, and the Studio export's prune
  likely fails its computed-style gate on it and ships the full sheet. Fixing it changes export
  bytes, so it rides with step 4, which owes export sign-off anyway.
- **The app's prose rules stay off the charts.** `READ_ARTICLE_CSS`'s element rules
  (headings, paragraphs, lists, quotes, pre, tables) carry `:where(:not(.lp-figure *))`. Before
  that, its table rules drew grid lines over the roadmap and padded its markers away. The
  `:where()` matters: a bare `:not()` took its argument's specificity and moved the article's
  own kicker, subtitle and roster (a checker measured the kicker's gap going 3 px → 11.5 px).
- **The gate.** `check:render` has a `reading` pass: the article in a page of its own
  carrying only this sheet, compared with its slide (7284 pairs). An arm with no sheet (the
  view as it shipped before) fails it. Four title-slide prose inks are sanctioned: prose
  takes the app's ink by design. The real surface is
  `docs/e2e/studio-read-article-charts.spec.ts`: the chart gallery in the built Studio,
  light and dark. It checks that no chart is mostly black, no status pill has lost its
  background, no state marker has lost its disc, the app chrome is unchanged with the article
  open, and the page never scrolls sideways at 1440, 820 and 390. With the one-colon fix
  reverted, it fails on 15 of 15 roadmap markers.
