# image

> Image as the slide's anchor, with optional text alongside — composition adapts to the asset and the deck.

**Function** imagery · **Form** canvas · **Substance** prose

**Tags** `visual` · `showcase` · `pitch`

Use when a visual carries meaning on its own. You hand it any rectangle; the layout reads the asset's aspect at build time and, with the deck orientation, RESOLVES the composition for you — no modifier needed. The default is `clean` (a floated card shaped to the photo, ≈ zero crop); extreme aspects auto-pick `split` (shown whole) or `spotlight` (full-bleed cover). Name a composition to override: `clean` · `split` · `spotlight` · `gallery` (contain-on-matte, for diagrams) · `statement` (full-bleed + scrim + title). `mirror` flips the image side. On `spotlight` and `statement`, the text card takes placement (`at-*`), backing (`card-solid`/`soft`/`sheer`/`clear`, or any 5% step such as `card-o65`), ink (`ink-light`/`dark`), size (`card-sm`/`md`/`lg`), shape (`band` stretches the card across the top or bottom edge) and `compact`; the deck front-matter `image-card:` sets them for every image slide in one line. Legacy `full`/`contain`/`museum` still work (→ spotlight/gallery/gallery).

## Agent contract

**By venue** (`venue:`) its body holds laptop ~72 · huddle ~60 · conference ~44 · hall ~30 words on a wide canvas. With `split`: laptop ~72 · huddle ~60 · conference ~44 · hall ~24. With `mirror`: laptop ~72 · huddle ~60 · conference ~44 · hall ~24. On a square canvas: laptop ~78 · huddle ~60 · conference ~40 · hall ~28 (each register has its own row in the manifest). On a tall canvas: laptop ~22 · huddle ~10 · conference ~9 · hall ~4 (each register has its own row in the manifest). On a strip canvas: laptop ~54 · huddle ~34 · conference ~25 · hall ~15 (each register has its own row in the manifest). A 0 means that register has no room for its prose at that venue. Past the room's number the slide still renders at the venue's size, because a venue is a fixed setting the engine never shrinks to fit, so it clips: `lint:deck` warns first (`capacity-scale`), and the export's `⚠ OVERFLOW` line and the Studio's ring name it. Measured on the real slide by growing that slot until the page clips (`tools/calibrate-venue-prose.js`); `lint:deck` reads the same numbers.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `image` | `.lattice-bg` | yes | Marp background image syntax: `![bg](path)` or `![bg right](path)` — rendered as a CSS background-image on the `.lattice-bg` panel (no `<img>`). To try a composition before you have the photo, use a sample: `![bg](sample:photo-wide.svg)`, or `photo-tall`, `photo-pano` and `photo-square` (the full set is in `lib/samples/README.md`). |
| `heading` | `h2` | no | Optional heading in the text slot. |
| `body` | `p` | no | Optional caption or body text. |

### Variant decision rule

- **`clean`.** The photo has a moderate, unremarkable aspect — the safe default; leave the class off and let the resolver land here for near-zero crop.
- **`split`.** The photo has an extreme aspect — a tall portrait or a full panorama — and must be shown whole, uncropped, in its own column or band.
- **`spotlight`.** The photo already matches the canvas's own aspect and can carry the whole slide full-bleed, with a solid text card guaranteeing legibility over it.
- **`gallery`.** The asset is a diagram or screenshot where whitespace and containment are the point — mats it whole on a matte with a placard, zero crop.
- **`statement`.** You want an editorial scrim-and-title hero treatment — a deliberate full-bleed gamble rather than the safe legible default.
- **`mirror`.** The composition is right but the deck's rhythm wants the image on the left instead of the right — flips the side without changing the composition.
- **`at-tl`.** On `spotlight` or `statement`, the photo's subject sits where the card would land — move the card to the quiet part of the frame with one of `at-tl` · `at-top` · `at-tr` · `at-center` · `at-bl` · `at-bottom` · `at-br`.
- **`card-soft`.** On `spotlight` or `statement`, the backing hides too much photo — thin it with `card-soft` (80%) or `card-sheer` (55%), set an exact level with a 5% step (`card-o65` is 65%; the deck line writes `65%`), or drop it with `card-clear` when the photo is calm where the words land. A thin spotlight card (under 60%) needs a matching `ink-light` or `ink-dark`, or the theme's own ink is read against the photo; lint warns (`thin-card-no-ink`), and in the Studio the Card backing slider picks one from the photo for you.
- **`ink-dark`.** On `spotlight` or `statement`, the photo is bright where the words land — `ink-dark` sets dark words on a light backing; `ink-light` sets white words on a dark one.
- **`card-sm`.** On `spotlight` or `statement`, the card competes with the photo — `card-sm` shrinks the card and its type so the photo carries the slide; `card-lg` does the opposite. Add `compact` to tighten the card's padding and pull it closer to the slide edge at any size.
- **`band`.** On `spotlight` or `statement`, the card covers something you want to see above or below it — add `band` to `at-top` or `at-bottom` to stretch the card across the slide in one short strip (heading left, text right) and leave the middle of the photo clear, with a hairline in the gap between the two columns. On a corner or center placement `band` does nothing; `card-float` steps one slide out of a deck-wide `band`.

