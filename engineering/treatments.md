# Treatment Library

`tint-*` and `mark-*` classes apply peripheral atmospheric accents to slides — 12 tints (gradient washes) and 11 marks (SVG accent shapes), plus a `treatment-none` reset. They are loaded automatically — no imports, no theme switching. Add a class name to any `<!-- _class: -->` directive alongside the layout class.

> These are **color** treatments. Categorical **texture** — the non-color `<pattern>` channel that lets monochrome/CVD/print decks tell categories apart (`--cat-N-texture`) — is a separate mechanism documented in `engineering/textures.md`.

A note on naming: this library was called the **Background Library** before 2026-05-17, with classes prefixed `bg-*`. The rename split decorations into two semantic families (tints and marks) and added a placement axis. See `engineering/decisions/2026-05-17-treatments-rename.md` for the rationale, the rename mapping table, and the architectural lessons from the catalog rebuild.

---

## Usage

**Per-slide, placement-agnostic treatment:**
```markdown
<!-- _class: content tint-vignette -->
<!-- _class: content mark-orbit -->
```

**Per-slide, placement-required (corners + edges):**
```markdown
<!-- _class: content tint-corner at-tl -->
<!-- _class: content tint-edge at-right -->
```

**Deck-wide (front-matter `class:`):**
```yaml
---
theme: indaco
class: tint-corner at-tl
---
```
The deck-class propagator merges every token (treatment + placement) into every slide's class list. Per-slide `<!-- _class: -->` still wins for tokens it explicitly declares.

**Override one slide back to clean:**
```markdown
<!-- _class: content treatment-none -->
```

