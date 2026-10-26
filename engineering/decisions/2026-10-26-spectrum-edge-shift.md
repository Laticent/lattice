---
status: shipped
summary: >
  Choosing a different spectrum-bar placement used to move the slide. The bar is a real `border`
  on the `section`, so the content box and every element that measures from the padding box (header,
  footer, page number, the draft and confidential stamps, the overflow marker) landed 2 to 5 px
  differently under `top`, `left`, `right`, `bottom` and `off`. Baseline: 4,038 of 4,208 elements
  moved, 162 of 164 slides affected. The fix leaves every border rule alone and makes the section's
  padding give up exactly the border each side carries (`--_bar-*`), so the total inset per side is
  constant; chrome insets and the stamp do the same. After it, 0 of 4,208 elements move, on four
  canvas shapes and three themes, and a default deck is geometrically unchanged except `premise`
  (2 px). Cost: the full-bleed layouts `image`, `scene`, `split-panel` and `split-compare` no longer
  show a side or bottom bar. `npm run check:edge-shift` is the gate.
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

- `--_bar-room-t` is the top room the default bar always took. It holds a slide whose bar is elsewhere
  at the same 4 px, so a default deck does not move. A frame whose default has no top bar (dark,
  print, `title`, `closing`, `divider`, `topic`, every chart frame, the full-bleed frames, `claim-bleed`)
  sets it to 0 and stays where it was.
- `section.form` sets its own padding in `stage.css`; it gets the same subtraction.
- Chrome that measures from the padding box (header, footer, page number, progress rail, logo,
  the safe-area lift) reads new per-side tokens `--frame-inset-t/b/l/r`, and the state stamp reads
  `--_stamp-*`, so each holds the same distance from the slide edge. The overflow marker rail does
  the same.
- A `lat-pane` is a slide inside the slide with its own containing block. It clears the bar flags and
  re-derives the insets, or its rail would subtract a bar the pane does not carry.
- `topic` subtracts the bar from its own side and bottom padding and its two absolute tracks, and its
  shelf measures from the border box.

**Two decisions that change what an author sees:**

1. `image`, `scene`, `split-panel` and `split-compare` set `padding: 0` and draw their own edge, so a
   side border could only shrink the photo or panel. They are exempted from the left, right and bottom
   bar (as `divider` already was) and show no bar there, as they show none on top in the default
   placement. Reversing it means reserving a strip around full-bleed art, which leaves a visible gutter.
2. `premise` has no block padding of its own, so it reserves one bar width at the bottom. A default
   `premise` slide's content sits 2 px higher (centered, 4 px less room).

**Left alone, on purpose:** a dark or print slide still sits 4 px higher than a light one in the same
deck. That predates this change and is not a placement effect. Making dark match light is one line
(drop `--_bar-room-t: 0px` from the dark rule) and moves every dark slide 4 px, so it is the owner's call.

## Measured result

`npm run check:edge-shift`, every component in light and dark plus the stamp and canvas slides, header,
footer and page number on:

| Run | Elements compared | Moved more than 0.5 px |
|---|---|---|
| Before, 16:9, indaco | 4,208 | 4,038 (162 of 164 slides) |
| After, 16:9 indaco / cuoio / onyx | 4,208 | 0 |
| After, square / tall / strip | 4,232 / 4,334 / 4,254 | 0 |

Default placement, old CSS against new (`--positions`, element by element): 38 of 4,216 elements moved,
all on `premise` (2 px). Everything else is where it was.
