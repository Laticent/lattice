---
status: shipped
summary: >
  Choosing a different spectrum-bar placement used to move the slide. The bar is a `border` (an overlay strip on full-bleed frames) on the
  `section`, so the content box and every element that measures from the padding box (header, footer,
  page number, stamps, `mark-*` decorations, the overflow marker) landed 2 to 5 px differently under
  `top`, `left`, `right`, `bottom` and `off`. Baseline: 4,039 of 4,209 elements moved, 162 of 164 slides.
  The fix leaves every border rule alone and makes the section's padding give up exactly the border each
  side carries (`--_bar-*`), so the total inset per side is constant; chrome insets, stamps and marks do
  the same. After it, 0 elements move across the components, their manifest variants, five layout
  modifiers, all 493 reserved classes, four canvas shapes and three themes. At the default placement a
  deck is unchanged except `premise` (2 px). The same rule means adding or removing the bar with
  `accent`, `tone-edge` or the `spectrum:` register no longer moves content, which changes decks that use
  them by 2 to 4 px. Full-bleed layouts draw the bar as an overlay strip instead of a border. `npm run check:edge-shift`
  is the gate. An independent checker found the first version incomplete (modifiers, variants, registers
  were unswept); this note records both rounds.
---

# Spectrum placement moves the slide

**Date:** 2026-10-26 · **Status:** shipped on `claude/spectrum-shift-content-fik8bk`

## The ask

> "a standard spectrum and a left spectrum shift the content down or to the right. This shift
> is noticeable and impacts boardroom aesthetic and seems like jank. … the frame should have
> sufficient padding around it to ensure spectrums have sufficient space and prevent content
> from ever shifting."

The padding and gaps today look right. The only defect is the shift.

## Mechanism

The bar is a `border-top` / `border-left` / `border-right` / `border-bottom` on `section`
(`lib/base/base.elements.css`, `lib/base/base.variants.css`), painted with `border-image`.
`section` is `box-sizing: border-box` with its own padding, so a border subtracts from the content
box on the side it sits. Two more effects follow:

- Absolutely positioned chrome measures from the padding box, which is inside the border. The
  header, footer, page number and the `::before` state stamp therefore move with the bar.
- A `dark` slide paints its bar as a background line and takes no border room, so in one default
  deck its content sits 4 px higher than a light slide's.

## Measured baseline (`npm run check:edge-shift`, indaco, 16:9, header/footer/paginate on)

| Placement vs `top` | Content box | Header | Footer | Page number | Stamp |
|---|---|---|---|---|---|
| `left` | 4 px right, 4 px narrower, 4 px higher | 4 px left/top | 4 px left | 2 px top | 4 px top |
| `right` | 4 px narrower, 4 px higher | 4 px top | 4 px right | 4 px right | 4 px |
| `bottom` | 4 px higher, 4 px shorter | 4 px top | 4 px bottom | 4 px bottom | 4 px |
| `off` | 4 px higher | 4 px top | none | 2 px top | 4 px top |

Per kind, the largest spread one element shows across all five placements: content 5.2 px
(the `collage` tiles, which round differently), stamp 4.1, heading 4.0, header 4.0, footer 4.0,
page number 4.0. 4,039 of 4,209 compared elements moved, most of them descendants carried along
by a parent. `divider` is the only frame that does not move, because it owns its signature rail.

## What the fix has to satisfy

1. The content box is the same rectangle under every placement, light and dark.
2. Header, footer, page number and stamps do not move (they measure from the padding box, so
   their insets must account for a reserved edge).
3. Full-bleed children (`image`, `scene`, `split-panel` halves, finish backdrops) must still
   reach the slide edge. A border on all four sides stops an `inset: 0` child 4 px short.
4. Existing decks keep their look: the margins stay what they are today.

`check:edge-shift` exits 0 only when requirement 1 and 2 hold for every slide it renders, and it
refuses to run (exit 2) when a placement did not take effect, so a green run cannot mean it
compared a deck with itself.

## Options considered

- **`outline` or `box-shadow` for the bar.** Rejected: both paint solid colors only, so the
  rainbow, duo and mono spectrums are impossible, and neither can be limited to one side.
