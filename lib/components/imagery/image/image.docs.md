# image

> Image as the slide's anchor, with optional text alongside — composition adapts to the asset and the deck.

**Function** imagery · **Form** canvas · **Substance** prose

**Tags** `visual` · `showcase` · `pitch`

Use when a visual carries meaning on its own. You hand it any rectangle; the layout reads the asset's aspect at build time and, with the deck orientation, RESOLVES the composition for you — no modifier needed. The default is `clean` (a floated card shaped to the photo, ≈ zero crop); extreme aspects auto-pick `split` (shown whole) or `spotlight` (full-bleed cover). Name a composition to override: `clean` · `split` · `spotlight` · `gallery` (contain-on-matte, for diagrams) · `statement` (full-bleed + scrim + title). `mirror` flips the image side. Legacy `full`/`contain`/`museum` still work (→ spotlight/gallery/gallery).

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `image` | `.lattice-bg` | yes | Marp background image syntax: `![bg](path)` or `![bg right](path)` — rendered as a CSS background-image on the `.lattice-bg` panel (no `<img>`). |
| `heading` | `h2` | no | Optional heading in the text slot. |
| `body` | `p` | no | Optional caption or body text. |

### Variant decision rule

- **`clean`.** The photo has a moderate, unremarkable aspect — the safe default; leave the class off and let the resolver land here for near-zero crop.
- **`split`.** The photo has an extreme aspect — a tall portrait or a full panorama — and must be shown whole, uncropped, in its own column or band.
- **`spotlight`.** The photo already matches the canvas's own aspect and can carry the whole slide full-bleed, with a solid text card guaranteeing legibility over it.
- **`gallery`.** The asset is a diagram or screenshot where whitespace and containment are the point — mats it whole on a matte with a placard, zero crop.
- **`statement`.** You want an editorial scrim-and-title hero treatment — a deliberate full-bleed gamble rather than the safe legible default.
- **`mirror`.** The composition is right but the deck's rhythm wants the image on the left instead of the right — flips the side without changing the composition.

### Common mistakes

- **Writing plain image syntax `![alt](path)` instead of Marp background syntax `![bg](path)`.** The `image` slot renders the asset as a CSS background on `.lattice-bg` (no `<img>`) — without `bg` in the alt text the picture never becomes the section's background, and no composition can resolve around it.
- **Naming a composition class (`image spotlight`, `image gallery`, …) reflexively instead of leaving it unset.** The composition RESOLVES from the photo's own aspect ratio plus the deck orientation — an explicit class always wins over the resolver, so naming one out of habit can force a crop (e.g. `spotlight`'s full-bleed cover) that the auto-picked `clean`/`split` composition would have avoided.

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

![bg](sample-photo-wide.svg)
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

![bg](sample-photo-wide.svg)
```

### `split` — split

A portrait gets its full column.

```markdown
<!-- _class: image split -->

## split gives a portrait its full column.

A portrait photo wants its full height. We give it a column and let the argument run alongside.

![bg](sample-photo-tall.svg)
```

### `spotlight` — spotlight

A panorama owns the frame.

```markdown
<!-- _class: image spotlight -->

## spotlight lets a panorama own the frame.

When the photo already matches the canvas, let it carry the slide — the message rides in a solid card so it never fights the image.

![bg](sample-photo-pano.svg)
```

### `gallery` — gallery

The exhibit on a matte with a placard.

```markdown
<!-- _class: image gallery -->

## gallery mats the exhibit with a placard.

The whole asset on a matte with a placard. For diagrams and screenshots where the whitespace is the point.

![bg](sample-photo-square.svg)
```

### `statement` — statement

The title rides the photo on a scrim.

```markdown
<!-- _class: image statement -->

## statement rides the title on a scrim.

The title rides the photo on a scrim — a deliberate, editorial choice.

![bg](sample-photo-wide.svg)
```

### `mirror` — mirror

The image lands on the left.

```markdown
<!-- _class: image mirror -->

## mirror lands the image on the left.

Text leads from the right; image anchors from the left.

![bg left](sample-photo-wide.svg)
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
