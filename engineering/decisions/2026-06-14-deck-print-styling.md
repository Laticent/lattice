---
status: shipped
summary: Print support that survives the boardroom on paper, in colour and B&W, via a print token band + textures and auto-paper-fit
---

# Print styling — a deck that survives the trip to the boardroom, on paper, in colour *and* black-and-white

## The "Print drawer" (shipped 2026-07-12) — supersedes the separate Print page

> **Built.** "Print deck" is now a **sub-drawer of the Share sheet** (`PrintOptionsPanel.tsx`),
> alongside the PDF-export options step — not a separate tab. It carries the same
> brass-on-navy boardroom look as the page it replaces: a navy preview stage, the white
> sheet with the dashed safe-margin, a live per-slide `buildSrcdoc` preview + pager, and
> brass segmented controls for paper (auto/Letter/Legal/A4) · orientation · colour
> (colour / B&W → `class: print`). **Print stays platform-best:** DESKTOP prints the
> *vector* deck via a hidden HTML iframe (`buildSrcdoc` `printRules`) — HTML-in-iframe
> `print()` reliably opens the dialog (a PDF-in-iframe won't auto-print in Chrome) and
> desktop honors `@page`, so it's crisp + one-slide-per-page, and needs **no PDF at all**;
> iOS opens the *real PDF* for the native Share → Print (iOS ignores `@page` + forbids
> scripted printing). **Download** saves the PDF on both. Fit stays removed — always
> scaled to fit, centred, never cropped.
>
> **Why the pivot (owner call):** the separate `/studio/print` page worked but earned no
> payoff for its cost — a whole route, a postMessage handshake, a second full-tab UI to
> maintain — *given every browser's print constraints land the same either way.* The
> drawer keeps the beloved preview + config in one place the user already is, and drops
> the handshake entirely.

**Build on demand, never on config change (owner call).** An earlier pass *pre-generated*
the PDF as the deck became ready and on every paper/orientation flip — reliable, but
wasteful churn: it re-rasterized the whole deck on each toggle, and desktop Print never
even uses the PDF. So the PDF is now built **only when the user clicks Print or Download**,
and cached by `(render, paper, orientation)` so a repeat click with the same settings
reuses it. The live preview is cheap engine HTML (re-rendered only on a *colour* change;
paper/orientation just re-fit via CSS), so configuring stays free.

**The two constraints that shape the print paths.** The rasterizer (`html-to-image` + rAF)
only runs in a **foreground** tab — opening a tab marks the opener `document.hidden` and
freezes it — and a `window.open` **after an await** is pop-up-blocked (the tap's
user-activation is spent). On-demand building can't satisfy both in one tap on iOS, so:
- **Desktop** — Print prints the vector HTML via a hidden iframe. No PDF, no await, one tap.
- **iOS** — Print is **two taps**: tap 1 builds the PDF in the **foreground** (no tab open →
  no freeze); the button arms to **"Open PDF to print"**, and tap 2 hands the built file to
  **`navigator.share({ files })`** synchronously in that gesture — the native share sheet has
  Print/AirPrint and renders reliably across iOS browsers. This matters: `window.open(blobURL)`
  on iOS WebKit (notably **iOS Firefox**) *downloads* the PDF instead of showing it, so the
  user never reaches Print. Where Web Share files aren't supported, fall back to opening the
  blob in a tab (never navigating the Studio away).
- **Download** (both) — build on click (cache-aware), then `<a download>`.

**Architecture:**
- `ShareSheet` gains a `'print'` view; the "Print deck" row opens it (like the PDF row).
  `PrintOptionsPanel` receives the deck source + render `options` as props — no cross-tab
  transport, so the whole `postMessage` handshake (`sharePrintDeck`, the module-scope
  responder) and the `/studio/print` route + `PrintPage.tsx` are **deleted**.
- The panel renders the deck itself: `buildDeckRender` → a live per-slide preview
  (`buildSrcdoc` fit into the paper sheet). `renderPdfBlob` (the #939 `sheet` mode) runs
  **only inside `buildPdf()`**, gated behind a Print/Download click, into a `builtPdf`
  state entry keyed by `(render, paper, orientation)`; `cachedForCurrent` drives the iOS
  build-vs-open button. **Print** = desktop `printHtmlDoc(buildSrcdoc printRules)` / iOS
  build-then-`window.open`; **Download** = `<a download>` on the built URL.
- Shared kernel unchanged (HARD RULE #1): `resolvePrintSheet` / `fitSlideOnSheet` /
  `buildSrcdoc` / `renderPdfBlob` `sheet` mode all still live in the playground engine.

**Shipped (2026-07-12) — cached-image re-place.** The `sheet`-mode PDF build is now a
rasterize → assemble split in the shared kernel (`drawing-board-export.js`): **(a)
`rasterizeDeckImages`** captures each slide to a self-contained image at its native box —
the expensive half (html-to-image), cacheable because its output depends only on the render,
never on paper; **(b) `assembleSheetPdf`** places those images on the chosen sheet (jsPDF
geometry, `fitSlideOnSheet` + `px_scaling` MediaBox) — the cheap, DOM-free half. The Print
drawer caches the images by `render` identity, so a paper/orientation flip re-runs only (b)
with **no re-rasterize**; a colour change makes a new render → the cache drops. This split is
the seam N-up and the notes handout build on (place N images / slide+notes per sheet). Perf
recorded via the bench's print re-place tier (`test/benchmark/engine-bench.mjs`,
`printDatasets` baseline; HARD RULE #19). Demo: `examples/print-fast-flip.md`.

**Shipped (2026-07-13) — the three remaining follow-ups.**
- **N-up (2/4 per sheet).** `nUpCells` (shared kernel) returns the per-cell fit+centered
  rects; `assembleSheetPdf` gains `opts.nup` (grid, ceil(images/nup) pages). A "Layout"
  control in the Print drawer (1-up / 2-up / 4-up) with a live grid preview; nup=1 is exactly
  `fitSlideOnSheet`. Rides the cached images (placement-only), so switching re-places with no
  re-rasterize.
- **Speaker-notes handout.** `handoutRegions` bands the slide (top) over its notes; the
  assembler's handout path draws the note text (jsPDF) from the shared `notesCore` boundary.
  Added as the "Notes" layout. Desktop routes N-up/handout through the PDF (the vector
  one-slide-per-page path can't grid or add a notes band).
- **CLI `--paper`.** `lattice --paper auto|letter|legal|a4` (+ `--orientation`) bakes a paper
  MediaBox into the Node PDF export, reusing `resolvePrintSheet`/`fitSlideOnSheet` from the
  kernel. Vector `@page`-zoom was rejected: Chromium drops the per-slide page break once a
  scaled slide no longer fills the sheet (portrait packs 2-up), so the CLI paper-fit rasterizes
  + places like the drawer — reliable at every sheet, at the cost of selectable text (opt-in).

To share the geometry with the Node CLI (HARD RULE #1), the print-sheet kernel moved to the
pure ESM `lib/core/print-sheet.mjs`; `deck-preview.js` re-exports it (browser importers
unchanged) and `lattice-emulator.js` `require`s it. Demo: `examples/print-handouts.md`.

**Deferred still:** nothing from this note — the swimlane is complete.

---

## Original note — the boardroom print band (shipped)

> **Build A + Build B shipped 2026-07-12.** The web-print path picks the
> least-wasteful standard sheet, pre-selects orientation, and scales each slide
> to fit (Build A). The B&W-safe print band + textures + triggers + contrast gate
> shipped as Build B (see *Shipped — Build B* below), including the first-class
> **`color-mode: print`** key (front-matter + lint vocab + the Studio "Print (B&W)"
> picker option) alongside `class: print` and the `--print` export flag. ONE piece
> is deliberately deferred to a follow-up: the **auto-paper-fit downloaded PDF** with
> a baked paper-size MediaBox for the CLI (Build A already gives the web path its
> paper fit). When this note and a shipped surface disagree, the shipped surface wins.
>
> **Build B — what shipped (2026-07-12):** a universal `--print-*` band
> (`base.tokens.css`, one default every theme inherits — no per-theme band needed,
> since print is brand-neutral ink-on-white); a `section.print` token remap
> (`base.modifiers.css`); categorical **texture** fills re-scoped from the a11y set
> to print (`base.print-textures.css` — pie/funnel/Mermaid/pie-slice + radar
> dash-arrays + status glyphs); a Mermaid `forcePrint` themeVars bake
> (`lattice-emulator.js`) for its offline-baked node text/lines; the journey
> component's `:root`-derived ramp re-resolved on `section.print.journey`; the
> `--print` engine flag; and a **contrast gate** asserting the band vs white
> (`test/unit/palette/contrast.test.js`). Demo: `examples/print-mode.md`.

## Superseded twice, same week — "Print deck" now builds a REAL PDF (2026-07-12)

The reported wound took THREE tries, each killed by real-device evidence:

1. **Hidden iframe** (shipped #932) → printed the *app* (Firefox ran `print()`
   on the top document). Fixed with a full-viewport overlay.
2. **Overlay** → still printed the *app* on **iOS** (IMG_2940): a mobile browser
   has no "print one element" — it hands the whole top document to the system
   print sheet. Fixed by opening the deck as its own top-level **new tab** (a
   vector HTML page, `buildSrcdoc` + `printRules`).
3. **Vector new tab** → prints the deck on iOS, but **clips + flows continuously,
   ignoring the paper size** (IMG_2945: US Letter portrait, 4 pages for 7 slides,
   slides sliced across page breaks). **iOS Safari ignores CSS `@page {size}`
   entirely** (it always uses the user's paper, defaulting Letter portrait) **and
   won't reliably page-break a scaled/zoomed layout** — so a vector print page,
   which works on desktop Chromium, is at the mercy of iOS's print engine.

**The fix that holds on every device: build a REAL PDF and open THAT.** A PDF
carries its page geometry in the **MediaBox**, which iOS honors exactly — reliable
one-slide-per-page at the chosen paper size on iPhone AND desktop. `sharePrintDeck`
(`docs/src/components/studio/share-export.ts`) now:

- renders the deck (B&W → `mergeClassTokens(source,'print')` for the `section.print`
  band), then calls **`renderPdfBlob`** (the existing per-slide PDF pipeline,
  `docs/src/playground/drawing-board-export.js`, HARD RULE #15/#1) with a `sheet` =
  the chosen paper baked into each page, the slide **fit + centered** with a 9mm
  safe margin (jsPDF `hotfixes:['px_scaling']` so the MediaBox is physically correct
  — Legal → **1008×612pt**, A4 → 842×595pt, not a giant custom size);
- opens the finished blob in a new tab; the browser's native PDF viewer's
  Print/Share does the actual print (on a phone: Share → Print).

The paper decision lives ONCE in **`resolvePrintSheet`** (`deck-preview.js`), shared
by the PDF path (px→MediaBox) and the Drawing Board's still-vector print CSS
(`buildPrintCss` `@page`), so the two surfaces can't disagree (HARD RULE #1).
`fitSlideOnSheet` places the slide on the sheet. `PrintOptionsPanel` (paper /
orientation / colour / fit) feeds `printOpts` straight into the PDF geometry.

**Render BEFORE opening the tab — a `window.open` foreground trap.** Opening a tab
marks the opener `document.hidden`, which **pauses `requestAnimationFrame` and
stalls the html-to-image rasterizer** — freezing the very render a reserved pop-up
would be waiting on (confirmed: opener `visibilityState` flips to `hidden` on
`window.open`, and `window.focus()` does not undo it). So the PDF is built while the
Studio tab is still foreground, THEN the blob is opened; a pop-up-blocked open (a
slow render can outlast the click's activation) falls back to a download. The shared
capture also gained a **timer fallback on its double-`rAF` settle wait** (`createCaptureFrame`)
so any backgrounded export can't hang there.

**Superseded correctness note (vector path, still true for the Drawing Board):** the
old vector "Print deck" had a latent `@page`-ordering bug — `buildSrcdoc` emitted the
print CSS *before* the engine `css`, whose own `@page{size:<slide-px>}` then won the
later-wins-per-descriptor merge, making the paper pick inert. `printCss` now emits
after `css`. This only affects the Drawing Board's remaining vector print now, but
it's pinned in `deck-preview.test.ts` and kept.

## Shipped — Build A + a worse-than-ugly bug (2026-07-12, overlay half superseded above)

The half of this note that "fixes the reported wound" landed, plus a bug the
original complaint understated.

**The bug: the Studio "Print deck" printed the *app*, not the deck.** The
complaint wasn't only "ugly" — `sharePrintDeck`
(`docs/src/components/studio/share-export.ts`) mounted the print render in a
**hidden** iframe (`opacity:0`, zero-sized, `overflow:hidden`) and called
`iframe.contentWindow.focus(); print()`. A hidden iframe is an *ambiguous print
target*: a browser that won't move focus into an invisible frame (Firefox) runs
`print()` against the **top document** instead — so the export came out as a
screenshot of the Studio chrome (Share sheet, toolbar, toast). The Drawing
Board never hit this because it prints its **visible** on-screen preview frame.
The first fix mounted the print frame as a real full-viewport, opaque, focused
overlay — the unambiguous target on desktop, but (see the superseding section
above) still the *app* on iOS. The holding fix is the **new-tab** redesign.

**Build A: correct paper defaults.** The shared print CSS
(`docs/src/playground/deck-preview.js` `buildPrintCss`, used by BOTH the Studio
"Print deck" and the Drawing Board print — HARD RULE #1) now:

- picks the least-wasteful standard sheet for the deck's aspect and pre-selects
  orientation — **16:9 → US Legal landscape** (~93% fill), 4:3 → Letter
  landscape, tall decks → Letter portrait;
- scales each fixed slide box to the printable area with `zoom` (not
  `transform`, so pagination sees the fitted size), **floored** with a 2px guard
  so an exact-fit slide never rounds into a spill onto a second sheet;
- holds a **9mm safe margin** (also dodges the printer's unprintable edge),
  centers each slide, and never crops.

Verified on the real Chromium print engine (`page.pdf`, `preferCSSPageSize`):
16:9/4:3/portrait each land on the right sheet at one slide per page; a real
themed deck fits and centers. **Firefox's print *dialog* was not reproducible in
the headless sandbox (HARD RULE #23)** — the target fix is argued from the
spec-level visible-vs-hidden-frame distinction and the Drawing Board's working
precedent, not a Firefox artifact.

**Still colour-only.** Build A prints the deck faithfully *as authored* — a dark
full-bleed cover still prints as a dark rectangle. Grayscale survivability is
**Build B** (below), unshipped.

> **Original design decision follows (Build B is the open part).**

## Symptom — "our print export is about as ugly as sin"

The complaint is real, but it points at **one** of two print surfaces, and
they are not equally bad.

**The engine PDF (CLI / puppeteer) is already decent.** `lib/engine/css.js:121`
emits `@page { size: <slide-w> <slide-h>; margin: 0 }` plus a `@media print`
block that forces one slide per page and `print-color-adjust: exact` (headless
Chromium otherwise re-quantizes background fills, washing the palette out).
Every theme `@size` (`themes/*.css` header) is landscape. So the CLI PDF is
landscape, full-bleed, exact-colour, one-slide-per-page — the boardroom
artifact. Keep it.

**The web "Print" button is the ugly one.** `docs/src/playground/drawing-board-export.js:352`
is literally `doc.title = …; win.print()`, leaning on a thin print stylesheet
(`docs/src/playground/deck-preview.js:188`) that sets `@page { size: <px> <px> }`,
forces `background:#fff`, and strips shadow/radius. Then it drops the user into
the **browser's native print dialog**, whose defaults are **portrait, A4/Letter
with margins, and a URL/date header-footer**. A 16:9 landscape slide gets
shrunk into a portrait sheet with whitespace and a `localhost — 6/14/26`
footer. That is the "ugly as sin."

**The deeper gap, true of *both* surfaces: nothing survives black-and-white.**
Every palette encodes meaning in **hue** — `--cat-1..12`, `--chart-*`,
`--diagram-band-1..12`, the tint/mark treatments. On a grayscale office printer
two tints that differ only in hue collapse to the *same gray*: comparison
tables, tinted cards, and chart series go mushy and unreadable. There is no
print/monochrome token band anywhere in the codebase. A deck that looks 10/10
on screen can reach the boardroom as a stack of indistinguishable grays.

## Decision frame (resolved 2026-06-14)

Three forks were put to the owner and answered:

1. **Print target → "Both, paper-first."** Treat *physical paper* (someone hits
   ⌘P on an office printer) as the demanding case; let a clean digital PDF fall
   out of it.
2. **B&W survivability → "Dedicated print theme mode."** A curated print/monochrome
   token band per theme where category distinction comes from **border, rule,
   weight, and pattern**, not hue — not an auto de-hue, not color-only.
3. **Scope this round → "Design doc first."** This note. No code yet.

Everything below follows from those three.

## The architecture already has the shape we need

Lattice's colour model is a **token band selected by a mode**:

- The screen model swaps a **light** and a **dark** band through CSS
  `color-scheme` + `light-dark(L, D)` (`themes/indaco.css:94`). Author flips
  whole-deck dark via `style: ":root{color-scheme:dark}"`.
- `section.dark` (in `lattice.css`) remaps the *main* tokens to a `--dark-*`
  band (`themes/indaco.css:170`) so the same layout structure reskins for a
  dark canvas — cover/divider/closing.

**A print band is the same move on a third axis.** Each theme declares a
`--print-*` band; a `print` mode remaps the main tokens to it, exactly as
`section.dark` remaps to `--dark-*`. Nothing about the layouts changes — they
are palette-blind by contract (`CLAUDE.md`), so they inherit the print band for
free. This is why "dedicated print theme mode" is cheap to express and
consistent with the engine.

### Why NOT plain `@media print`

The obvious-but-wrong move is `@media print { :root { --bg:#fff; … } }`.
It is too blunt: **our colour PDF export renders *through* the print path**
(puppeteer prints to PDF), so a `@media print` token remap would also strip the
colour out of the boardroom colour PDF we want to keep. The print band must be
an **explicit opt-in** (export option / front-matter `mode: print`), decoupled
from the raw `@media print` trigger, so the two deliverables stay distinct:

| Deliverable | Trigger | Tokens | Page |
|---|---|---|---|
| **Colour PDF** (screen/projector/email) | default export | full light/dark palette | slide-px landscape, full-bleed |
| **Print handout** (paper, B&W-safe) | explicit `mode: print` | the `--print-*` band | paper-size landscape, scale-to-fit + safe margin |

`@media print and (monochrome)` stays as an *enhancement* layer only — Chromium
reports `(monochrome)` unreliably at print time (often color even for a B&W
printer, often 0 in preview), so it can sharpen the band when detected but must
never be the sole trigger.

## The print band — what "B&W-safe" actually requires

De-hueing destroys hue-only distinction, so the print band must carry meaning
on channels that survive grayscale:

- **Ink:** near-pure black body/heading on white; no light-gray body text
  (cheap printers crush it).
- **Every fill gets a stroke.** Adjacent fills that merge in gray must be
  separated by a defined border — promote `--border` to a real ink rule in the
  print band, applied to cards, table cells, chart bars, diagram nodes.
- **Category ramps collapse to lightness + pattern, not hue.** `--cat-*` /
  `--chart-*` / `--diagram-band-*` must map onto a small set distinguishable by
  **stepped lightness and/or SVG pattern fills** (hatch/dot/cross), plus their
  text labels. This is the genuinely hard part — see Open Questions.
- **Signals keep their semantics by shape, not just colour.** `--pass/--warn/--fail`
  lose red/green/amber in gray; lean on the existing glyph/label, and give each
  a distinct lightness + border so a printed RAG status is still legible.
- **Backgrounds:** bookend slides (cover/divider/closing) that are dark
  full-bleed on screen become ink-on-white framed panels in print — a dark
  flood wastes toner and prints as a muddy rectangle.

**Contrast guarantee extends to the band.** `test/unit/contrast.test.js`
already asserts every text-bearing token clears WCAG AA against its surface
(`themes/indaco.css:39`). The print band gets the same assertion against
**white**, so "B&W-safe" is a *gated* claim, not a hope.

## Orientation — yes, we can "tell the printer," two honest mechanisms

**Q: "Can we actually tell the printer how to print — prefilled orientation?"**
Yes. Two levers, depending on surface:

1. **The downloaded PDF tells the printer by its geometry.** Orientation is
   intrinsic to the page MediaBox (landscape = width > height). A landscape PDF
   opens landscape and prints landscape by default — *no dialog roulette*. Add
   `/ViewerPreferences << /PrintScaling /None >>` so viewers don't "fit to
   page"-shrink it. This is the strong path and it's why **paper-first wants a
   real downloaded PDF**, not `window.print()`. The jsPDF export
   (`drawing-board-export.js`, the image-PDF path) already lets us set
   `orientation: 'landscape'` explicitly.

2. **`window.print()` can prefill the dialog.** Switch the paper-print
   stylesheet from `@page { size: <px> <px> }` (a weird custom paper that
   Chromium scales badly onto A4/Letter) to the **keyword form**
   `@page { size: A4 landscape }` (or `letter landscape`). That *pre-selects
   landscape* in Chromium's dialog, and `margin: 0` removes the default
   header/footer. We cannot delete the dialog or force the printer's own
   driver, but we can make every default correct on arrival.

### The paper-fit crux (the real cost of "paper-first")

Our canvas is 16:9 (1280×720, ratio ≈ 1.778). **A4 landscape ≈ 1.414, Letter
landscape ≈ 1.294 — both *narrower* than 16:9.** So a 16:9 slide on A4/Letter
landscape *must* either letterbox (white bands top & bottom, scaled to width)
or crop. The honest defaults:

- **Scale-to-fit-width, centered, with a small safe margin (~8–10mm)** and
  accept top/bottom whitespace. Predictable, never crops content.
- **Offer 4:3 handout authoring.** The existing `standard 960×720` size (4:3 ≈
  1.333) fits Letter landscape almost exactly — a deck authored or re-sized to
  4:3 prints edge-to-edge. Worth surfacing as the "designed for paper" size.

A safe margin also dodges the unprintable-edge clipping every physical printer
has (full-bleed `margin:0` loses ~3–5mm at the paper edge on real hardware).

## The two builds that follow

**Build A — fix the web Print path (small, ships the reported wound).**
In `deck-preview.js:188`, swap the px `@page` for `@page { size: <paper>
landscape; margin: <safe> }`, scale the slide to fit width centered, keep the
fidelity caveat at the export action. Turns "ugly as sin" into "correct
defaults." ~half a day, no engine change.

**Build B — the dedicated print band + paper-PDF export (the substantive
piece).**
1. Add a `--print-*` band to each theme (`themes/*.css`), mirroring the
   `--dark-*` band's structure.
2. Add a `print` mode that remaps main tokens to `--print-*` — a `section`-level
   rule in `lattice.css` (sibling to `section.dark`) gated by an explicit
   trigger (front-matter `mode: print` and/or an export option), **not**
   `@media print`.
3. Resolve the category-ramp → lightness+pattern mapping (SVG pattern fills for
   chart/diagram; stepped grays + borders for cards/tables).
4. Extend `test/unit/contrast.test.js` to assert the print band vs white.
5. A **"Print handout (B&W-safe, landscape)"** export that produces a downloaded
   PDF (paper-size landscape MediaBox + `/PrintScaling /None`) in the print
   band — the artifact that "survives the trip," no dialog.
6. Per-feature demo deck `examples/<slug>.md` + committed PDF, rendered in both
   the colour and the print band, for owner sign-off (the export-change STOP
   rule in `CLAUDE.md` applies — print output is exported content).

## Resolved decisions (2026-06-14)

The open questions were put to the owner and answered. The design is now
fixed on these points:

- **Category ramp in grayscale → borders + stepped grays + SVG pattern fills.**
  Stepped lightness alone tops out at ~4–5 reliably-distinct grays on cheap
  printers, so the print band gives every fill a distinct gray **and** a black
  border, **and** chart/diagram *series* get SVG pattern fills (hatch / dot /
  cross) so distinction survives past five categories. This is the costlier
  option — it touches the chart/diagram renderers, not only tokens — and is
  accepted deliberately as the quality bar for B&W. Cards/tables lean on grays +
  borders; series-bearing components add patterns.
- **Paper fit → scale-to-fit-the-printable-area and center, paper-blind.**
  The fit *mechanism* doesn't depend on paper: scale the slide to the printable
  area, center it, hold a small safe margin (~8–10mm, also dodging the
  unprintable-edge clip every physical printer has). White letterbox bands
  simply shrink as the sheet's ratio approaches the slide's. Never crops.
- **Downloaded-PDF paper size → auto-pick the closest-fit standard sheet.**
  The baked MediaBox is chosen to best fit the deck's aspect: **16:9 → US Legal**
  (1.65, the closest standard sheet to 1.78 — only ~7% letterbox vs 27% on
  Letter), **4:3 → Letter/A4** (by locale). No paper picker in v1 — the engine
  picks the sheet that wastes the least page; the `window.print()` path still
  honours whatever the user selects in the dialog (scale-to-fit makes any
  choice correct).
- **Slide-aspect → guidance only, 16:9 stays the default.** No forced re-size.
  Surface a hint at the print-export action ("handouts print fullest on Legal;
  author at 4:3 to fill Letter/A4") so authors can opt into a paper-friendly
  aspect without us reflowing their composition.
- **Mode trigger → export option *and* front-matter `mode: print`.** The
  export-time option is the must-have (printing is a render choice, not a deck
  property); front-matter `mode: print` is the optional convenience for authors
  who always print B&W.
- **CLI parity → engine `--print` flag, CLI *and* web.** The print band is an
  engine render option (a `--print` flag), reachable from both the `lattice` CLI
  and the Drawing Board, honouring the shared-kernel rule (`CLAUDE.md` HARD
  RULE #1) — the mode lives in the engine, not the UI.

### Paper-fit reference

Page-fill of a slide scaled to fit each landscape sheet (ratio = long ÷ short):

| Paper | Ratio | 16:9 fill | 4:3 fill |
|---|---|---|---|
| US Letter | 1.29 | 73% | **97%** |
| A4 | 1.41 | 80% | 94% |
| **US Legal** | **1.65** | **93%** | 80% |
| Tabloid/Ledger | 1.55 | 87% | 86% |
| *slide* | 1.78 (16:9) · 1.33 (4:3) | — | — |

### Still out of scope

- **Speaker-notes handout** (slide + notes per page) — the classic boardroom
  leave-behind and a natural sibling, but a separate feature; not folded in
  here.

## Recommendation

Ship **Build A now** (the literal reported wound, low-risk: swap the web Print
stylesheet to scale-to-fit-center + a landscape paper default, kill the dialog
header/footer). Then **Build B** as the real deliverable, sequenced:
print band + contrast gate (assert vs white) → auto-paper-fit PDF export
(closest-fit MediaBox + `/PrintScaling /None`) → category-ramp SVG pattern
work for chart/diagram → engine `--print` flag for CLI parity → demo deck
rendered in colour *and* the print band for owner sign-off (the export-change
STOP rule applies).
