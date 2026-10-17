# collage

> Four to six photos of any shape packed edge to edge into a mood board, with the usual eyebrow, title, subtitle and description beside them.

**Function** imagery · **Form** canvas · **Substance** structure

**Tags** `visual` · `showcase` · `pitch` · `masonry` · `mood-board`

Use when several photographs make the argument together: a product line, a site, a collection. You list the photos; the layout reads each photo's shape and packs them with no cropping, so a tall portrait, a square and a panorama share one frame. Every photo is a rectangle of its own shape with flush edges. The packer picks the order that fits best; add `ordered` to keep the order you wrote. Live surfaces add hover focus, and a click or tap (Enter or Space on a focused photo) enlarges a photo with its alt text as the caption; Arrow keys, Home, End, a swipe or the two arrow buttons step to the other photos, and a pinch, ctrl and wheel, or the plus and minus keys zoom the open photo; Escape, a click away or the close button puts it back. The exported HTML player enlarges photos too; a PDF is a clean static collage. Narration reads the description and then names each photo by its alt text, one sentence apiece, and the Present Guide's pointer lands on the photo as it is named. The article view lists every photo in written order.

## Agent contract

**By venue** no count budget. Its elements are photographs; a synthetic deck would measure broken-image boxes, not photos. The packer holds four to six, and falls back to an even grid past six.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the title, a short label in backticks. |
| `title` | `h2` | no | Optional title. A claim earns its place; a bare label does not. |
| `subtitle` | `h2 + p > code:only-child` | no | Optional line under the title, in backticks. |
| `description` | `p` | no | Optional description paragraph, written after the title and subtitle and before the photos. It is the slide's only caption and prints in every export. |
| `photos` | `ul > li > img` | yes | One list item per photo, written as `- ![Alt text](path.jpg)`. Four to six photos. The alt text is the screen-reader label and the label in the enlarged view; it is not drawn on the tile. A trailing code span sets hints for that photo: `hero` (largest tile), one of `top` `bottom` `left` `right` `center` (which part stays in view if it is cropped), and a ratio such as `3:2` for a remote image the build cannot measure. Separate hints with commas. An unknown word voids the whole span: nothing in it applies, nothing is drawn for it, and lint names the word. |

### Common mistakes

- **Writing the photos as `![bg](path)` background images.** `collage` reads inline photos in a list, one per bullet: `- ![Alt](path.jpg)`. The `bg` syntax belongs to `image`.
- **Nesting a caption under each photo.** A collage has no per-photo captions. Write one description paragraph after the title and subtitle.
- **Writing hints that are not on the hint list, such as `big` or `centre`.** An unknown word voids the whole span: nothing in it applies and nothing is drawn for it. Lint names the word. The words are `hero`, `top`, `bottom`, `left`, `right`, `center` and a ratio like `3:2`.

## When to use

- **Several photos argue together.** A product line, a site walk, a collection, a before-and-after set. If one photo carries the slide, use `image`.
- **Your photos come in mixed shapes.** Phone portraits, square product shots and wide landscapes can share one slide. The layout reads each shape and gives every photo a tile of its own shape, so nothing is cropped by default.
- **You want the order to be the packer's call, or yours.** The default lets the packer reorder photos for the tightest fit. Add `ordered` when the sequence matters, such as a process shot left to right.

## When NOT to use

- **More than six photos.** Past six, tiles get too small to read from the back of the room, and the layout falls back to a plain even grid. Split the photos across two collage slides.
- **Photos used as decoration.** A collage of generic stock images fills space and says nothing. Use photos the audience should look at.
- **Captions on every photo.** There are no per-photo captions. Say what the photos show once, in the description paragraph, and let the alt text carry the rest.

## Authoring

```markdown
<!-- _class: collage -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)
```

## Variants (component-specific)

### `ordered` — ordered

Keep the photos in the order written.

```markdown
<!-- _class: collage ordered -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)
```

### `fill` — fill

Allow a small crop to close empty space.

```markdown
<!-- _class: collage fill -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)
```

### `above` — above

Text above the photos instead of beside them.

```markdown
<!-- _class: collage above -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)
```

### `bleed` — bleed

The collage runs edge to edge. Each photo loses a share of its edges to fill the slide: about 4% on average, up to a sixth for an awkward mix.

```markdown
<!-- _class: collage bleed -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)
```

### `mirror` — mirror

Text on the other side.

```markdown
<!-- _class: collage mirror -->

`The atelier`

## Hand-lasted, one pair at a time.

`Five photographs from the autumn bench`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tall portrait](sample:photo-tall.svg) `hero`
- ![Wide landscape](sample:photo-wide.svg)
- ![Square](sample:photo-square.svg)
- ![Panorama](sample:photo-pano.svg)
- ![Narrow column](sample:photo-column.svg)
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`image`](./image.md) — one photo carries the slide
- [`logo-wall`](./logo-wall.md) — the pictures are brand marks, not photographs
- [`content`](./content.md) — the slide is mostly prose with one inline visual

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/imagery/collage>
