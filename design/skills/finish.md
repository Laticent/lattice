# Skill — Create a finish

> Author a new `finish:` backdrop — a z-stack of up to four palette-blind CSS
> layers painted behind slide content — that reads as boardroom atmosphere, not
> decoration, and survives PDF export clean.

**Read this when** you are asked to create a new deck backdrop, texture, or
"surface" treatment. **You'll produce** one row in the finish register plus a
preset CSS block; authors then select it with `finish: <name>` in front matter.

---

## The 10/10 bar

A finish is **atmosphere behind the words**, not ornament on top of them. A 10/10
finish:

- Keeps accent alpha **low (~5–16%)** so text-on-background AA contrast survives
  with no scrim.
- Provides **both faces**: a RICH screen face (gradients that fade to transparent)
  and an OPAQUE export face (every full-bleed fade ends on `var(--bg)`, patterns
  are hard-stop opaque lines) — with **identical layer counts**.
- Is **palette-blind**: every color is `color-mix()` of `var(--accent)` /
  `var(--bg)` / `var(--ink)`. A theme swap or `dark` recolors it automatically.
- Has a **point of view** — a signature layer type (a mesh, a lattice, a pinstripe,
  a frame) — not just "a gradient wash of the accent the theme already paints."

Bad looks like: a loud accent cloud that fights the text; a full-bleed fade that
ends on transparent (→ muddy gray PDF cloud); a `url()` or `mask-image` (export-
breaking); a baked-in monogram on a deck-wide finish; two `finish-*` presets on one
slide.

---

## Mental model — the layer stack

A finish paints on a `.backdrop` wrapper that the engine injects as the first child
of every finish section. The compositor blends up to **four backdrop layers**
beneath the content, bottom to top:

| z | Layer | Slot | Examples |
|---|---|---|---|
| z1 | **wash** — ambient color field | `--fin-wash` | corner-glow, duotone, spotlight, mesh |
| z2 | **texture** — a pattern | `--fin-texture` | grid, dots, hatch, contour, pinstripe, lattice |
| z3 | **mark** — a placed emblem (`.backdrop::before`) | `--fin-mark` | monogram, rings, tick, ghost numeral |
| z4 | **edge** — vignette / frame | `--fin-edge` / `--fin-frame` | vignette, fold, margin rule, keyline |
| z5 | content | — | painted above every layer, untouched |

The wash and texture ride the `.backdrop`'s `background-image`; the mark rides
`.backdrop::before`; the vignette rides `.backdrop::after`, but a full keyline
**frame** must be stacked inset box-shadows via `--fin-frame` — the *section*'s
`::after` is reserved for the pagination marker (see the skeleton).

The **`finish:` value maps to CSS classes** (`finish finish-<name>`) appended to
every `<section>`. The base `finish` class is the compositor; each `finish-<name>`
sets the per-role custom properties the compositor blends. Unset slots default to
no-ops, so a preset declares only what it uses.

**`finish:` is only the backdrop.** The sibling register `mode:`
(`boardroom`/`sketch`/`sketch-clean`) is the *typographic hand* — a separate axis
that composes freely (`mode: sketch` + `finish: atrium`). Don't conflate them.

**The RICH/OPAQUE dual is the load-bearing constraint.** Chromium's print-to-PDF
encodes large alpha-fading gradients toward transparent-black → a muddy gray cloud.
So every full-bleed fade needs an OPAQUE mirror that ends on `var(--bg)` (accent
mixed *into* bg, never into transparent); patterns become uniform 1px opaque lines
with transparent gaps. A shared "opaque flip" re-points every slot to its `-opaque`
mirror under `@media print` and `.lattice-exporting` — you only supply the mirror
values, and both faces must keep the **same layer count**.

---

## Where it lives

- **The register** (source of truth): `FINISH_REGISTER` in
  `lib/core/resolve-finish.js` — one row per finish. Adding a row automatically
  extends the lint vocabulary and the picker guard.
- **The CSS**: `lib/base/base.finish.css` — the compositor + every preset body +
  the opaque flip + the per-slide `finish-none` opt-out.
- **The sibling `mode:`**: `lib/core/resolve-mode.js` + `lib/base/base.sketch.css`.
- **Studio display metadata**: `docs/src/components/studio/finish-catalog.ts` (must
  stay in step with the register or a rot-guard test fails); optional generator
  recipe in `finish-generate.ts`.
- **Ships today (11 values)**: `none` (baseline), `atrium`, `meridian`, `strata`,
  `halo`, `ledger`, `nimbus`, `loom`, `savile`, `gallery`, `canopy`.
- **The closed layer vocabulary** (what the generator/AI may speak): WASH = none /
  corner-glow / duotone / spotlight / bands / mesh; TEXTURE = none / grid / dots /
  hatch / contour / rings / ruled / pinstripe / lattice; MARK = none / monogram /
  tick / bar / numeral; EDGE = none / vignette / margin-rule / fold / frame.

---

## Recipe

1. **Register the name** — add one row to `FINISH_REGISTER`:
   `myfinish: 'finish finish-myfinish',`.