### Common mistakes

- **Writing plain image syntax `![alt](path)` instead of Marp background syntax `![bg](path)`.** The `image` slot renders the asset as a CSS background on `.lattice-bg` (no `<img>`) — without `bg` in the alt text the picture never becomes the section's background, and no composition can resolve around it.
- **Naming a composition class (`image spotlight`, `image gallery`, …) reflexively instead of leaving it unset.** The composition RESOLVES from the photo's own aspect ratio plus the deck orientation — an explicit class always wins over the resolver, so naming one out of habit can force a crop (e.g. `spotlight`'s full-bleed cover) that the auto-picked `clean`/`split` composition would have avoided.
- **Adding a card control (`at-*`, `card-*`, `ink-*`) to a `clean`, `split` or `gallery` slide.** Those compositions set the text beside the photo, not over it, so there is no card to move. The card controls act only on `spotlight` and `statement` — name one of those first: `image spotlight at-tr card-sm`.

## When to use

- **The visual carries meaning.** Product screenshots, architectural photographs, plots, satellite imagery — anywhere the image makes the argument and the prose is annotation. If the visual is decorative, drop it and use `content` instead.
- **Let the layout resolve it — override only with intent.** Drop in any aspect and the layout reads it: a moderate photo gets the `clean` floated card, a tall/wide one gets `split` (shown whole), a canvas-matching one gets `spotlight` (full-bleed). Override only when you mean it: `image gallery` to contain a diagram zero-crop, `image statement` for a scrim-and-title hero, `image spotlight` to force a full-bleed cover (accepting the crop).
- **Caption earns its line.** If the prose alongside the image just describes what the image shows, drop it — the audience can see the picture. The text slot is for the so-what: what the audience should take away from the visual.

## When NOT to use

- **Decorative stock photo.** A generic photograph of 'people in a meeting' next to a content slide is filler. Use `content` and trust the prose; reserve image for visuals that argue for themselves.
- **Image too small to read.** A diagram or screenshot small enough to fit inside a half-canvas text slot is unreadable from the back of the room. Reach for `image gallery` (contains it whole) or `image spotlight`, or move the diagram to its own `diagram` slide.
- **Image with five paragraphs of caption.** If the prose dominates and the image is a sidebar, you have a `content` slide that happens to have a photo. Either trust the image (drop the prose) or trust the prose (drop the image).

## Authoring

```markdown
<!-- _class: image -->

## Text leads; the image earns its place.

Swap the bg image below for your own asset — any aspect. The layout reads its shape and resolves the composition for you (a floated card, a full-height column, a full-bleed cover). Name a composition (`image spotlight`, `image gallery`, …) only to override.

![bg](sample:photo-wide.svg)
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                                         │
│  Text slot on     ┌──────────────────┐  │
│  the left, with   │                  │  │
│  optional         │   [image area]   │  │
│  caption.         │                  │  │
│                   └──────────────────┘  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `clean` — clean

Drops the caption chrome.

```markdown
<!-- _class: image clean -->

## clean drops the caption chrome.

Two-thirds of trials that reach the first generated report convert; the ones that stall almost never do.

![bg](sample:photo-wide.svg)
```

### `split` — split

A portrait gets its full column.

```markdown
<!-- _class: image split -->

## split gives a portrait its full column.

A portrait photo wants its full height. We give it a column and let the argument run alongside.

![bg](sample:photo-tall.svg)
```

### `spotlight` — spotlight

A panorama owns the frame.

```markdown
<!-- _class: image spotlight -->

## spotlight lets a panorama own the frame.

When the photo already matches the canvas, let it carry the slide — the message rides in a solid card so it never fights the image.

![bg](sample:photo-pano.svg)
```

### `gallery` — gallery

The exhibit on a matte with a placard.

```markdown
<!-- _class: image gallery -->

## gallery mats the exhibit with a placard.

The whole asset on a matte with a placard. For diagrams and screenshots where the whitespace is the point.

![bg](sample:photo-square.svg)
```

### `statement` — statement

The title rides the photo on a scrim.

```markdown
<!-- _class: image statement -->

## statement rides the title on a scrim.

The title rides the photo on a scrim — a deliberate, editorial choice.

![bg](sample:photo-wide.svg)
```

### `mirror` — mirror

The image lands on the left.

```markdown
<!-- _class: image mirror -->

## mirror lands the image on the left.

Text leads from the right; image anchors from the left.

![bg left](sample:photo-wide.svg)
```

### `at-tl` — Top left

The text card sits in the top-left corner.

```markdown
<!-- _class: image spotlight at-tl -->

## at-tl lifts the card to the top left.

Move the card to wherever the photo is quiet, so the subject keeps the frame.

![bg](sample:photo-wide.svg)
```

### `at-top` — Top center

The text card sits centered along the top.

```markdown
<!-- _class: image statement at-top -->

## at-top centers the title up high.

The scrim follows the words to the top edge.

![bg](sample:photo-wide.svg)
```

### `at-tr` — Top right

The text card sits in the top-right corner.

```markdown
<!-- _class: image spotlight at-tr -->

