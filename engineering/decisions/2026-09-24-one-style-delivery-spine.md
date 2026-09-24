---
status: proposed
summary: Every surface shares one Markdown engine, one article builder and one player assembler, but each surface decides on its own how the deck's stylesheet reaches it, and there are five answers. Every black-chart bug so far (#956, #715/#2210, #2264, #2344) was one surface's answer drifting from the rest. Proposal — the engine owns style delivery as three named modes (scoped, flat, baked), every surface asks for one by name, and `check:render` renders every mode instead of only the preview's. Nothing is built; four forks go to the owner (§7).
---

# One style-delivery spine — every surface gets the deck's CSS the same way

> **Proposed.** Nothing here is built. #2344 fixed one instance and added the `flat`
> mode this note builds on. §7 lists the four decisions that are the owner's.

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

## 6. What this does not change

- **Slide rendering in any mode.** #2344 showed that the flat mode can be purely
  additive: 278 before/after slide captures with no change.
- **The preview's scoping.** It is correct for the preview, and Marpit
  compatibility depends on it (`engineering/gotchas/marp.md`).
- **Export-to-Marp** (`lib/core/marp-bundle.js`). marp-core does its own packing,
  outside our control.

## 7. Decisions for the owner

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
   it, and it would fail today on the Reading view, which is the proof it works.
2. **Name the modes (§4)** and route the three existing hosts through them. No
   output changes; the extended gate must pass byte-identically.
3. **The Reading view** (fork 2). This closes
   `followups.d/2344-p1-studio-reading-view-charts-render-black.md`.
4. **The CLI** (fork 3), with export sign-off.

Each step is its own PR.
