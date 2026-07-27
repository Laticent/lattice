---
status: shipped
summary: SVG-native chart legend and spine via a shared builder, replacing the fixed HTML legend across all four keyed charts
---

# SVG-native chart legend + spine — design model & spike plan

**Date:** 2026-06-13
**Status:** SHIPPED — spike (piechart) then fanned out to radar, map, and cohort
quadrant. All four keyed charts are SVG-native via the shared builder
(`svg-legend.js`); supersedes the fixed-size HTML legend shipped in #233 and the
pure-CSS 70/30 rail (`2026-06-11-chart-legend-system.md`).
**Predecessor:** `#233` (fix: chart family responsive) made the diagrams
box-fit and demoted the legend to an honest **fixed** `--fs-body-compact` after
proving that `cqh` in `font-size` does **not** track a container the way it does
in layout properties (the key stayed put while the diagram scaled).
**Files in scope (spike):** `lib/components/chart/_chart-family/chart-family.js`
(pie legend emit), `lib/components/chart/_chart-family/chart-family.css` (retire
the 70/30 grid + spine `::before` + legend flex *for piechart*), the two sibling
render paths (`lattice-emulator.js` inline chart-family block,
`dist/lattice-runtime.js` mirror) per HARD RULE 1.

---

## 1. Problem

