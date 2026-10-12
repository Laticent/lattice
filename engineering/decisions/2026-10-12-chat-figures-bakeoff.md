---
status: shipped
summary: Chat replies that carry a mermaid, math or function-plot fence, or a whole Lattice slide, should draw it in the bubble. Four ways to draw one were built against the same figures and measured in real Chromium: one iframe per figure, a re-pointed pool of iframes, a bake to inline SVG, and a bake to an image. The pool wins on every cost that grows with the transcript (+95 to +159 MB at 40 figures against +325 to +641 MB for one iframe each), and baking loses on time (about 1 s per figure, 25 to 45 s for 40) without saving memory. WebKit, where the pool matters most, is not measured here.
companion:
  - ./2026-09-13-gallery-preview-memory.md
  - ./2026-10-05-studio-chat-agent.md
---

# How a chat bubble draws a figure

**Date:** 2026-10-12
**Instrument:** `tools/chat-figures-bakeoff.mjs`, against the harness page `docs/src/pages/proto/chat-figures.astro`
(`docs/src/components/proto/ChatFiguresBakeoff.tsx`). Delete those three files to revert.

## 1. The ask

> we don't support rendering of lattice slides. we don't support rendering of plugins we support (ie
> mermaid, math, function plot, etc). for example if i return mermaid diagram in fence code i would
> hope we leverage mermaid plugin to render the mermaid diagram. our plugins should work outside the
> deck [...] it seems we use a pool for iframes and they seem heavy so we need to be mindful and do a
> bake off before deciding. maybe we need a separate pool? maybe baking to static inline is a great
> alternative but without numbers we can't decide

