# scene

> An Anima motion scene as its poster still — an inline, palette-blind SVG that recolors with the theme and bakes crisp into the PDF; the live animation plays in the HTML/present surfaces.

**Function** imagery · **Form** canvas · **Substance** prose

**Tags** `visual` · `showcase` · `walkthrough`

Use to put an Anima scene (a 3D mechanism, a self-drawing process flow) on a slide as its hero still. Because the deck renders to a static PDF, a `scene` slide shows the POSTER — an INLINE `<svg>` (never a background-image), so its `var(--token)` fills recolor with the deck theme in light and dark. Author it by pasting the scene's poster SVG under the heading; the Studio's Motion faculty inlines it for you. Scene is a faithful mirror of `image`: the composition auto-RESOLVES from the poster's own aspect × the deck orientation (`clean` is the safe floor), and you name a variant only to override. The compositions: `clean` (a card shaped to the still), `split` (a tall scene gets its own full-height column), `spotlight` (a wide scene owns the frame on a matte stage), `gallery` (opt-in — the whole still matted in a passe-partout frame with a placard below, the exhibit look for a diagram-like scene), `statement` (opt-in — the still on a matte stage with the title on an editorial band), and `mirror` (flips the side). For LIVE motion (Stage 6), add an ```anima fenced block — the scene's motion SPEC as JSON — beside the poster: the PDF still freezes the poster, and on the Studio Playground the poster comes alive (the Motion faculty emits this block for you). Under `prefers-reduced-motion` the motion reduces to the poster.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | no | Optional heading — the so-what of the scene, not 'Animation'. |
| `scene` | `.scene-figure svg, svg` | yes | The scene's poster still, authored as an INLINE `<svg>` under the heading. Its `var(--token)` fills recolor with the theme (it must be inline, not a background-image). The Motion faculty inlines a saved scene's stored poster here. |
| `body` | `p` | no | Optional caption — one line on what the motion reveals that a still can't. |

### Variant decision rule

- **`clean`.** The poster has a moderate, unremarkable aspect — the safe default; leave the class off and let the resolver land here.
- **`split`.** The poster has an extreme aspect — a tall rig or a wide mechanism — and needs its own full-height column or full-width band shown whole.
- **`spotlight`.** The poster already matches the canvas's own aspect and can own the frame on a matte stage.
- **`gallery`.** The scene is diagram-like — the whole still matted like an exhibit with a placard is the point.
- **`statement`.** You want the still on a matte stage with the title riding an editorial band beneath it — a deliberate opt-in look.
- **`mirror`.** The composition is right but the deck's rhythm wants the scene on the left instead of the right — flips the side without changing the composition.

### Common mistakes

- **Pasting a raster export (PNG/JPG) of the poster instead of the literal inline `<svg>…</svg>` markup.** The `scene` slot must be an INLINE `<svg>` so its `var(--token)` fills recolor with the theme in light and dark and bake crisp into the PDF — a raster image breaks the palette-blind contract and never recolors.
- **Naming a composition class (`scene spotlight`, `scene gallery`, …) reflexively instead of leaving it unset.** scene is a faithful mirror of `image`: the composition RESOLVES from the poster's own aspect plus the deck orientation — an explicit class always wins over the resolver, so naming one out of habit can force a crop the auto-picked composition would have avoided.

## When to use

- **Motion carries the meaning.** A mechanism you must rotate to read, a process that assembles in order, a quantity bound to live data — anywhere a still can only imply the relationship. The poster captures the hero frame; the live surfaces animate it.
- **You have a fabricated scene.** You built and tuned an Anima scene in the Studio's Motion faculty and want it in the deck. The faculty inlines its poster; the slide recolors it to whichever theme frames it.
- **A diagram that earns its motion.** When a static `diagram` almost says it but the ORDER or the DEPTH is the point — a flow drawing itself node-by-node, a rig turning — reach for `scene` over `diagram`.

## When NOT to use

- **Motion as decoration.** If the animation doesn't carry information a still can't — a spinning logo, a bouncing shape — it's ornament. Drop it and use `image` or `diagram`. `scene` is for motion that argues.
- **Expecting the PDF to move.** A PDF is paper — it shows the poster still, not the animation. If the turning IS the point for a print hand-out, choose the hero frame that reads best on its own; the live motion is for the HTML/present surfaces.
- **A photo or screenshot.** If the visual is a raster still that never animates and never recolors, it's an `image`, not a `scene`. Reserve `scene` for the palette-blind, motion-bearing vector still.

## Authoring

