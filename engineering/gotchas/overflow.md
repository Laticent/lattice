# Gotchas — Overflow detection and the Fit Spine

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## `overflow:check` reports decks as regressed that nobody touched — and the baseline says they were clean

- **Symptom:** `npm run overflow:check` fails with a list of decks that "clip MORE
  slides than the baseline (baseline: clean)", on a branch that changed none of
  them. Checking out an older commit and re-rendering reproduces the same clipping,
  so nothing regressed. Measured instance (2026-09-13): seven component galleries —
  six chart members and `team-profile` — all reported at once.
- **Cause:** the baseline lists only the decks that CLIP, so **a deck missing from
  the map is read as clean, and a deck nobody ever swept is missing from the map in
  exactly the same way.** Those seven were authored after the last FULL `--bless`,
  and the file had since been hand-edited to add one deck's entry rather than
  re-blessed (`fa181c9`). They therefore carried a floor of zero from the day they
  landed, and because `overflow:check` is on-demand rather than a CI gate, nothing
  ran to say so for a week. The check is not wrong; the baseline was never a
  statement about those decks at all.
- **How to tell which you have:** check the deck out at the commit the baseline was
  last blessed at and render it. If it clips there too, the baseline is incomplete
  and the honest fix is a full `--bless`. If it does not, you have a real regression
  and blessing would bury it.
- **The guard against a repeat:** the baseline now records `decksSwept`, the number
  of decks the blessing run covered, and `overflow:check` reports when today's corpus
  is larger — `ⓘ the baseline was recorded against N decks; this sweep covered M`.
  That is the one fact that distinguishes "clean" from "never looked at", and the
  file could not previously carry it.