## at-tr parks the card top right.

The subject sits low and left, so the words take the open sky.

![bg](sample:photo-wide.svg)
```

### `at-center` — Center

The text card sits in the middle of the slide.

```markdown
<!-- _class: image statement at-center -->

## at-center puts the title dead center.

A radial scrim darkens only the middle.

![bg](sample:photo-wide.svg)
```

### `at-bl` — Bottom left

The text card sits in the bottom-left corner — the default.

```markdown
<!-- _class: image spotlight at-bl -->

## at-bl is the default corner.

Name it to return a slide to bottom left inside a deck that moved it.

![bg](sample:photo-wide.svg)
```

### `at-bottom` — Bottom center

The text card sits centered along the bottom.

```markdown
<!-- _class: image spotlight at-bottom -->

## at-bottom centers the card low.

A caption band under the subject, centered on the slide.

![bg](sample:photo-wide.svg)
```

### `at-br` — Bottom right

The text card sits in the bottom-right corner.

```markdown
<!-- _class: image statement at-br -->

## at-br anchors the title bottom right.

The scrim flips to darken the right side.

![bg](sample:photo-wide.svg)
```

### `card-solid` — Solid backing

The card or scrim at full strength — the default.

```markdown
<!-- _class: image spotlight card-solid -->

## card-solid keeps the card opaque.

Full legibility over any photo. This is the default.

![bg](sample:photo-wide.svg)
```

### `card-soft` — Soft backing

The card or scrim at 80%, so the photo glows through.

```markdown
<!-- _class: image spotlight card-soft -->

## card-soft lets the photo glow through.

The panel drops to 80% and loses its lift shadow.

![bg](sample:photo-wide.svg)
```

### `card-sheer` — Sheer backing

The card or scrim at 55%, a tint more than a panel.

```markdown
<!-- _class: image spotlight card-sheer ink-light -->

## card-sheer turns the card into a tint.

At 55% the photo reads through; pair it with an ink that suits the photo.

![bg](sample:photo-wide.svg)
```

### `card-clear` — Clear backing

No card and no scrim: the words ride the photo.

```markdown
<!-- _class: image statement card-clear -->

## card-clear drops the scrim.

Only for a photo with a calm, dark patch where the words land.

![bg](sample:photo-wide.svg)
```

### `ink-light` — Light ink

White words on a dark backing.

```markdown
<!-- _class: image spotlight ink-light -->

## ink-light sets white words on a dark card.

The card turns dark to match, whatever the deck palette.

![bg](sample:photo-wide.svg)
```

### `ink-dark` — Dark ink

Near-black words on a light backing.

```markdown
<!-- _class: image statement ink-dark -->

## ink-dark sets dark words on a light scrim.

For a bright photo: the scrim turns light and the title goes dark.

![bg](sample:photo-wide.svg)
```

### `card-sm` — Small card

A narrower card with smaller type, so the photo breathes.

```markdown
<!-- _class: image spotlight card-sm at-tr -->

## card-sm keeps the card discreet.

Smaller type and a narrower card leave the photo the slide.

![bg](sample:photo-wide.svg)
```

### `card-md` — Medium card

The default card width and type.

```markdown
<!-- _class: image spotlight card-md -->

## card-md is the default size.

Name it to return a slide to the default inside a deck that resized it.

![bg](sample:photo-wide.svg)
```

### `card-lg` — Large card

A wider card with larger type, for a message that leads.

```markdown
<!-- _class: image spotlight card-lg -->

## card-lg lets the message lead.

Wider card, bigger heading, room for a longer line.

![bg](sample:photo-wide.svg)
```

### `card-regular` — Regular density

The default card spacing, so one slide can step out of a deck-wide compact.

```markdown
<!-- _class: image spotlight card-regular -->

## card-regular keeps the default spacing.

In a deck that sets `image-card: compact`, this slide keeps the roomier card.

![bg](sample:photo-wide.svg)
```

### `band` — Full-width band

Stretches the card across the slide along the top or bottom edge, so the middle of the photo stays clear.

```markdown
<!-- _class: image spotlight at-bottom band -->

## band keeps the middle of the photo clear.

The heading takes the left column and the text the right, in one short strip along the edge.

![bg](sample:photo-wide.svg)
```

### `card-float` — Floating card

The default floating card, so one slide can step out of a deck-wide band.

```markdown
<!-- _class: image spotlight at-bottom card-float -->

## card-float keeps the card a card.

In a deck that sets `image-card: bottom band`, this slide keeps the floating card.

![bg](sample:photo-wide.svg)
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`diagram`](../../diagram/diagram/diagram.docs.md) — the visual is a Mermaid graph, not a photo or screenshot
- [`content`](../../statement/content/content.docs.md) — the slide is mostly prose with one inline visual
- [`title`](../../anchor/title/title.docs.md) — the image is a bookend hero, not the body of a slide
- [`quote`](../../statement/quote/quote.docs.md) — the slide is a quotation, not an image

## Demo deck

See [image.gallery.light.pdf](./image.gallery.light.pdf) for rendered examples of every variant.