```markdown
<!-- _class: scene gallery -->

## What the mechanism does.

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="80" rx="82" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,42 152,96 88,96" fill="var(--accent)"/><circle cx="202" cy="80" r="11" fill="var(--cat-4-mark)"/><rect x="76" y="112" width="88" height="11" rx="3" fill="var(--text-muted)"/></svg>

The rotor spins inside its housing — a relationship a single still can only imply.

<!-- Live motion (HTML/present only) — the Motion faculty writes this `anima` block for you; edit or delete it. -->

```anima
{
  "source": "built",
  "duration": 3000,
  "hero": 0.5,
  "camera": { "rotate": [-0.5, -0.6, 0] },
  "elements": [
    { "id": "rig", "shape": "group", "motion": [{ "verb": "spin", "axis": "y", "period": 3000 }], "children": [
      { "id": "ring", "shape": "ellipse", "color": "var(--cat-2-mark)", "props": { "diameter": 150, "stroke": 10 }, "transform": { "rotate": [1.5708, 0, 0] } },
      { "id": "rotor", "shape": "cone", "color": "var(--accent)", "props": { "diameter": 74, "length": 96 } }
    ] }
  ]
}
```
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

A card shaped to the still, beside its point.

```markdown
<!-- _class: scene clean -->

## clean seats the scene beside its claim.

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="80" rx="82" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,42 152,96 88,96" fill="var(--accent)"/><circle cx="202" cy="80" r="11" fill="var(--cat-4-mark)"/><rect x="76" y="112" width="88" height="11" rx="3" fill="var(--text-muted)"/></svg>

The still floats in a card; the argument runs alongside.
```

### `split` — split

A tall scene gets its own column.

```markdown
<!-- _class: scene split -->

## split gives a tall scene its full column.

<svg viewBox="0 0 150 220" xmlns="http://www.w3.org/2000/svg"><rect x="48" y="20" width="54" height="54" rx="8" fill="none" stroke="var(--cat-2-mark)" stroke-width="7"/><path d="M75 74 V120 M64 110 L75 122 L86 110" fill="none" stroke="var(--text-muted)" stroke-width="6"/><rect x="48" y="122" width="54" height="54" rx="8" fill="var(--accent)"/></svg>

A portrait scene wants its height; the claim leads beside it.
```

### `spotlight` — spotlight

A wide scene owns the frame.

```markdown
<!-- _class: scene spotlight -->

## spotlight lets a wide scene carry the slide.

<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="55" width="90" height="40" rx="9" fill="none" stroke="var(--cat-2-mark)" stroke-width="6"/><path d="M110 75 H150 M140 67 L152 75 L140 83" fill="none" stroke="var(--text-muted)" stroke-width="5"/><rect x="152" y="55" width="90" height="40" rx="9" fill="none" stroke="var(--accent)" stroke-width="6"/><path d="M242 75 H282 M272 67 L284 75 L272 83" fill="none" stroke="var(--text-muted)" stroke-width="5"/><rect x="284" y="55" width="56" height="40" rx="9" fill="var(--cat-6-mark)"/></svg>

When the scene already matches the canvas, let it own the frame.
```

### `gallery` — gallery

The whole still contained on a matte.

```markdown
<!-- _class: scene gallery -->

## gallery mats the scene like an exhibit.

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="80" rx="82" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,42 152,96 88,96" fill="var(--accent)"/><circle cx="202" cy="80" r="11" fill="var(--cat-4-mark)"/><rect x="76" y="112" width="88" height="11" rx="3" fill="var(--text-muted)"/></svg>

The whole scene on a matte — the default when the shape is the point.
```

### `statement` — statement

The title rides an editorial band below the scene.

```markdown
<!-- _class: scene statement -->

## statement rides the title below the scene.

<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg"><ellipse cx="180" cy="100" rx="120" ry="46" fill="none" stroke="var(--cat-2-mark)" stroke-width="12"/><polygon points="180,42 224,128 136,128" fill="var(--accent)"/><circle cx="300" cy="100" r="15" fill="var(--cat-4-mark)"/></svg>

The still sits on a matte stage; the title rides an editorial band beneath it.
```

### `mirror` — mirror

The scene lands on the left.

```markdown
<!-- _class: scene mirror -->

## mirror lands the scene on the left.

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="80" rx="82" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,42 152,96 88,96" fill="var(--accent)"/><circle cx="202" cy="80" r="11" fill="var(--cat-4-mark)"/><rect x="76" y="112" width="88" height="11" rx="3" fill="var(--text-muted)"/></svg>

Scene anchors from the left; the text leads from the right.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`image`](../../imagery/image/image.docs.md) — the visual is a still photo or screenshot, not an animated scene
- [`diagram`](../../diagram/diagram/diagram.docs.md) — a static Mermaid graph says it — no order or depth that needs motion
- [`video`](../../imagery/video/video.docs.md) — the motion is recorded footage with a provider, not a fabricated vector scene

## Demo deck

See [scene.gallery.light.pdf](./scene.gallery.light.pdf) for rendered examples of every variant.