- **What those seven actually clip, and why it was blessed rather than fixed:** the
  per-component gallery composes each variant's `<!-- _footer: -->` as
  `label · name variant — summary`, where `summary` is the variant's full
  documentation sentence from the manifest (`tools/build-component-docs.js`). The
  standard frame's footer is single-line chrome (`white-space: nowrap; overflow:
  hidden; text-overflow: ellipsis`), and 136 characters do not fit its 1187px. The
  ellipsis is the frame's designed answer for a long footer — `probeContentClipped`
  classifies it `chromeOnly` and `probeSectionOverflow` deliberately stopped counting
  it as geometric spill in `fa181c9` — and the summary ships in full in
  `dist/docs/components.md`, the manifest and the docs site. **Shortening it is a
  change to the GENERATOR**, which would regenerate 58 galleries and their committed
  light/dark PDFs, so it is its own pass (HARD RULE #18's off-path rule), not
  something to fold into a baseline bless.

## A slide loses its EYEBROW and HEADING off the top, and no ring / pill / console line fires

- **Symptom:** the top of a panel or card is simply gone in the render — the
  eyebrow, most of the `h2`, sometimes both — and every channel says the slide
  is fine. `over` is `false`, `npm run overflow:check` counts it clean, the
  export carries no "Content clipped" tag, and `lattice-emulator.js` prints
  nothing on stderr. Resizing does not change it; it reproduces in the PDF.
- **Cause:** a flex container that `center`s or end-aligns and then OVERFLOWS
  throws content off the **block-start** edge — and block-start overflow does
  NOT grow `scrollHeight`. `scrollHeight - clientHeight` reads 0, so every
  scroll-dims measure in the system reads zero too. A cut TAIL announces itself
  (it grows the scroll extent); a cut HEAD does not. Reproduced on
  `split-panel`, whose `.panel-left` is `justify-content: flex-end;
  overflow: hidden`: 24 text rects cut, the worst by 882px, at `over: false`
  (#1299). `wifi`'s `justify-content: center` card was the same defect in
  another component (#1278).
- **Fix, in the CSS:** `justify-content: safe center` / `safe flex-end`. `safe`
  falls back to `start` the instant content overflows and keeps the intended
  alignment while it fits — so a fitting slide is byte-identical and an
  overflowing one loses its LAST line instead of its first. **`safe` cannot be
  used with `space-between`/`space-around`/`space-evenly`**: those are
  `<content-distribution>` values and the grammar admits `safe` only before a
  `<content-position>`, so `safe space-evenly` is invalid CSS that drops the
  whole declaration. (`space-between` falls back to `start` by spec. `space-around`/`space-evenly`
  were ASSUMED to fall back to `center` and to shear; measured in Chromium 131 they
  resolve to `start` too, so they do not — the assumption was read off the grammar
  where a measurement was available.)
- **Fix, in the probe:** the box has to be PROBED at all. Both probes now
  discover clipping boxes instead of reading a hand-kept allowlist, and the
  geometry probe measures a discovered box by RECT SPILL (which sees a child
  sitting above the box's top) rather than by scroll dims. See
  `lib/core/overflow-probe.js` and
  `engineering/decisions/2026-07-30-overflow-marker-register.md`
  §"the signal did not reach every box that clips".
- **If you are adding a component:** any clipping box you center or end-align
  is this bug waiting to happen. `safe` costs nothing when the content fits.

## A fixed-size slide frame silently truncates content past 1280×720

- **Symptom:** Authors lose hours debugging clipped content because the
  render prints / exports cleanly but is visually missing the bottom of
  a slide. Nothing in the build output flags it.
- **Cause:** Each slide renders into a fixed-size viewport (the owned
  engine's `@page`/Puppeteer viewport; the SVG viewport in the VS Code
  Marp preview). Anything past the bottom of the viewport gets clipped
  at the rasterization step with no warning.
- **Mitigation:** [lattice.css](../dist/lattice.css) defines
  `section.overflow` as a 4px inset red ring (via `box-shadow`, no
  layout shift). [lattice-runtime.js](../dist/lattice-runtime.js)
  `startOverflowWatcher()` tags the class on every section whose
  scrollHeight/Width exceeds clientHeight/Width by more than 12px
  (the tolerance filters sub-pixel rounding noise from nested flex/
  grid). The lattice-emulator does the same check in the rendered
  HTML AND via `page.evaluate()` before `page.pdf()`, so the ring
  is burned into the printed deck.
- **Triggered by:** Any slide with content past the 720px height (or
  whatever your `@size` is set to).
- **Removable when:** A render path adds native overflow detection (the
  fixed-viewport clip has no built-in warning).
- **Commits:** `0da73e59`.

## The overflow ring lags an edit, or a slide scrolled past keeps a ring it should have lost

- **Symptom:** you fix an overflowing slide and the red ring stays for a beat
  before clearing; or you scroll a long filmstrip and a slide well off-screen is
  still carrying the mark it had before you edited it.
- **Cause: both are the sweep model working as designed** (2026-08-11, see
  `engineering/decisions/2026-08-11-overflow-sweep-generation.md`). The watcher no
  longer re-measures every slide on every animation frame. It measures once per
  SETTLED render — the same 150ms debounce the content transforms use — over the
  slides in the viewport band whose verdict is stale.
  - **The lag** is that settle window — **about 320ms**, measured, not the 150ms
    you might infer from one debounce. It is two stacked trailing edges: the
    content pass waits 150ms, then the sweep waits 150ms after that.
  - **The stale off-screen mark** is deliberate: a slide that was not measured
    keeps whatever it had, because the only honest thing to say about an
    unmeasured slide is nothing. Clearing it would make a scroll look like a fix.
    Scroll it back into the band and it is re-measured within one settle window.
- **What is NOT this:** a ring that never appears at all on a slide you can see,
  or one that never clears after the slide re-enters view. Those are real. Check
  `window.latticeSweep.sweep()` in the preview frame's console — it returns
  `{ measure, skipped: { offBand, current }, total }`, so it will tell you whether
  the slide was probed, judged already-current, or ruled out of band.
- **If you are adding a surface that shows slides:** if it can change a slide's
  BOX without a DOM mutation or a window resize (its own zoom control, a pane
  drag), call `window.latticeSweep.schedule()` — nothing else will know.

## A false "Overflows" ring appears on the exported `.html` sidecar for a slide that actually fits

- **Symptom:** a deck's exported `.pdf` renders fine and `lattice-emulator.js`'s
  own console warning names the right pages — but opening the alongside
  `.html` sidecar in a plain browser shows a red inset ring (and, for the
  live-preview runtime, an "OVERFLOWS" tab) on a slide that isn't actually in
  that warning list. It doesn't self-correct on its own; resizing the browser
  window does clear it.
- **Cause:** a font-loading race, not a measurement bug. Marp's template
  lazy-loads a `@font-face` only when the browser first tries to PAINT text
  using it — so `document.fonts.ready` can resolve "loaded" for the page
  overall before a specific slide's own text has actually triggered its
  font's fetch. The exported `.html`'s embedded overflow-watcher script used
  to measure on `DOMContentLoaded` with no font-forcing step at all, so a
  borderline slide (content within a few px of the frame) could get measured
  against a wider/taller FALLBACK-font layout and cross the 12px tolerance —
  a false positive that then never re-measures (the embedded script only
  re-checks on `window resize`). `measureOverflow()` (the pass that generates
  the actual PDF-export console warning) was never affected — it already
  force-loads every declared font before its first measurement, which is why
  the two disagreed. The live-preview runtime (`lib/runtime/index.js`) had
  the identical gap on its very first paint, though its continuous
  mutation-triggered re-checks usually self-correct within a keystroke.
- **Fix:** both watchers now force every declared font to `load()` and await
  `document.fonts.ready` (bounded by a timeout — a hung fetch must not
  suppress the ring forever either) before their first measurement, via a
  shared, unit-tested `lib/core/font-settle.js` helper. Watch the exact
  form: `document.fonts` is iterable (`.forEach`/`.size`) but NOT array-like
  (no `.length`) — `Array.prototype.map.call(document.fonts, fn)` silently
  loops ZERO times and never calls `fn`, no error, no warning. The first cut
  of this fix shipped exactly that bug (caught by a pre-merge adversarial
  review, not CI — nothing in the test suite exercised the real
  `FontFaceSet` shape). Use `fontSet.forEach(...)` or `[...fontSet].map(...)`
  (spread), never any bare `Array.prototype` method called on the set
  itself. See `engineering/decisions/2026-07-10-overflow-cause-highlighting.md`
  §14-15 and issue #894.
- **Verify the right way:** don't compare Puppeteer's numbers against a
  DIFFERENT automation library's numbers (Playwright vs. Puppeteer can
  render the SAME Chrome binary's fonts slightly differently depending on
  what each has settled by the time you measure) — that's a red herring.
  Compare the SAME tool's measurement before vs. after an explicit
  `document.fonts.load()` + `document.fonts.ready` wait on the SAME page.

## `guards: strict` trims the PDF but not the `.html` beside it — or, with `-o deck.html`, nothing at all

- **Symptom:** a `guards: strict` deck exports and the console says
  `✂ TRIMMED — guards: strict cut text on 1 slide(s): pages 2`. The PDF's page 2
  ends in an ellipsis and no longer rings. Open the `.html` written beside it and
  page 2 clips exactly as it would at `guards: loose`, red ring and all. Worse with
  `-o deck.html`: the same TRIMMED line is printed for a run whose ONLY file has no
  trim in it, and the `⚠ OVERFLOW` line — measured off the trimmed DOM — leaves that
  page off a list the written file belongs on.
- **Cause:** every other artifact comes from the LIVE DOM. The PDF and the PNGs are
  rasterized from it, the PPTX from those rasters, the `--player` from a capture of
  it. The plain `.html` is the exception: `lattice-emulator.js` writes it from
  `cleanDocHtml`, a Node-side string, BEFORE the page is ever loaded, and only the
  auto-split and rails passes rewrite it — both of which work on the string, not the
  DOM. TRIM works on the DOM, so it never reaches that file. The `.html` still gets
  its overflow RING because the sidecar carries an inline watcher that re-measures at
  open; there is no equivalent for the trim.
- **Fix:** `--fluid` or `--player`. The fluid viewer inlines the runtime, which
  re-measures and re-trims at the reader's own window size, so its `.html` carries the
  trim and agrees with the PDF (verified by opening both in real Chromium —
  `test/integration/parity/guards-trim-deliverables.test.js`). The player bakes from
  the live DOM, so it carries it too. Plain `-o deck.pdf` now SAYS its sidecar does
  not, instead of leaving the two deliverables to disagree in silence.
- **Why the `.html` deliverable is not trimmed at all rather than trimmed uselessly:**
  with `-o deck.html` the trim reached no file this run wrote, and it changed every
  channel that reports on one — rule 5 ("fit or change nothing") violated at the
  artifact level. The guard is now skipped there and says so, which makes the console
  describe the file on disk again.
- **Why the trim is not baked into the `.html` instead:** a `-webkit-line-clamp`
  computed at 1280×720 is a FIXED line count in a document the reader can open at any
  size, and re-computing it there is what open problem 6 of
  `engineering/decisions/2026-09-07-overflow-guards-trim.md` argues against for
  export-to-Marp — a trim running in the recipient's browser, at their window size,
  with no author present and no record of what was removed. `--fluid` is that opt-in,
  deliberately. Open problem 10 of the same note.

## One slide renders at ~2x type and overflows, but ONLY in a live preview — the PDF is perfect

- **Symptom:** a single layout looks right in the exported `.pdf` and right in
  CI, but in the Playground / Studio its type is roughly double size, one or
  two words wrap per line, and it carries an "OVERFLOWS" tab. Neighboring
  slides in the same deck are fine. Because the preview scales the whole
  filmstrip assuming every section is exactly `SH` tall, the *other* slides'
  scroll and clip geometry goes wrong too — so the deck can look broken well
  past the one bad slide.
- **Cause:** a component stylesheet set a box dimension on the SECTION element
  — e.g. `section.premise { height: 100% }` — making a component a second
  source of truth for a value the DECK owns. The geometry has one source (the
  `size:` directive → a named `@size`), but each render path pins it onto the
  section differently, and they do **not** agree on who wins. The EXPORT
  survives only because `lattice-emulator.js` emits `section[data-lattice-slide]
  { width/height: !important }` — *importance*, not specificity, keeps the
  component declaration out, so the PDF looks correct. In a live DOM preview the
  percentage resolves against `article.lattice`, whose inline height the preview's
  `fit()` routine sets to the height of the **whole filmstrip**. Measured on the
  real Playground at 390px: the section became 2517px — exactly `.lattice`'s
  2517px — against ~667px of actual content.
- **The percentage did NOT fall back to content height.** It resolved against a
  perfectly definite containing block that simply was not the slide. Do not
  reason about this class as "the parent was auto-height"; and note that
  "it renders right in the export" proves nothing here.
  `stampOrientation()` (`lib/runtime/index.js`) then
  measures that box, reads the aspect as portrait, and stamps
  `data-orientation="portrait"`, which swaps in the portrait type scale
  (`--fs-h1` 9.05x vs landscape 5x) on a landscape slide — which grows the box
  again. The loop latches.
- **Why no gate caught it:** `golden-diff` compares PDFs, and the PDF is
  correct. Unit tests and `build:check` never lay the deck out in a browser.
  This class is invisible to CI by construction.
- **Fix:** never set a box dimension on the section itself — the deck owns the
  slide box. That includes the logical synonyms (`block-size`, `inline-size`
  and their min/max) and `aspect-ratio`, which re-derives one axis from the
  other. Place content with `align-items` / `justify-content` / `padding`, or
  scope the size to a descendant (`section.foo .card { height: 100% }` is
  fine). `checkSectionBoxOwnership` in `tools/check-ownership.js` (via
  `build:check`) now fails this at commit time, with
  `SANCTIONED_SECTION_BOXES` for the one legitimate case (the fluid **view
  mode**, which deliberately unpins the box and is gated on an attribute no
  export ever sets). Shipped as #1207, found in production; see `CHANGELOG.md`.

## A slide clips 30-70px in the Playground that the exported PDF renders whole

> **RESOLVED 2026-07-30** — the export now stamps the slide geometry too, so it renders at
> design size and the two paths agree. The ruling below ("the preview is honest, the export
> is the flattering one") is what the fix implemented; the 11% figure is exactly the
> 1280-vs-1152 basis. Kept because the symptom is the clearest description of the defect, and
> because any deck authored against the OLD export may now be over-full — that is real
> over-subscription surfacing, not a regression. See
> `engineering/decisions/2026-07-30-slide-geometry-emitted-not-measured.md`.


- **Symptom:** the live preview shows an "OVERFLOWS" tab and visibly cuts a
  line of the lede or a caption, but the same slide in the exported `.pdf` is
  complete. Distinct from the font-race false positive above: fonts are fully
  loaded (`document.fonts.status === 'loaded'`, same family, same measure) and
  the clipping is stable, not transient.
- **Cause: only one path stamps `--_sec-1cqi`.** The slide is **1280px wide in
  both** paths — an earlier version of this note claimed 1152 vs 1280 and that
  `--sp-*` was pinned to a fixed baseline; both were wrong. `--sp-*` is
  `cqi`-based like `--fs-*`, and *both* read the same token:

  ```css
  --fs-body: calc(1.67  * var(--_sec-1cqi, 1cqi) * var(--fs-scale));
  --sp-md:   calc(1.875 * var(--_sec-1cqi, 1cqi) * var(--canvas-scale, 1));
  ```

  The live preview **stamps** `--_sec-1cqi: 12.800px` (slide width / 100) on the
  section. The export leaves it **unset**, so the `1cqi` fallback resolves against
  the nearest query container — which for stage content is the stage box inside
  the section's `5cqi` side padding: 1280 − 2x64 = **1152px**. Measured: the same
  lede computes 21.376px in preview and 19.2384px in export, a ratio of exactly
  1280/1152 = **1.1111**.
- **Which path is right: the PREVIEW.** `--_sec-1cqi` exists precisely to anchor
  sizing to the SLIDE rather than to whatever nested container an element sits in
  (`lib/adaptive/families.js`: "anchored to the slide via `--_sec-1cqi`"). So the
  export is rendering stage content ~11% smaller than designed, and a slide that
  "fits in the PDF but clips in the Playground" is genuinely over-subscribed at
  design size. **Do not trim to the preview and assume the export is the truth —
  it is the flattering one.**
- **Scope:** systemic and long-standing, not specific to any one component.
  Measured in unscaled slide px on the same surface: `list-tabular` 72px,
  `roadmap` 45px, `matrix-grid` 59px, `compare-prose axis` 39px, `cards-stack`
  14px.
- **Status: the token mismatch is OPEN** (tracked separately — whether the export
  should stamp `--_sec-1cqi` or the preview should stop is an engine-wide call).
  Individual components can and should be fixed in the meantime by making the
  slide fit at DESIGN size — measure with `--_sec-1cqi` stamped, not in the
  export. `matrix-grid` and `compare-prose axis` were fixed that way; the others
  above remain.

## The Playground and the Studio disagree about which slides overflow (and a slide's own padding changes when the preview pane is resized)

- **Symptom:** the same deck, the same palette, the same slide — the Studio's
  preview shows one slide ringed "OVERFLOWS", the Playground shows two. Resizing
  the browser window (or opening the Playground on a phone) changes which slides
  are flagged. Distinct from the two entries above: fonts are loaded and identical, and
  the disagreement is between the two BROWSER surfaces. (The fix does move the preview's
  chrome berths relative to the export by 3px — disclosed below; the PDF does not move.)
- **Cause: two independent bugs that both key off the host, not the slide.**
  - **The section's own `cq*` units resolved against the ICB.** A
    `container-type: size` element cannot query itself, so a bare `cqi`/`cqh` in a
    declaration applied to the `<section>` falls back to the initial containing block
    — the HOST VIEWPORT in a browser. `docs/src/playground/deck-preview.js` (the
    filmstrip: Playground, Studio) gives its iframe the PANE's width and scales
    each `<section>` inside it, while `docs/src/lib/single-slide-render.ts` (the
    Studio, the landing hero, component specimens) pins its iframe to the slide box and
    scales the IFRAME ELEMENT. So `--frame-inset-y` — and `--footer-reserve`, which is
    the section's `padding-bottom` — computed 24px in one surface and 14.4px in the
    other. Measured on the filmstrip: the content stage grew from 405.9px to 423.2px as
    the pane narrowed from 900px to 355px, and **2 of the 117 gallery slides changed
    their overflow verdict on pane width alone**. Descendants and pseudo-elements were
    never affected — their `cq*` resolves against the section — so the same token was
    simultaneously right on the footer berth and wrong on the reserve meant to hold it.
  - **The overflow probe mixed visual and layout pixels.** `getBoundingClientRect()`
    is transform-scaled; `scrollHeight`/`clientHeight` are not; `lib/core/overflow-probe.js`
    adds them together. On the filmstrip's scaled sections the same over-stuffed
    matrix-grid measured 30px over at scale 1 and 17px at scale 0.543 — across the 12px
    tolerance. The figure-legibility probe had the same mix, and reported glyphs at the
    pane's scale against a floor derived from the unscaled slide height.
- **Fix:** anchor every section-own `cq*` to the slide —
  `calc(N * var(--_sec-1cqi, 1cqi))`, or `--_sec-1cqh` on the height axis (both stamped
  per-section by `lib/runtime/index.js` `patchSectionGeometry`; the bare fallback keeps
  the export byte-identical, since there the ICB IS the slide box). The probe now
  normalizes every rect-derived measure to layout px via the section's own
  rect ÷ offsetHeight. **Gated:** `checkSectionCqAnchoring` in `tools/check-ownership.js`
  (via `build:check`), budget 0 with an empty allowlist.
- **Two ways to write the fix and get nothing** (both were written first; see
  `engineering/decisions/2026-07-29-section-cq-icb-leak.md` §5a):
  - **`:root` alone cannot be anchored.** `var()` is substituted on the element the
    declaration APPLIES to — for `:root` that is `html`, where the stamp doesn't exist,
    so the fallback is baked in and the token still resolves against the ICB. Declare on
    **`:root, section`** (the `--sp-*` idiom). It can LOOK fixed on the docs site anyway:
    the engine packs `:root` rules onto `article.lattice > :where(section)`, so the packed
    copy picks up the stamp while an unpacked document gets nothing. The gate's second arm
    fails this.
  - **A DESCENDANT's bare `cq*` must be left bare.** It already resolves against the
    section — but `1cqi` there is 1% of the section's CONTENT box (1152 at HD) while the
    stamp is `offsetWidth/100`, the BORDER box (1280). Anchoring one moves it 11%: doing
    that to `.chart-body` took it 3072 → 3456px against a 3110.4px export and made a
    `roadmap` slide's overflow ring vanish.
- **Still open, one tier down:** `.chart-body`, `.piechart-figure` and
  `section.list-criteria`'s cell are themselves `container-type: size`, so a `cq*` in
  THEIR own declarations has the identical self-reference problem, and there is no
  stamped anchor for a non-section container. 50 computed values on the gallery still
  move with the host viewport (down from 631); none of them changes an overflow verdict.
  Fixing that tier needs a per-container stamp, not another token rewrite.
- **Disclosed, not a bug: the chrome berths moved 3px in PREVIEW.** `--frame-inset-*` is
  read from both sides of the section boundary, so anchoring it also changes what the
  DESCENDANT side means wherever the stamp exists: the footer band's inset measures
  30px / 24px in preview against 27px / 21.6px in the export (2.34375% of the 1280
  border box vs of the 1152 content box). **The PDF does not move.** This puts the frame
  insets into the same stamp-anchored family as `--sp-*`/`--fs-*`, which have carried
  exactly this offset for as long as they have been anchored — the same OPEN question as
  the entry above, now with three more tokens in it.
- **The browser↔export verdict gap is untouched.** "0 flips" is a WITHIN-browser number.
  Across the boundary, same 117-slide gallery: the preview flags 7 slides the export
  flags 0 (pages 15, 21, 48, 66, 106, 109, 115; largest spill delta 381px), identical
  before and after this fix. Don't read it as closing that class.
- **CLOSED (2026-07-30) — both of the above.** The engine now EMITS `--_sec-1cqi` /
  `--_sec-1cqh` from the resolved `@size` on every render path
  (`lib/engine/css.js geometryVarsCss`), so the export resolves tokens at design size like
  the preview: the sidecar no longer tracks its window, and the export/preview verdict gap
  is gone. The remaining nested-container leak turned out not to be CSS at all — state-chart
  derived its scale from a transform-scaled rect. See
  `engineering/decisions/2026-07-30-slide-geometry-emitted-not-measured.md`, and
  `tools/check-geometry-parity.js` for the regression test. The entries below are kept as
  the record of what the symptom looked like.
- **Was open — the exported HTML sidecar at a non-slide window size.** Nothing
  stamps `--_sec-1cqi` in a standalone export, so every anchored token (the frame insets,
  and equally `--sp-*`/`--fs-*`, which have always been written this way) falls back and
  resolves against the WINDOW: the bloom sidecar's section padding reads 104px at a 1280px
  window and 31.7px at 390px. The PDF is unaffected (the emulator sets the viewport to the
  slide box) and the `--fluid` viewer re-derives on purpose. Pre-existing; it is the other
  face of the open `--_sec-1cqi` export/preview question above.
- **Triggered by:** writing a `cq` length directly on a `section…` rule — it reads as
  slide-relative and is not. Check with the gate, or by rendering the same deck in two
  differently-sized iframes and diffing computed styles.

## Exported fluid viewer: an overflowing slide shows NO marker tab, or the red author ring leaks to a reader

- **Symptom:** in the opt-in `--fluid` viewer, either (a) a genuinely over-dense
  slide shows the ring but **no** "More below" reader cue / tab, or (b) the
  **author's loud red** overflow ring + "OVERFLOWS" banner appears to a *reader* —
  specifically in the viewer's FIXED state (an ultrawide default, or after
  toggling Fluid: off) — instead of the calm reader cue.
- **Cause:** two separate traps, both specific to the exported viewer (neither
  reproduces in the live author preview).
  - **(a)** the export STAMPS `.overflow` at build time (the emulator's measured
    pass), so on a pre-stamped slide the runtime watcher's class never **flips** —
    and the tab-add used to live inside the `classList.contains('overflow') !== over`
    flip guard, so it never fired. A build-baked slide got a ring but no tab.
  - **(b)** the reader restyle (drop the red ring → calm cue) was gated on
    `:root[data-lattice-view="fluid"]`, which is only set while FILLING. The
    watcher runs for the whole capable export, so in the fixed state the reader
    gate was inert and the **ungated** author red ring (`base.modifiers.css`) won.
- **Fix:** (a) track the tab on the measured `over` state **independent of the
  class flip** — add when `over && !tab`, remove when `!over && tab` (presence-
  guarded, so the mutation loop still settles). (b) Gate the reader styling on the
  RESOLVED MARKER LEVEL, not on a viewer flag. Both caught by maker-checker, not CI
  (no committed test exercises the fluid viewer yet — #1138).
- **Current shape (2026-07-30):** who the marker talks to is the `overflow-marker`
  EXPORT SETTING (`lib/core/resolve-overflow-marker.js` — `author` / `reader` / `off`;
  chosen by `--overflow-marker`, `LATTICE_OVERFLOW_MARKER`, or the Studio's Share →
  Marp bundle step, and carried in the bundle's own generated block —
  `lib/core/export-settings.js`. It is NOT a deck key; `lint:deck` says so if you write one),
  the watcher stamps the resolved level on every slide section, and both treatments
  live in `base.modifiers.css` keyed on
  `section.overflow[data-lattice-overflow-marker="reader"]`. The rules moved out of
  `base.fluid-view.css` and out of the `:root[data-lattice-fluid-capable]` gate,
  because the fluid viewer is no longer the only reader surface — an Export-to-Marp
  bundle renders through the same runtime. The fluid viewer resolves to `reader` in
  both its states, so its behavior is unchanged. See `lib/runtime/index.js`
  `startOverflowWatcher`, `engineering/decisions/2026-07-20-adaptive-viewport-fill.md`,
  `engineering/decisions/2026-07-30-overflow-marker-register.md`.

## A dense slide loses its card borders and corners, but not one word of text

- **Symptom:** cards on a full slide come out with the bottom border, the bottom
  radii and the shadow sliced off — sometimes on EVERY card, including ones that are
  half empty — while every word is still readable. The export then tags the slide
  "Content clipped", which is true of the box and false of the text.
- **Cause:** `.cell-stage` is a bounded clipping cell (`flex: 1 1 auto; min-height: 0;
  overflow: clip`, `lib/forms/cell/stage/stage.css`), so every direct child of it is a
  flex ITEM — and a flex item's default `min-height: auto` is a CONTENT-height floor.
  A component body that does not set `min-height: 0` refuses to shrink into the cell
  that clips it, so the box grows past the stage and the clip takes whatever sits
  between the last line of text and the box's own bottom edge. `align-items: stretch`
  (or `flex:1` cells in a row) is why HALF-EMPTY cards lose their edge too: every card
  is as tall as the tallest, so one dense card takes the whole row's bottom edge with
  it. It is aspect ratio, not resolution — 16:9 is the shortest landscape stage, so
  `hd` and `4k` shear the same proportion and `standard` (4:3) often does not
  reproduce at all.
- **Mitigation:** `min-height: 0` on that body — but **only after measuring**, because
  it is the wrong answer more often than the right one. It is inoperative on a
  `<table>` (row boxes drive the used height), inert on a WRAPPING row whose
  `align-content` gives each line its own height (`cards-grid`, `verdict-grid`,
  `pricing`), and actively harmful where the clamped box then centers its own content —
  it moves the overflow INSIDE the frame, where the stage clip can no longer catch it
  and no gate can see it. `lib/components/evidence/kpi/kpi.styles.css` carries that
  regression in full (#1277). Pair it with a `safe` alignment wherever the box centers.
  The measurement that decides it is the deepest INK versus the box: ink inside means
  chrome-only damage and the clamp is right; ink outside means the content genuinely
  does not fit and clamping only relocates the loss.
- **Where:** `engineering/decisions/2026-09-02-stage-clip-shear-sweep.md` (the class,
  the nine fixes, and the components where the fix does NOT apply);
  `test/integration/parity/stage-clip-chrome-shear.test.js` and
  `test/integration/parity/list-steps-card-chrome-clip.test.js` pin it.

## A slide silently loses its FIRST line, and every gate reads clean

- **Symptom:** the top of a slide is missing — a card's title sliced in half, the first
  item gone — and nothing reports it. The overflow probe, the export tag and the
  committed page count all read normal.
- **Cause:** a container that centers or end-aligns and then OVERFLOWS throws content
  off the BLOCK-START edge, and block-start overflow does not grow `scrollHeight`. A
  cut tail announces itself to every scroll-dims measure in the system; a cut head
  announces itself to none of them. `stage.css` has required `safe` on the stage's own
  alignment modifiers since #1299, but a component that sets its own
  `justify-content: center` / `align-items: center` / `align-self: center` on a box
  that can overflow re-opens the same hole. Measured instances: `cycle` lost 16.75px of
  real text off the top of a slide that looked fine, `citation-card.split` 21.02px.
- **Mitigation:** `safe center` (or `safe flex-end`). It falls back to `start` the
  instant the content overflows and keeps the intended alignment while it fits, so a
  fitting slide is byte-identical. Note `safe` is INVALID on the distributed values —
  `space-between` / `space-around` / `space-evenly` take no keyword and were measured
  falling back to start on overflow in Chromium 131 anyway; writing `safe space-evenly`
  drops the whole declaration.
- **Where:** `lib/forms/cell/stage/stage.css` § safe alignment,
  `engineering/decisions/2026-09-02-stage-clip-shear-sweep.md` § The head-loss half.

## The Studio's PDF export measures at 0.94, not 1 — and the raster is taken at 1

- **Symptom:** geometry code that is correct in the CLI export ships a wrong answer in the
  Studio's Share → PDF. A `guards: strict` deck exported from the Studio came back one line
  of copy short, with a whole empty line of room under the cut; the same deck through the
  CLI was right. Nothing reports it: the slide fits, so the overflow probe, the trim's own
  verdict and the corpus ratchet all read clean.
- **Cause:** the two exports run at different scales. The CLI sets
  `page.setViewport({ width: slideW, height: slideH })`, so its capture is at **scale 1**.
  `docs/src/components/studio/export/deck-export.js` sizes its capture iframe to the geom
  box (1280) while `buildSrcdoc` puts `padding: 18px` on **both** `html` and `body`, so
  `.lattice` measures 1208 and the FIT agent scales every section by 1208/1280 =
  **0.94375** — about 0.932 with classic scrollbars, which is the desktop default. The
  runtime therefore measures and decides at that scale, and `rasterizeSection` then undoes
  it (`transform: none`) per slide, so whatever line count was decided at 0.94 is baked at
  1. Any measurement that reads `getBoundingClientRect()` against a `clientHeight`
  threshold is off by that factor, in the direction that removes the author's text.
- **Fix:** normalize to **layout px** the way `lib/core/overflow-probe.js` does —
  `rect.height / offsetHeight` per box, divided out of every rect-derived quantity. Do not
  take the scale from `DOMMatrix`: it misses the `scale:` property and `zoom:`, and returns
  cos θ under rotation.
- **Don't test it by diffing `strict` against `loose`.** At this frame's scale a correct
  trim lands on the same line the clip already cuts, so the two agree word-for-word and the
  comparison says nothing. Diff **fix against bug on the one path** — build the site twice
  and export the same deck through the real Share flow. Since #2199 the exported PDF carries
  a real text layer, so `pdftotext` is the oracle.
- **Where:** `engineering/decisions/2026-09-07-overflow-guards-trim.md` §11 (the frame) and
  §13 (the two exports, measured).
