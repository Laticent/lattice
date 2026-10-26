---
status: shipped
summary: >
  Choosing a different spectrum-bar placement used to move the slide. The bar is a real `border` on the
  `section`, so the content box and every element that measures from the padding box (header, footer,
  page number, stamps, `mark-*` decorations, the overflow marker) landed 2 to 5 px differently under
  `top`, `left`, `right`, `bottom` and `off`. Baseline: 4,038 of 4,208 elements moved, 162 of 164 slides.
  The fix leaves every border rule alone and makes the section's padding give up exactly the border each
  side carries (`--_bar-*`), so the total inset per side is constant; chrome insets, stamps and marks do
  the same. After it, 0 elements move across the components, their manifest variants, five layout
  modifiers, all 493 reserved classes, four canvas shapes and three themes. At the default placement a
  deck is unchanged except `premise` (2 px). The same rule means adding or removing the bar with
  `accent`, `tone-edge` or the `spectrum:` register no longer moves content, which changes decks that use
  them by 2 to 4 px. Cost: the full-bleed layouts show no side or bottom bar. `npm run check:edge-shift`
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
page number 4.0. 4,038 of 4,208 compared elements moved, most of them descendants carried along
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

1. **No side or bottom bar on full-bleed frames.** `image`, `scene`, `split-panel`, `split-compare`,
   `claim-bleed` media (chart, diagram, video, big-number) and `collage bleed` have no inset to give a bar,
   so a side border could only shrink the photo or panel. They show no bar there, as they show none on top
   in the default placement. A deck-wide `spectrum: solid|duo|mono` no longer adds a top bar to `image`
   and `scene`. Reversing it means reserving a strip around full-bleed art, which leaves a visible gutter.
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
| Before the change: skeletons, light and dark | 4,208 | 4,038 (162 of 164 slides) |
| After: skeletons, light and dark | 4,208 | 0 |
| After: every manifest variant | 10,402 | 0 |
| After: every one of the 493 reserved classes | 5,943 | 0 |
| After: `footer-inset`, `fill-optical`, `claim-bleed`, `claim-hero`, `accent`, `tone-edge` | about 2,000 each | 0 |
| After: deck `spectrum: solid`, `duo`, `mono`, `off`, `finish: atrium`; no chrome | 4,208 each | 0 |
| After: all state stamps, `safe` on tall and square | 273 / 2,150 | 0 |
| After: square, tall, strip; cuoio, onyx | 4,232 to 4,334 | 0 |

Old CSS against new at the default placement (`--positions`, element by element): only `premise` moves
(19 elements, 2 px; 1.5 px on a narrow canvas) plus the decisions above. A `flowchart` difference of
65 px appears only between a worktree and the main checkout, also at identical commits; two runs of the
same CSS in one checkout agree exactly.

**Not covered:** RTL (rendered nowhere; the bar and its flags are physical sides), canvases wider than
16:9, the Studio and Playground previews, the PPTX and ODP exports, `logo:` placements other than the
default corner, and the `fixme-tab` alarm.
