---
status: in-progress
summary: >
  Choosing a different spectrum-bar placement moves the slide. The bar is a real `border` on the
  `section`, and a border takes layout room, so the content box and every absolutely positioned
  element that measures from the padding box (header, footer, page number, the draft and
  confidential stamps) land 2 to 5 px differently under `top`, `left`, `right`, `bottom` and `off`.
  A dark slide has no bar border at all, so it also sits 4 px off a light slide in the same deck.
  `npm run check:edge-shift` measures this. Baseline, same machine, indaco, 16:9: 4,208 elements
  across 164 slides, 4,038 moved, 162 of 164 slides affected; only `divider` (it owns its own
  rail) holds still. The fix is to reserve the bar's room on every edge so no placement changes
  the content box. Not built yet; this note records the harness and its first numbers.
---

# Spectrum placement moves the slide

**Date:** 2026-10-26 · **Status:** in-progress (harness shipped, fix not built)

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

The harness decides between the last two; the fix lands in a follow-up commit on this branch.