**Layered (one radial-slot + one linear-slot + one mark):**
```markdown
<!-- _class: content tint-corner at-tl tint-edge at-right mark-micro -->
```
See [Layer composability](#layer-composability) for rules.

---

## Placement axis

`tint-corner` and `tint-edge` carry an `at-*` placement modifier. Both long and short forms are accepted, plus a per-layer escape hatch:

| Position | Short | Long | Per-layer (tint) |
|---|---|---|---|
| Top-left | `at-tl` | `top-left` | `tint-at-tl` |
| Top-right | `at-tr` | `top-right` | `tint-at-tr` |
| Bottom-left | `at-bl` | `bottom-left` | `tint-at-bl` |
| Bottom-right | `at-br` | `bottom-right` | `tint-at-br` |
| Top | `at-top` | `top` | `tint-at-top` |
| Right | `at-right` | `right` | `tint-at-right` |
| Bottom | `at-bottom` | `bottom` | `tint-at-bottom` |
| Left | `at-left` | `left` | `tint-at-left` |

The per-layer form exists so two tints with different placements can compose — `tint-corner tint-at-tl tint-edge tint-at-right` puts the corner at top-left and the edge at right without the universal `at-*` colliding.

`tint-corner` and `tint-edge` are **placement-required**: omitting `at-*` paints nothing. A build-time validator catches the missing modifier.

**Mark placement is not in v1.** Each mark renders at its default home (`mark-orbit` at bottom-right, `mark-chevron` at bottom-left, etc.) — the home is what the old `bg-` suffix encoded. Writing `at-*` alongside a mark is silently ignored today. The mark placement axis is a v2 follow-up.

---

## Dark mode

All treatments use `var(--accent)` from the active palette. Because `--accent` resolves via the theme's `light-dark()` token, treatments are automatically on-brand in both light and dark presentations — including per-slide `dark` modifier slides:

```markdown
<!-- _class: content mark-micro dark -->
```

No per-pattern overrides are needed.

---

## Catalogue

### Tints · Corner glows (`tint-corner` + `at-*`)

Radial ellipse anchored at one corner. 12% peak accent; fades to transparent before the content zone.

| Class | Anchor |
|---|---|
| `tint-corner at-tl` | Top-left |
| `tint-corner at-tr` | Top-right |
| `tint-corner at-bl` | Bottom-left |
| `tint-corner at-br` | Bottom-right |

### Tints · Edge washes (`tint-edge` + `at-*`)

Linear gradient from one edge. Gone before mid-slide.

| Class | Direction |
|---|---|
| `tint-edge at-top` | Down from top, 35% fade |
| `tint-edge at-bottom` | Up from bottom, 35% fade |
| `tint-edge at-left` | Right from left, 30% fade |
| `tint-edge at-right` | Left from right, 30% fade |

### Tints · Atmospheric

Full-canvas tonal effects. Center remains transparent. Placement-agnostic.

| Class | Effect |
|---|---|
| `tint-vignette` | Accent-tinted perimeter, open center |
| `tint-spotlight` | Reverse vignette — accent wash at center |
| `tint-horizon` | Heavier at top, clear from 45% — aspiration, elevation |
| `tint-ground` | Heavier at bottom, clear from 45% — conclusion, landing |

### Tints · Multi-accent

Two or more gradient layers composed. Each layer runs at ~8–9% so the total matches a single-gradient pattern. Each pattern owns its slot exclusively; cannot share that slot with another tint. Placement-agnostic.

| Class | Effect |
|---|---|
| `tint-duotone` | Opposing corner pair — top-left + bottom-right |
| `tint-frame` | All four edges at half-weight |
| `tint-sweep` | Diagonal wash at 135° — forward motion, directionality |
| `tint-ambient` | Broad off-axis tint at 7% — the lowest-key option |

### Marks

Geometric accent shapes placed in the known-empty peripheral slots. Three rendering mechanisms; see [Mark rendering](#mark-rendering) below.

| Class | Mark | Default home | Mechanism |
|---|---|---|---|
| `mark-micro` | 9 micro circles, r 2–4.5 | Top-right header band | Mask |
| `mark-ticks` | 5 horizontal ticks | Far-right margin | Box-shadow |
| `mark-orbit` | Concentric rings + satellites | Bottom-right corner | Mask |
| `mark-slashes` | 5 parallel 45° slashes | Top-right corner | Mask |
| `mark-seeds` | 12 elongated ellipses, 3 per corner | All four corners | Gradient slot |
| `mark-pills` | 4 horizontal pill shapes | Far-right margin | Box-shadow |
| `mark-asterisks` | Asterisks + micro dots | Opposing corners | Mask |
| `mark-threads` | 3 hairline diagonals (stroke 1) | Top-right corner | Mask |
| `mark-brackets` | 2 bracket marks `]` | Far-right margin | Mask |
| `mark-grid` | 4×4 dot grid | Top-right corner | Mask |
| `mark-chevron` | 3 right-pointing chevrons | Bottom-left corner | Mask |

### Reset

| Class | Effect |
|---|---|
| `treatment-none` | Clears a deck-wide treatment on this slide |

---

## Layer composability

Every tint (and `mark-seeds`) writes to one of two custom property slots, assembled by a single compositor rule:

```css
section:where([class*="tint-"], [class*="mark-"]) {
  background-image: var(--_bg-radial, none), var(--_bg-linear, none);
}
```

| Slot | Classes |
| --- | --- |
| `--_bg-radial` | `tint-corner`, `tint-vignette`, `tint-spotlight`, `tint-duotone`, `mark-seeds` |
| `--_bg-linear` | `tint-edge`, `tint-horizon`, `tint-ground`, `tint-sweep`, `tint-ambient`, `tint-frame` |

The 10 other marks own no slot — they paint via `::before` (or `::before` + box-shadow stack) and combine freely with any tint.

**Valid combinations:**

```markdown
<!-- _class: content tint-corner at-tl tint-edge at-right -->            ✓ radial + linear
<!-- _class: content tint-vignette mark-micro -->                         ✓ tint + any mark
<!-- _class: content tint-corner at-tl tint-edge at-right mark-orbit -->  ✓ two tints + mark
<!-- _class: content tint-horizon mark-seeds dark -->                     ✓ linear-tint + radial-slot mark + dark
```

**Gradient slot conflict (two radials or two linears):** the class defined later in `lattice.css` wins; the first gradient is silently dropped. Examples:

```markdown
<!-- _class: content tint-corner at-tl tint-corner at-tr -->  ✗ both radial — at-tr wins
<!-- _class: content tint-vignette mark-seeds -->             ✗ both radial — seeds wins
<!-- _class: content tint-horizon tint-ground -->             ✗ both linear — last-defined wins
```

**Two marks:** `::before` (and `::after`) are singletons — only the last-defined mark's shapes render. Avoid stacking two marks.

---

## Mark rendering

Marks use one of three mechanisms depending on geometry:

1. **Mask** (default for 8 marks). A small absolutely-positioned `::before` (and sometimes `::after`) with `mask-image: <SVG>` and a `color-mix(var(--accent), transparent)` background. The SVG defines the alpha channel; the paint colour comes from the active palette.

2. **Box-shadow** (`mark-ticks`, `mark-pills`). A `::before` sized to one shape, with multiple `box-shadow` copies offsetting it to the other positions. No mask involved.

3. **Gradient slot** (`mark-seeds`). 12 stacked radial gradients in the `--_bg-radial` slot. No mask, no `::before`.

The mask is the simplest path but is unreliable in Apple PDFKit / Skia / PDFium: rendered PDFs sometimes drop the mask entirely, leaving the bare `::before` rectangle full of paint instead of the masked shapes. Two mitigations are in play:

- **Cropped `::before` bbox.** Each mask-based mark sizes its `::before` to the shapes' bounding box, not the full slide. If the mask drops, the failure shows only that small box as a tinted patch — visible degradation rather than slide-breaking artifact.
- **Escape hatches.** `mark-ticks` and `mark-pills` repeat regular shapes that map cleanly to box-shadow copies, so the mask is removed entirely. `mark-seeds` has four-corner geometry with no small bbox, so stacked gradients in `--_bg-radial` replace the mask.

See `engineering/gotchas.md` → "Chromium PDF output of CSS mask-image renders inconsistently across viewers" for the underlying browser/PDF behaviour.

---

## Design constraints

1. **Peripheral only.** No gradient or SVG element crosses into the content zone. Safe peripheral slots:
   - Top-right band: `x > 1100, y 68–118` — header band right of text
   - Right margin: `x > 1250, y 70–640` — clear of all content
   - Bottom-right: `x > 1100, y 595–652` — above footer + pagination
   - Bottom-left: `x < 200, y 595–652`

2. **Opacity budget.** Tints cap at 12% accent. Marks paint at 28% through a mask (or equivalent ink in the box-shadow / gradient variants), so individual shapes are visible without competing with content.

3. **No hex.** Every color goes through `var(--accent)` + `color-mix()`. Palette swap = treatment colour swap automatically.

4. **Divider layout + marks.** The `divider` layout defines its own `::before` bar. Combining `divider` with a mark loses the divider bar (`::before` collision). Use tints (`tint-corner`, `tint-edge`, `tint-spotlight`, etc.) on divider slides instead.

5. **Placement-required tints.** `tint-corner` and `tint-edge` paint nothing without an `at-*` modifier. A build-time validator catches the missing modifier.