The four keyed charts (`piechart`, `radar`, `map`, cohort `quadrant`) lay out as
a **CSS 70/30 grid**: diagram SVG in the left 70 % cell, an **HTML** `<ol>`
legend in the right 30 % cell, a gradient **spine** on the boundary (the
figure's `::before`). The diagram is SVG-in-a-viewBox and scales perfectly; the
legend is HTML and **cannot be made to scale proportionally with it** — `cqh` in
`font-size` resolves in a different phase than layout `cqh`, so the key either
sits full-size beside a shrunk diagram or (pre-#233) truncated. #233's fix was to
freeze the key and let the diagram shrink *into* the freed room. That is honest
and ships, but it is a floor: the key never grows on a `cover` / full-screen
chart, and the chart is **not a single self-contained unit** (the export-this-
diagram property we want).

## 2. Decision

Make the legend **and** the spine part of the **same `<svg>` viewBox** as the
diagram, so the whole chart is **one unit that scales uniformly** — thumbnail to
full-bleed — and exports as one self-describing file. The CSS 70/30 grid, the
spine `::before`, and the legend flex column all **retire**, replaced by
viewBox-internal geometry the kernel emits.

```
 before (CSS grid):  [ <svg> diagram 70% ][ ::before spine ][ <ol> HTML key 30% ]
 after  (one svg):   <svg viewBox="0 0 286 200"> diagram(0..200) │spine│ <text> key(200..286) </svg>
```

The figure element keeps only **sizing** CSS (fit the body, centre, max
dimensions); everything *inside* is viewBox units, so the key scales with the
diagram by construction — no `font-size` container-query juggling, ever.

### Why this is the right architecture (not just a workaround)
- **Proportional by construction** — one viewBox, one scale factor. Dissolves
  the `cqh`-in-`font-size` class of bug entirely.
- **Self-contained / exportable** — data + key + spine + labels in one SVG.
- **`cover` / full-screen "just works"** — the key scales up with the diagram.
- **Deterministic** — viewBox coordinates, no flex/grid height-resolution quirks
  (the `height:100%`-won't-resolve trap #233 fought).

## 3. The trade we are accepting (eyes open)

The current legend system's headline virtue is that it is **pure CSS keyed on
the figure/legend classes — "all three render paths inherit it with zero
transform edits"** (`chart-family.css:523`). Going SVG-native **moves that
geometry into the kernel**, which must therefore run **identically in all three
render paths** (HARD RULE 1). We trade *free CSS inheritance* for *kernel-emitted
geometry*. That is the cost; §4 pins how we pay it without regressions.

**Accessibility (the second trade — paid, not just accepted).** The key text now
lives inside an SVG the kernels mark `role="img"`, which on its own would collapse
the whole chart to one opaque image named only by its `<title>` (the chart type),
dropping the per-row names + values that the old HTML `<ol>` exposed as a real
list. We pay this back: `buildSvgLegend` emits a `<desc>` re-enumerating every key
row (`"Key — India 48.2, Nigeria 36.4, …"`, group heads as `"Asia:"`), so the data
stays in the accessibility tree as the image's *description*. Not a per-item list
like the old `<ol>`, but the content is no longer lost — an honest, disclosed
middle ground (flagged by the maker-checker assessment; pinned by a unit test).

## 4. The three load-bearing decisions

### (a) Text-wrapping model — the crux
SVG `<text>` does not auto-wrap; HTML did it for free (the "labels WRAP, no clip
— if users go crazy" guarantee, `chart-family.css:519,645`). The kernels are
**pure JS, no DOM, no font-metrics engine**, so we cannot measure glyph advances
at build time. Decision:

> **Word-boundary wrap to a character budget**, derived from the rail width in
> viewBox units and a **conservative average advance** (≈ `0.6em` for the label
> sans). Wrap **FULLY — no line cap, no ellipsis** (a single over-long token is
> hard-broken across lines, matching CSS `overflow-wrap`). Emitted as
> `<tspan x=… y=…>` rows. Deterministic, pure-JS, identical in all three paths.

Rationale: the budget is **conservative** (break early) so an approximate metric
never *clips* and never reaches the reserved value column. The SVG-native key
**KEEPS the original "labels wrap, never clip" guarantee** — no ellipsis ever.

### (a-bis) The legend font is FIXED-ratio; the UNIT scales, never the font
A tempting-but-wrong move (rejected after review): when many rows overrun the
viewBox, shrink the *font* to fit. That makes the key look puny beside a full-
size disc and — worse — gives two pies with different slice counts **different
legend text sizes**. Inconsistent and amateurish. Decision:

> The legend font is a **fixed number of user units** (`FS = 9`) — a constant
> **ratio** to the disc. Because the whole `<svg>` scales to the container
> (`height:100cqh` / the cover `cqi` size), the key scales **with the
> container**, in lockstep with the diagram (small in an islands thumbnail,
> large on a cover) — but it is **never re-shrunk per chart** by slice count.
> "Fixed" means fixed in viewBox units, **not** fixed pixels.

Overflow is absorbed by the **viewBox HEIGHT**, not the font: `VB_H =
max(200, stackH + 2·margin)`. ≤6 slices (the pie's own perceptual cap —
`PIE_PALETTE` is 6, and the docs say consolidate past it) always fit the disc's
200-unit box at `FS = 9`, so **every real pie's key is identical** (`VB_H` stays
200, the disc keeps its size). A pathological long-tail key grows `VB_H`, so the
**whole unit — disc AND key — renders a touch smaller in lockstep**; the font's
ratio to the disc is unchanged, so the key is never singled out and shrunk. The
disc therefore centres on `cy = VB_H/2`, and the CSS drops any static
`aspect-ratio` so the intrinsic viewBox aspect drives sizing.

**Swatch alignment.** The swatch `<rect>` centres on the **first line's** optical
middle (`baseFirst − 0.34·FS − SW/2`), not the whole multi-line block, so a
wrapped 2–3 line label still reads as one keyed row (swatch ─ first line ─ value
all on one optical line).

### (b) Font-token routing + a sketch re-verify gate
Today the **sketch** finish reskins the HTML legend **for free**, because
`section.sketch` re-points `--font-body`/`--font-label` to the hand faces and the
HTML legend inherits them (`base.sketch.css:36-40` — "it reskins… the HTML
legend"; and it explicitly **"cannot reach inside a chart's SVG geometry"**).
Move the key into `<text>` and it leaves that free zone. It is **recoverable**:
SVG `<text>` honors `font-family`, and CSS custom-property inheritance crosses
the SVG boundary, so the legend text **must** pull the token, never a literal:

> Legend `<text>` carries `class="legend-label"` / `legend-pct` and the CSS sets
> `font-family: var(--font-label)` (label voice) — so `section.sketch`'s token
> re-point reaches it exactly as it reached the HTML. **Hardcoding a face here
> silently breaks sketch on charts.**

**Gate:** the spike is not done until a `class: sketch` render of the piechart
shows the **hand font on the legend** (Shantell), light + dark. This is a
named acceptance criterion, not an afterthought.

### (c) No SVG filter on the text — and the scaling proof
The scaling worry is real but lands on **filters, not text**: the sketch spike
found an SVG `filter` (`feTurbulence`/`feDisplacementMap`) **collapses Marp's
print-scale transform** — the slide shrinks into a PDF corner
(`2026-06-11-sketch-finish.md` §"load-bearing constraint"), because the PDF path
wraps each slide in a scaled `<svg>` (`inlineSVG:true`). Plain `<text>` is **not**
a filter — it is vector glyphs re-rasterized crisply at the print scale by the
same font pipeline HTML uses.

> **Proof already shipping:** the chart **axis/rim labels are SVG `<text>` in
> this same viewBox and scale fine through this exact PDF path.** The legend text
> is the same primitive. **Hard rule for this work: never put an SVG `filter` on
> legend/diagram text.**

And `<foreignObject>` (HTML-in-SVG) is **out** — the engine banned it: mobile
Safari "cannot lay out HTML inside a scaled `<foreignObject>`" (counters → "00",
**chart labels balloon and overlap**, masks drop — `lib/playground/index.js:64`).
Native `<text>` is the only viable SVG path; that is *why* §4(a) exists.

### (d) Export font fidelity — embed or outline, never naked
SVG `<text>` stores a **`font-family` name, not the glyphs**, so the
"self-contained export" pro (§2) has a sharp edge: a *detached* exported `.svg`
opened where the font isn't installed **falls back to serif** — the sketch hand
face would not travel. Two contexts, two answers:

- **In-deck** (SVG living in the rendered deck/page): the hand font shows — the
  SVG text uses the page's already-loaded engine fonts, exactly like the HTML
  legend today. **The spike needs nothing here.**
- **Standalone export** (future feature): embed or outline. Decision:

> **Default: embed a *subsetted* `@font-face` (base64 woff2) in the SVG
> `<defs><style>`** — text keeps referencing the family name, the font travels
> inside the file, the export is self-contained AND text stays selectable.
> **Reuse `docs/src/playground/font-embed.js`** — it already builds data-URI
> `@font-face` CSS for exactly these sketch faces (written for the Drawing Board
> export's identical "baked a fallback" bug, `2026-06-11-sketch-finish.md` →
> 2026-06-12 update). Offer **outline-to-`<path>`** as a "maximum-portability"
> toggle (zero font dependency, renders anywhere, trivial size for a legend's few
> labels; loses text selectability). **Never emit a naked export.**

Verification caveat (this sandbox): Chromium can't fetch the Google-Fonts CDN
(TLS proxy), so even in-deck sketch renders fall back to system fonts unless the
local-embed pipeline runs — which is why the committed `sketch.pdf` used the
Puppeteer local-embed path. Verify the spike's sketch font through that same
path; it is an environment quirk, not an architecture limit.

## 5. Colors stay on tokens (non-issue, confirmed)
The wedges already fill via `var(--chart-cat-N-hue)` (`chart-family.js:33`) and
the wedge gradients use `stop-color: color-mix(… var(--token) …)`
(`chart-family.js:319`). The legend port keeps the same plumbing:
- swatch → `<rect fill="color-mix(in oklab, var(--chart-cat-N-hue) 82%, var(--bg))">`
  (identical to the current HTML swatch background)
- label/value → `<text fill="var(--text-body)">`
- spine → `<rect fill="url(#chart-spine)">` where the `<linearGradient>` stops are
  the existing `--chart-spine` stops (`accent`→`transparent`), as `stop-color`.

HARD RULE 3 (no hex, always `var(--token)`) holds with **zero** new literals.

## 6. Spike plan — piechart first, then fan out

1. **Design gate (this doc).**
2. **Spike `piechart` only.** Widen the figure SVG viewBox to include a rail;
   emit swatch `<rect>` + label/value `<text>`/`<tspan>` (per §4a) + a spine
   `<rect>`+`<linearGradient>`. Retire the pie's 70/30 grid / `::before` / legend
   flex CSS; keep only the figure-sizing CSS. Land it in `chart-family.js` (the
   shared module) and mirror into the emulator inline block + runtime per HR 1.
3. **Verify the spike against named criteria (§7) and *look at it*** — boardroom
   + `islands` + `cover`, **light & dark**, **and `class: sketch`** (the 4(b)
   gate). Pixel-check, parity tier.
4. **Decision point.** If it is boardroom-10/10 and sketch skins it → fan out the
   identical model to `radar`, `map`, cohort `quadrant` (they already share the
   `.chart-frame` rail tokens, so the port is mechanical). If wrapping reads ugly
   or sketch can't be routed cleanly → stop, having spent **one** chart, and keep
   #233's fixed key as the floor.

The four charts share the rail today, so the spike must NOT half-migrate the
shared CSS: gate the new path on the piechart selector only, leave the other
three on the CSS grid until they graduate (HARD RULE 8 — isolate feature content
from the long-running galleries; charts graduate in a separate post-review step).

## 7. Acceptance criteria (met — pie spike AND the radar/map/quadrant fan-out)
- [x] Diagram + legend + spine render as **one SVG** on all four keyed charts; no
      CSS 70/30 grid / `::before` spine / legend flex / HTML `*-legend` remains.
- [x] Legend **scales with the diagram** at thumbnail, boardroom, and `cover`
      sizes (verified by eye, light + dark, all four charts).
- [x] Long labels **wrap fully (no ellipsis)**; no clip, no rail overrun.
- [x] Legend font is a **fixed ratio of the diagram height** — same physical size
      across all four charts; a long-tail key grows the **viewBox** (whole unit
      scales), never the font. Swatch centres on the first line.
- [x] **`class: sketch` routes the hand font to the legend** via `--font-label`
      (proven in the built CSS — the same mechanism as the heading; the glyphs
      need the webfont, unavailable in the sandbox per the §4d caveat).
- [x] All colors via `var(--token)`; lint / unit (1652) / chart-family parity all
      green.
- [x] Three render paths emit identical legend geometry (parity tier green).

## 7b. Fan-out result + the one gotcha
The model ported mechanically to the three kernels via the shared builder
(`composeFigure` in radar; direct in map/quadrant) — each: build diagram inner →
compute rows → `buildSvgLegend` → wrap diagram in `<g transform="translate(0
dy)">` for vertical centring → one `<svg>`. The **non-obvious cost was figure
sizing**, not the kernels: each component's grid-era CSS pinned the svg with a
square `aspect-ratio` (radar `1/1`) or a `max-height`/`aspect-ratio:420/320`
(quadrant) that **letterboxed the now-wider unit tiny**. Fix: a shared
SVG-native sizing rule (height-bound `100cqh`, width follows the viewBox aspect)
+ scoping each component's old cap to its non-rail variants. Lesson for any
future SVG-native conversion: **audit the component's existing `aspect-ratio` /
`max-height` first** — the kernel is the easy part.

**Leftover token ownership.** The `--chart-spine` / `--chart-spine-w` /
`--chart-spine-h` tokens survive the rail retirement because `word-cloud` (a
`chart-frame` member that is NOT one of the four keyed charts) still draws its own
CSS spine from them. That is correct, not a half-migration — word-cloud never had
a key. But it now *solely* owns those tokens; a future cleanup could move them
onto `section.word-cloud` and drop them from the shared `section.chart-frame`
block.

> **CORRECTION — 2026-07-27.** The sentence "word-cloud never had a key" was
> wrong, and stayed wrong here for six weeks. word-cloud shipped a
> `size = frequency` key (`.wc-key` — an `aria-hidden` A-ramp in the right rail)
> that this section did not account for. The SCOPING decision was still right:
> word-cloud's key is a size ramp, not the swatch·label·value rows
> `buildSvgLegend` builds, so it could not have been folded into the four-chart
> fan-out. Only the stated reason was false.
>
> It was found by the `render` field's derivation (#1201), which measures what a
> component actually draws and reported word-cloud as `hybrid` — prompting the
> question this paragraph had answered incorrectly. That is the argument for
> deriving rather than asserting, made against this document.
>
> **The cleanup this paragraph anticipated is now done.** word-cloud's key and
> spine moved into its viewBox on 2026-07-27, so the `--chart-spine*` trio has no
> reader left and is deleted rather than relocated. The spine geometry both
> callers now share lives in `svg-legend.js buildSpine`. See
> `engineering/decisions/2026-07-27-chart-family-all-svg.md`.

## 8. Alternatives considered (and why not)
- **Keep #233's fixed HTML key (do nothing).** The floor; loses proportional +
  self-contained. Fine if the spike fails.
- **`<foreignObject>` legend.** Free HTML wrapping + viewBox scaling, but
  re-introduces the banned mobile-Safari failure class (§4c). Rejected.
- **Scale the whole figure (diagram + HTML key) via one outer scaled SVG.** That
  is exactly Marp's `inlineSVG:true` slide wrapper, which the playground had to
  drop on mobile Safari. Rejected for the same reason.
- **Big-bang all four kernels at once.** Pays the wrapping + sketch-routing cost
  ×4 before knowing it reads well. The spike-then-fan-out (§6) de-risks it.