Today a ` ```mermaid ` block in a reply prints as source (`ChatCodeBlock`), and a slide the model writes
shows as Markdown text.

## 2. What exists

No function takes a language and a source and returns an SVG. Every plugin draws through the engine,
and the runtime finishes the job inside an iframe:

| Plugin | Where it draws |
|---|---|
| `math` | the engine, at render time (`katex.renderToString`). Final HTML; needs the KaTeX stylesheet |
| `functionplot` | the engine emits a placeholder; the runtime's hydrate host draws it |
| `mermaid` | the runtime draws it after the engine leaves a `<pre><code class="language-mermaid">` |

Two working precedents draw a figure outside the deck. `DeckPreview` draws one slide in a scaled iframe
(`createSingleSlideRenderer`). Read · Article's `projectDeckArticle` renders the deck, **bakes** the
runtime-drawn figures to static SVG and sanitizes the result. The Studio's `PreviewPool` and
`PooledThumbFace` hold a small set of iframes and re-point them at whichever tiles are on screen; its
memory story is `2026-09-13-gallery-preview-memory.md`.

## 3. The four strategies

| Name | What a figure is | Code it reuses |
|---|---|---|
| `eager` | one `DeckPreview` (one iframe, one document) per figure, all mounted | `DeckPreview` |
| `pool` | a tile in a `PreviewPool` wrapped around the transcript's scroll content: at most a handful of frames, re-pointed as figures scroll into view | `PreviewPool`, `PooledThumbFace` |
| `bake` | `projectDeckArticle` on a one-slide deck, inlined as sanitized SVG | Read · Article |
| `bake-img` | the same bake, with the SVG written to a `Blob` URL and shown as `<img>` | Read · Article |

`pool` already is "a separate pool": `PreviewPool` is one per scroller by design (its header: "one pool
per grid rather than one per app"), so the chat gets its own instance and shares no frames with the
add-slide gallery.

## 4. Method

One figure kind per run (`mermaid`: a six-node flowchart; `math`: a display equation and an inline sum;
`plot`: two curves; `slide`: a four-card slide), `n` of 0, 1, 10 or 40 copies, each in a 400 px column
that scrolls. A **fresh Chromium** (puppeteer, headless, 131) launches per run, so one run's memory
cannot reach the next. The runner reads, per run:

- time from mount to the first figure drawn, and to every figure it expects to be live drawn;
- Chromium's own counters (`Performance.getMetrics`: documents, frames, nodes, JS heap);
- resident memory (RSS) summed over the browser's whole process tree, against an `n=0` baseline of the
  same page (about 790 MB: the browser and the engine, nothing drawn);
- after a jump to the bottom of the transcript, the time until the figures there are drawn.

"Expected live" differs by strategy. `eager` and the bakes owe all `n`; `pool` owes only the tiles in or
within 150 px of the viewport, because drawing the rest is the pool's whole point. Compare `pool`'s cost
on the **scroll jump** line, not on the settle line.

## 5. Results

RSS is over the strategy's own `n=0` baseline. Times are wall clock on one machine, one run each.

| figure | strategy | first figure, n=1 | all settled, n=40 | RSS, n=1 | n=10 | n=40 | live iframes, n=40 |
|---|---|---:|---:|---:|---:|---:|---:|
| mermaid | eager | 1.2 s | 9.9 s | +81 MB | +247 MB | +630 MB | 40 |
| mermaid | pool | 1.4 s | 2.1 s* | +81 MB | +154 MB | +139 MB | 4 |
| mermaid | bake | 2.6 s | 44.7 s | +214 MB | +596 MB | +782 MB | 0 |
| mermaid | bake-img | 2.5 s | 43.3 s | +205 MB | +534 MB | +691 MB | 0 |
| plot | eager | 0.8 s | 8.7 s | +80 MB | +218 MB | +641 MB | 40 |
| plot | pool | 1.1 s | 1.9 s* | +82 MB | +160 MB | +159 MB | 4 |
| plot | bake | 2.0 s | 38.9 s | +168 MB | +874 MB | +1151 MB | 0 |
| plot | bake-img | 2.1 s | 37.7 s | +154 MB | +556 MB | +681 MB | 0 |
| math | eager | 0.8 s | 3.5 s | +75 MB | +128 MB | +325 MB | 40 |
| math | pool | 0.9 s | 1.0 s* | +75 MB | +126 MB | +122 MB | 4 |
| math | bake | 1.8 s | 27.6 s | +158 MB | +319 MB | +376 MB | 0 |
| math | bake-img | 1.9 s | 26.3 s | +152 MB | +429 MB | +400 MB | 0 |
| slide | eager | 0.6 s | 2.0 s | +69 MB | +131 MB | +324 MB | 40 |
| slide | pool | 0.8 s | 1.0 s* | +69 MB | +109 MB | +95 MB | 4 |
| slide | bake | 1.6 s | 24.6 s | +161 MB | +311 MB | +408 MB | 0 |
| slide | bake-img | not applicable: a slide has no standalone `<svg>` | | | | | |

\* Only the figures in view; see §4.

The pool's cost on the jump to the bottom of a 40-figure transcript is **5 to 134 ms** (slide 5, plot 86,
mermaid 123, math 134), and its frames end at 4 live iframes.

## 6. What the numbers say

1. **A pool is flat; one iframe each is linear.** At 40 figures the pool sits within 15 MB of its
   10-figure reading (mermaid 154 to 139, plot 160 to 159, math 126 to 122, slide 109 to 95), while `eager`
   climbs to +325 MB (math, slide) and +630 to +641 MB (mermaid, plot). The first figure costs the same
   under both (the engine and runtime load once, +69 to +81 MB). For the heavy figures the pool is ahead by
   10 figures (mermaid +154 against +247, plot +160 against +218). For math and slide the two tie at 10
   (126 against 128, 109 against 131) and the pool pulls ahead after that. A transcript with a handful of
   light figures sees no difference; one with dozens sees 3 to 4.5 times the memory.
2. **Baking is slow, and heavier than the iframes it was meant to replace.** Each projection renders the
   deck, runs a capture frame and sanitizes: 24 to 45 seconds for 40 figures, with two running at once.
   Its RSS is higher than `eager`'s at every size measured, and the highest of all at 40 for `plot`
   (+1151 MB). The finished inline SVG holds no iframe (0 live frames), but the browser does not give back
   what the bake used, so the saving the design promised does not show up in RSS. `bake-img` trims the
   plot case to +681 MB and is otherwise within 10% of `bake`. The cause of the retained memory is not
   isolated here: a capture frame that is disposed between figures would be the first thing to try, and
   the 25 to 45 s would remain.
3. **The pool's first figure is 0.1 to 0.3 s later than `eager`'s.** That is the pool's own 220 ms
   re-point debounce (`APPLY_MS`), and it is the price of the flat line.
4. **Presentation differs, and it is a choice.** A pooled figure is a **slide** in the deck's theme
   (frame, heading, edge line). A baked figure is a **bare diagram** with no frame, which suits a diagram
   in a sentence better than a slide does. If a bubble should show a bare diagram, the pool can draw a
   minimal wrapper slide, and that is a design choice for the build, not a measurement.

## 7. Decision

**Draw chat figures through a `PreviewPool` of their own, around the transcript's scroll content.** It
is the only strategy whose memory does not grow with the conversation, it reuses a measured, tested
component, and it needs no new sanction under HARD RULE #22: the pool renders through
`createSingleSlideRenderer`, which is already on `SANCTIONED_PREVIEW_BUILDERS`. Baking is rejected on
time and memory. A per-bubble `DeckPreview` is rejected on memory.

Plugin admission follows the deck: the chat renders through the engine using the open deck's front
matter, so a plugin the author turned off for the deck stays off in the chat.

## 7b. What shipped (2026-10-12)

- **`ChatFigure`** draws a fence as a tile in the transcript's own `PreviewPool`
  (`docs/src/components/studio/ChatFigure.tsx`, `chat-figures.ts`). Fences that become figures:
  `mermaid`, `math`, `functionplot` (and its `latticeplot` alias), and `lattice`, whose body is one
  slide's Markdown. `anima` is excluded: a still of an animation is wrong. A figure over 8,000
  characters, or with no render context, stays a code block, and every figure has a **Source** toggle.
- **The pool takes a floor from its caller.** `PreviewPool` gained `baseSlots` (default
  `BASE_SLOTS`, 10, so every existing grid is unchanged). The chat passes 4: the cap still grows to
  cover everything on screen, so the floor is what an off-screen figure may hold.
  In the real Studio that is a bound by the **visible** count, not a constant: a docked column at
  1440 px shows about seven short figures at once and held nine frames; the phone showed three.
- **Each figure is a one-slide deck in the open deck's front matter**, so it takes the deck's theme,
  mode and plugin admission. The render context is the one the shell already hands the chat for its
  fit check (`grounding.fitRender`), so the shell did not change.
- **The agent is told** (`buildAgentSystem`) that these fences draw in the chat and are not edits.
- **Verified** in real Chromium by `docs/e2e/chat-figures.spec.ts` at 390, 820 and 1440 px: fourteen
  fences became fourteen figures, the diagram, the equation and the slide drew, no figure printed as
  source, no sideways scroll, and the frame count stayed below one per figure.

### Known limits

- **A bare `math` fence sits left of an empty legend column.** The `math` layout is a hero equation
  plus a legend, and a chat equation has no legend. It reads, and it is not centered. A model that
  wants a legend writes a `lattice` fence holding a full `math` slide. A centered, legend-free
  equation figure is a layout decision, not a measurement, and is left open.
- **A figure flashes when its reply commits.** The streaming bubble unmounts and the committed
  message mounts a new tile, so the pool re-points the frame once. Not measured.
- **Not drawn: `anima`, video, and anything the engine admits only per deck.** A figure follows the
  open deck's plugin choices by construction.

## 8. What this does NOT show

- **WebKit is not measured.** The pool exists because WebKit never reclaims a preview document that is
  torn down (`2026-09-13-gallery-preview-memory.md`: 149 to 442 MB over five create/destroy cycles with
  nothing alive). That makes the gap between `pool` and `eager` larger on iOS, not smaller, but the size
  of it here is unmeasured. A phone check on the real chat is still owed (HARD RULE #23).
- **One machine, one run per cell.** The shapes (flat against linear against slow) are the finding; the
  run-to-run spread was not measured, so a gap of 10% or two cells tied at 10 figures (math, slide) is
  not a result. The 3 to 4.5x gap at 40 figures, and baking's 10x on time, are well outside any spread
  this instrument is likely to have.
- **The fixtures are small.** A larger diagram widens `bake`'s time and the iframe's cost together.
- **The harness pins every figure in a 400 px column.** The real transcript has prose, code blocks and
  proposals between figures, and a 4-frame pool is what a 560 px viewport holds. A taller panel holds
  more.
- **Bake concurrency is 2.** A wider fan-out would shorten wall time and raise peak memory. No setting
  is expected to bring 40 bakes under the pool's time.