- **Bar as a background layer** (what a dark slide does). Takes no room, but a full-bleed child
  paints over it, and the `background:` shorthand already cost a canvas bug (#1528, #2291).
- **Reserve a bar-sized strip on all four edges** (carved from the existing margin, or added to
  it), paint the bar in one strip with `border-image-width`. Keeps the bar above every child.
  Cost: chrome insets and full-bleed children need compensating, which is the list above.

The harness decided it, and the built fix is neither of the two: it keeps the border (so the bar stays
above every child) and makes the **padding** do the reserving.

## What shipped

**The rule: total inset per side is constant.** Each border rule is untouched. They already declare how
much border they carry in the same rule (`--_bar-t/r/b/l`). The section's padding now reads those flags:

    padding-top    = base + --_bar-room-t − --_bar-t
    padding-right  = base − --_bar-r        (likewise bottom, left)

so `padding + border` is the same under every placement. The bar is carved out of the margin that was
already there, not added to it, and no `margin` is involved (HARD RULE #20).

- `--_bar-w` is the bar's width **rounded down to a whole CSS pixel**, used for the border and for every
  flag. A browser floors a border width to whole device pixels: at 1080 px wide the exact 3.375 px bar
  drew as 3 px while the padding gave up 3.375 px, and one centered layout amplified the 0.375 px gap to
  3.6 px. At 1280, 1920 and 2560 px nothing changes.
- `--_bar-room-t` is the top room the default bar always took. It holds a slide whose bar is elsewhere at
  the same 4 px, so a default deck does not move. A frame whose default has no top bar (dark, print,
  `title`, `closing`, `divider`, `topic`, every chart frame, the full-bleed frames, `claim-bleed`) sets
  it to 0 and stays where it was.
- Every place that overrides the section's padding gives up the bar the same way: `section.form`
  (stage.css), `footer-inset`, `fill-optical`, `safe`, `topic` (including its `fact` and trackless forms),
  `premise`, `collage bleed`. `premise` sets `--_inline-inset` instead of restating the side padding.
- Chrome that measures from the padding box (header, footer, page number, progress rail, logo, the
  safe-area lift, the overflow marker) reads per-side tokens `--frame-inset-t/b/l/r`. Stamps and `mark-*`
  decorations add `--_hold-*`; percentages of the padding box add back the share a bar removes
  (`--_hold-w`, `--_hold-h`).
- A `lat-pane` is a slide inside the slide with its own containing block. It clears the bar flags and
  re-derives the insets, or its rail would subtract a bar the pane does not carry.

**Decisions that change what an author sees:**

1. **Full-bleed frames draw the bar as an overlay.** `image`, `scene`, `split-panel`, `split-compare`,
   `claim-bleed` media (chart, diagram, video, big-number) and `collage bleed` have no inset to give a bar
   border, so a border could only shrink the photo or panel. Round 1 and 2 dropped their side and bottom
   bars. That broke "every component supports spectrum", so round 3 replaced it: the engine, the splitter
   and the runtime append `<i class="slide-bar">` (lib/core/slide-bar.js, the pattern of the finish
   `.backdrop`), an absolutely positioned strip on the chrome plane. It takes no room and paints above the
   art. They still show no top bar by default; a placement, `spectrum: solid|duo|mono`, `accent` or
   `tone-edge` asks for one, and the split frames keep their own ribbon. Two lists name the frames, the JS
   one (`lib/core/bleed-frames.js`) and the CSS `:not(...)` on the placement rules; a unit test pins them.
2. **`premise` reserves one bar width top and bottom.** A default light `premise` slide's content sits
   2 px higher (centered, 4 px less room).
3. **Adding or removing the bar no longer moves content.** Before, `accent`, `tone-edge`, a deck-wide
   `spectrum: solid|duo|mono` and `spectrum: off` each shifted a slide by the bar's width relative to the
   same slide without them, which is the jank this note is about. Now they leave it where the unmarked
   slide sits. For existing decks that is a one-time move, measured old CSS against new at the default
   placement:

   | Setting | What moves |
   |---|---|
   | `accent`, `tone-edge` | chart-family and `topic` slides 4 px up; `title`, `closing`, `divider` 2 px up |
   | `spectrum: solid`, `duo`, `mono` (deck-wide) | every dark, chart-family and `topic` slide 4 px up; `title`, `closing` 2 px up; `image`, `scene` 2 px up |
   | `spectrum: off` | ordinary slides 4 px down (they now keep the 4 px a default slide has) |

   Light content slides under `solid`, `duo` and `mono` do not move. Each is one rule to reverse.

   Decks that already set `spectrum-edge: left|right|bottom|off` move once too (4 px): content and chrome now
   sit where the default placement puts them. On `image`, `scene` and `collage bleed`, `accent`, `tone-edge`
   and a deck-wide `spectrum:` draw their top bar as the overlay, so they no longer push the content down.
4. **`safe` no longer displaces `progress` chart rows.** Its selector `[class*='progress']` matched the
   chart's `.progress-track` and `.progress-row`; it now matches the section-dot rail. The old behavior
   moved the tracks about 290 px on a portrait canvas.

**Left alone, on purpose:**

- A dark or print slide still sits 4 px higher than a light one in the same deck. That predates this
  change and is not a placement effect. Making dark match light is one line (drop `--_bar-room-t: 0px`
  from the dark rule) and moves every dark slide 4 px, so it is the owner's call.
- The `finish:` backdrop ends where the bar begins. A backdrop reaching under the bar would paint over it
  (negative z-planes paint above the section's own border), so its edge differs by the bar's strip. The
  harness does not measure it.

## Round 2: the second independent check

A second checker (Opus, fresh context) ran against the fix and found three regressions of mine, one false
sentence and one harness blind spot, all confirmed and fixed:

- **`collage bleed`** left a blank 4 px strip above its photos in every placement but `top`, and showed no
  bar. The harness read 0 because the photos were equally inset everywhere: the inset itself was the
  defect. It now draws no bar and the photos reach the top edge in every placement.
- **Centered logos** (`top-center`, `bottom-center`) sat at `left: 50%` of the padding box and moved 2 px
  with a side bar. They now centre on the slide.
- **`claim-bleed` media and `collage bleed`** dropped their side bars but left the host keyline handed to a
  bar that was no longer there, so a Studio or player slide had no edge on that side. They hand it back.
- **The claim that `accent`, `tone-edge` and `spectrum:` never move content was false** for `image`, `scene`
  and `divider numbered`. `section.accent` out-ranks `section.image { border: none; padding: 0 }`. The
  three are now handled, and the harness runs `--variants --classes accent` clean.
- **The harness never measured the section's background.** An `![bg]` photo measured from the padding box
  and moved with the bar. The harness now records the background's area, and a section's background
  measures from the border box.

Two limits it found stay, and are stated in the docs: CSS `zoom` (the print sheet) can floor a border by up
to half a pixel on a canvas whose bar is not a whole number of pixels, and a canvas under about 320 px wide
now keeps a 1 px bar instead of rounding it to nothing.

## Round 3: the overlay for the full-bleed frames

Decided with the owner after round 2: one mechanism per kind of frame, the border where there is a margin
to give and an overlay where the frame claims the canvas. A single overlay for every frame is the likelier
end state and is left for later analysis; it would delete the padding math and the `finish:` exception, and
it changes every slide in every export.

- **The layer is the strip, not a slide-sized box.** A first version was a full-slide box with a
  border-image. The editable PPTX export (`@laticent/calco`) cropped it as a slide-sized picture over every
  editable shape and doubled the media. As a small filled strip it exports as one native shape per slide,
  with the pictures and media byte-identical to before (checked on a 14-slide deck of the six frames).
- **Verified:** 0 elements move across the same sweeps as round 2 plus the bleed states; `--bars` shows
  every component but `divider` drawing a bar on left, right and bottom, and the bar-less top is the default.
  Real renders show the bar over a photo, a dark panel, a media slide and (accent) a collage.
- **Not verified:** the Studio and Playground (the runtime twin is
  pinned by a unit test, not driven), and Marp-for-VS-Code. (Round 4 corrects an earlier line here: export-to-Marp ships the runtime and does inject the strips.)

## Round 4: the third independent check

A third checker (Opus, fresh context, run on commit `ffdadf4`) refuted the shipped state. Findings, all
confirmed and fixed:

- **Gatherers swallowed the strip.** Passes that collect a section's children (`split-panels`,
  `masthead-lift`, `coda`, the transform DSL, `carousel`, `split-envelope`, `compare-code`, `guards-trim`,
  `prose-projection`) treated `<i class="slide-bar">` as content. Each now skips it, and three regression
  tests fail with the skip reverted. The strips are the last children only at the moment of injection.
- **Auto-split grew a closing page** holding only the strips on a `split-compare` slide. Fixed in the
  splitter's chrome list and pinned by a test.
- **Two strips, not one.** A slide can want a placement bar and a top bar at once (`accent`, `tone-edge`,
  `spectrum: solid|duo|mono`), so the injector appends `slide-bar` and `slide-bar slide-bar-top`.
- **Print** lost the gradient bar (`background-image:none` needs a color); `section.print` now fills it.
- **The PDF composer painted collage photos over the bar.** `paintedAbove` in
  `lib/core/pdf-compose/read-slide.mjs` now tests each strip's box against the image box.
  `test/integration/export/slide-bar-pdf.test.js` rasterizes left, right and bottom and checks the edge
  pixels differ from the bar-off render.
- **Export-to-Marp does get the bar**, through the bundled runtime. Earlier text saying otherwise was wrong.
- **The harness** now checks overlay integrity (each bleed slide has exactly 0 or 2 direct-child strips and
  no stray ones) and detects strips by paint, and `--bars` includes dark slides' left, right and bottom.

The ODP export is verified (round 5): the strip is one gradient rect per bleed slide and LibreOffice renders it.
Still unverified: the Studio and Playground live preview, RTL, a real Marp render.

## Round 5: the adversarial trio on `f799a29`

Red team, inversion and an independent checker ran on the ship candidate. The placement-shift claim held in
every sweep (about 75,000 red-team measurements and 12,934 checker variant elements). Fixed:

- **CSS `round()` zeroed every slide's padding in older engines** (Chrome before 125, Firefox before 118,
  Safari before 15.4; reproduced in Chrome 120): the custom property is invalid at computed time and the
  `padding` and `border` that read it fall back to unset. `--_bar-w` is now the exact width by default and
  `@supports (width: round(down, 1px, 1px))` switches to the whole-pixel value. Checked in Chrome 120.
- **An author's own `<i class="slide-bar">`** (a footer, say) suppressed the injection on every slide. The
  idempotence guard now matches the exact pair of strips.
- **The `spectrum` lookup matched any class word in the catalog**, so `list bullet` took `bullet`'s answer.
  It now reads the slide's first component token.
- **The opt-out check false-failed** because the injector's zero-size strips counted as a drawn bar. It now
  reads painted sides and borders only.
- **Docs:** the one-time moves are re-measured against `origin/main` (see the changelog), the ODP claim is
  verified, and two stale counts and comments are corrected.

Known and left, each a follow-up or an owner call:

- An unclosed `<div>` in a bleed slide nests the strips inside it, so the bar does not draw in CLI exports
  (the runtime recovers). Main kept the bar there as a border.
- `spectrum: false` does not stop `accent` or `tone-edge` from drawing a top bar: those are per-slide choices.
- A component pinned to a style also strips `spectrum-off`, so a white-label deck re-brands that component.
- A `collage bleed` photo touching the bar's edge is flattened into the page raster in the PDF, so its
  resolution depends on the placement.
- A dark `*-cover` frame under `spectrum: off` sits 3px lower (the dark rule excludes the cover classes).
- Nothing in CI runs `check:edge-shift`; a new stamp or chrome rule written without the per-side tokens would
  move again unnoticed. Wiring it, or a static lint, changes the CI contract and is the owner's call.
- The manifest `spectrum` field has no user yet; the inversion pass recommended cutting it from this PR.

## How it was checked, and what the first round missed

Round 1 swept each component's skeleton slide, light and dark, plus the stamps: 0 of 4,208 moved. An
independent checker (Opus, no shared context) then found that sweep too narrow. It had never rendered a
modifier, a variant or a deck-level register, so seven things still moved: `footer-inset` and
`fill-optical` (every slide, 4 px under a bottom bar), `claim-bleed` (31 components), `collage bleed`,
`topic fact` and the trackless `topic`, `safe` on a narrow canvas, and the stamp ribbon's percentages. Two
of the commit's claims were also wrong: that a default deck looks as it did, and that dark slides no
longer sit 4 px higher. The harness now takes `--variants`, `--classes`, `--each-class all` and
`--front-matter`, and the sweeps below are the gate.

| Sweep (16:9, indaco unless noted) | Elements | Moved > 0.5 px |
|---|---|---|
| Before the change: skeletons, light and dark | 4,209 | 4,039 (162 of 164 slides) |
| After: skeletons, light and dark | 4,209 | 0 |
| After: every manifest variant | 12,934 | 0 |
| After: every one of the 493 reserved classes | 5,964 | 0 |
| After: `footer-inset`, `fill-optical`, `claim-bleed`, `claim-hero`, `accent`, `tone-edge` | about 2,000 each | 0 |
| After: deck `spectrum: solid`, `duo`, `mono`, `off`, `finish: atrium`; no chrome | 4,208 each | 0 |
| After: all state stamps, `safe` on tall and square | 273 / 2,150 | 0 |
| After: square, tall, strip; cuoio, onyx | 4,232 to 4,334 | 0 |

Old CSS against new at the default placement (`--positions`, element by element): only `premise` moves
(19 elements, 2 px; 1.5 px on a narrow canvas) plus the decisions above. A `flowchart` difference of
65 px appears only between a worktree and the main checkout, also at identical commits; two runs of the
same CSS in one checkout agree exactly.

**Not covered:** RTL (rendered nowhere; the bar and its flags are physical sides), the Studio and Playground
previews, the PPTX and ODP exports, real browser zoom, `chart-frame:not(.form)`, and the `fixme-tab` alarm.
A canvas wider than 16:9 (`mobile-landscape`) and the centered and corner logos were swept clean.