2. **Write the preset CSS** in `base.finish.css` as `section.finish-myfinish { … }`.
   Declare **all four slot families** (unused = `none`, so it never inherits a
   sibling's stray layer). For each layer you use, write both the RICH default
   (`--fin-wash: …` fading toward transparent) and the `--fin-*-opaque` mirror
   (ending on `var(--bg)`, hard stops), plus matching `--fin-size` / `--fin-position`
   / `--fin-repeat` — one entry per background layer, in compositor order (texture
   first, then wash).
3. **Keep it palette-blind**: every color is `color-mix(in srgb, var(--accent) N%,
   transparent | var(--bg))` or `var(--ink)`. No hex, no `url()`, no `mask-image`,
   no `margin`.
4. **Default glyph marks to empty** — `--fin-mark-text: ""`. A deck-wide finish
   paints no monogram/numeral until the author personalizes it per slide.
5. **Add Studio metadata** in `finish-catalog.ts` (label, blurb, group, nature,
   zone, swatch) so the rot-guard passes.
6. **Ship a demo deck** in `examples/` + committed PDF; update CHANGELOG + the
   canonical doc.
7. **Export sign-off** through **both** engines (CLI vector PDF *and* Studio
   html-to-image raster), in **dark and light**. A finish alters exported bytes, so
   this is a mandatory human sign-off (Quality Bar).

---

## The contract / skeleton

```css
/* base.finish.css */
section.finish-myfinish {
  /* wash (z1) — RICH default fades to transparent … */
  --fin-wash: radial-gradient(120% 90% at 12% 8%,
                color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%);
  /* … and the OPAQUE mirror ends on var(--bg) */
  --fin-wash-opaque: radial-gradient(120% 90% at 12% 8%,
                color-mix(in srgb, var(--accent) 12%, var(--bg)), var(--bg) 60%);

  /* texture (z2) — hard-stop lines, transparent gaps in both faces */
  --fin-texture: repeating-linear-gradient(0deg,
                color-mix(in srgb, var(--ink) 6%, transparent) 0 1px, transparent 1px 28px);
  --fin-texture-opaque: repeating-linear-gradient(0deg,
                color-mix(in srgb, var(--ink) 6%, var(--bg)) 0 1px, transparent 1px 28px);

  /* mark (z3) — empty by default; author opts in per slide */
  --fin-mark-text: "";

  /* edge (z4) — a full frame is stacked inset box-shadows (::after is reserved) */
  --fin-frame: none;

  /* compositor bookkeeping — one entry per background layer, texture then wash */
  --fin-size: auto, auto;  --fin-position: center, 12% 8%;  --fin-repeat: repeat, no-repeat;
}
```

The author selects it deck-wide (`finish: myfinish`) or per slide
(`<!-- _class: finish-myfinish -->`), personalizes the mark
(`section.finish-myfinish { --fin-mark-text: "Q3"; }`), and opts a busy slide out
with `<!-- _class: finish-none -->`.

---

## What good looks like

- `atrium`: a faint corner glow + a fine dissolving grid + a left margin rule — you
  barely notice it, which is the point.
- A finish with a **signature layer** — `loom`'s woven ±45° lattice, `savile`'s
  tailored pinstripe, `gallery`'s museum keyline frame — so it has identity beyond
  "accent wash."
- Every full-bleed layer opaque-mirrored; the PDF looks identical to the screen,
  clean, no gray cloud.
- Titles and dense chart slides opt out with `finish-none`.

---

## What bad looks like

- Accent at 40% alpha — the backdrop competes with the text.
- A radial wash ending on `transparent` with no opaque mirror → muddy gray in the
  exported PDF.
- `background-image: url(paper.png)` or a `mask-image` — export-breaking and an
  exfiltration surface; use CSS gradients only.
- A baked `--fin-mark-text: "ACME"` on a deck-wide finish.
- Two `finish-*` classes on one slide — only one renders; the linter flags it.
- A frame drawn on `section::after` — that's reserved for the pagination marker;
  use stacked inset box-shadows via `--fin-frame`.

---

## Ship checklist

- [ ] One row added to `FINISH_REGISTER`.
- [ ] Preset declares all four slot families; every full-bleed layer has a RICH and
      an `-opaque` mirror with **matching layer counts**.
- [ ] Palette-blind: `color-mix()` of `var(--accent/--bg/--ink)` only; no hex,
      `url()`, `mask-image`, or `margin`.
- [ ] Glyph mark defaults to empty.
- [ ] `finish-catalog.ts` metadata added (rot-guard green).
- [ ] Demo deck + PDF; CHANGELOG + canonical doc updated.
- [ ] **Export sign-off**: rendered in both export engines, dark + light, and shown
      for human approval.

---

## Common mistakes

1. **Fade ending on `transparent`** in the opaque face → gray PDF cloud.
2. **Accent alpha too high** → breaks content contrast.
3. **`url()` / `mask-image` / hex / `margin`** anywhere in the preset.
4. **Baked-in monogram** on a deck-wide finish.
5. **Mismatched layer counts** between RICH and OPAQUE faces (breaks the shared
   size/position/repeat bookkeeping).
6. **Two finishes on one slide.**
7. **Skipping the dual-engine export sign-off** — a finish changes exported bytes.

---

## Canonical sources

- `lib/core/resolve-finish.js` — the register, readers, class mapping (where you
  add a finish).
- `lib/base/base.finish.css` — the compositor, all preset bodies, the opaque flip.
- `lib/core/resolve-mode.js` + `lib/base/base.sketch.css` — the sibling `mode:`
  register.
- `lib/base/base.docs.md` §`finish:` — the author-facing reference.
- `engineering/decisions/2026-06-30-finish-the-surface-layer.md` — the founding
  design (nature × zone, the stacked-layer model, invariants).
- `engineering/decisions/2026-07-01-finish-restraint-controls.md` — strength /
  clearance controls.
- `examples/finish-backdrops.md` — the demo deck (all presets + a custom finish).
- `docs/src/components/studio/finish-catalog.ts` / `finish-generate.ts` — Studio
  metadata + the fabricate recipe.
