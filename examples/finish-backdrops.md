---
marp: true
theme: indaco
finish: atrium
paginate: true
header: "Lattice · finishes"
logo: ../lib/base/_logo/acme-logo.svg
logo-on: title
logo-x: 50
logo-y: 82
logo-scale: 1.0
---

<!-- A glyph-mark (monogram / numeral) is ALWAYS author-personalized — it NEVER
     appears in a finish by default (a deck-wide `finish:` paints no glyph). To
     SHOWCASE the movable mark, this demo sets an explicit glyph on the three
     slides that carry a mark-bearing finish, scoped to each finish class. Remove
     these and the marks vanish — proving the clean no-glyph default. -->

<style>
section.finish-meridian { --fin-mark-text: "Q3"; }
section.finish-savile   { --fin-mark-text: "AB"; }
section.finish-gallery  { --fin-mark-text: "04"; }

/* A TUNED custom finish, exported verbatim from the Finish Studio — a big tilted
   ghost numeral + a spotlight hotspot pulled to the lower-left. This is exactly
   what the Studio's Export button emits (rich screen face + opaque export face). */
section.finish.finish-signal {
  --fin-wash:radial-gradient(108% 95% at 26% 74%, color-mix(in srgb, var(--accent) 11%, transparent) 0%, transparent 60%);
  --fin-texture:none;
  --fin-size:auto, cover;
  --fin-repeat:no-repeat, no-repeat;
  --fin-mark:none;
  --fin-mark-text:"Q3";
  --fin-mark-color:color-mix(in srgb, var(--accent) 9%, var(--bg));
  --fin-mark-fs:50cqi;
  --fin-mark-align:center;
  --fin-mark-justify:center;
  --fin-mark-pad:0;
  --fin-mark-transform:translate(16%, -10%) rotate(-8deg);
  --fin-edge:none;
}
@media print {
  section.finish.finish-signal {
  --fin-wash:radial-gradient(108% 95% at 26% 74%, color-mix(in srgb, var(--accent) 8%, var(--bg)) 0%, var(--bg) 60%);
  --fin-texture:none;
  --fin-edge:none;
  }
}
:where(.lattice-exporting) section.finish.finish-signal,
section.finish.finish-signal.lattice-exporting {
  --fin-wash:radial-gradient(108% 95% at 26% 74%, color-mix(in srgb, var(--accent) 8%, var(--bg)) 0%, var(--bg) 60%);
  --fin-texture:none;
  --fin-edge:none;
}
</style>

<!-- _class: title silent finish-none -->

`Feature demo · finishes`

# A finish is a stack of layers.

A *finish* is the surface of a deck — the wax-and-polish layer over its
structure and palette. Each preset composites up to four palette-blind layers
behind your content: a **wash**, a **texture**, a **mark**, and an **edge**. Set
`finish: atrium` once and every slide wears the same composition. This title
opts out with `finish-none`.

---

## The finish is a register, not per-slide markup.

`finish:` names the whole-deck surface in one token — orthogonal to `theme:`,
which still owns the palette. The engine reads it once and paints the layered
finish behind every slide, so you never repeat a class.

- Layered
  - A finish stacks `wash + texture + mark + edge` by z-index — layers combine, never replace.
- Palette-blind
  - Every layer is `color-mix()` of the theme accent — swap the theme and it
    recolors itself.
- Export-safe
  - Pure CSS gradients (never masks); every fade is opaque-to-opaque, so they
    survive the PDF and PPTX with no muddy gray.

---

<!-- _class: finish finish-meridian -->

## Meridian — duotone, contours, a ghost numeral.

This slide overrides the deck with `_class: finish finish-meridian`. A diagonal
duotone wash carries faint contour lines. The ghost numeral is **author-set** —
this slide opts in with its own `Q3`; by default a finish paints no glyph at all.

---

<!-- _class: finish finish-strata list-tabular -->

## Strata — bands, a dot-matrix, a corner tick.

- Wash
  - Soft horizontal bands with a bold accent hairline pinned to the top edge.
- Texture
  - A fine 26px dot-matrix, even and faint across the slide.
- Mark
  - A corner registration tick in the top-right.

---

<!-- _class: finish finish-halo -->

## Halo — a spotlight section treatment.

A centered spotlight, concentric rings, and a whisper of a vignette frame the
slide — the bookend finish for a section or closing, on a clean light canvas with
dark, legible text. Set per-slide with `_class: finish finish-halo`.

---

<!-- _class: finish finish-ledger -->

## Ledger — ruled lines, a margin bar, a fold.

This slide carries `_class: finish finish-ledger`: fine horizontal ruled lines, a
bold accent bar down the left margin, and a top-right corner fold — a board-memo
surface. The deck-wide Atrium finish is replaced for this one slide.

---

<!-- _class: finish finish-nimbus -->

## Nimbus — a gradient mesh of soft blooms.

A new `mesh` wash floats three or four soft accent blooms across the slide — an
organic gradient-mesh atmosphere with no pattern at all, seated by a whisper of
a vignette. The wash intensity tunes how strong the blooms read. Pure premium
air, set per-slide with `_class: finish finish-nimbus`.

---

<!-- _class: finish finish-loom list-tabular -->

## Loom — a woven lattice, a movable glow.

- Texture
  - A new `lattice` cross-hatch — two diagonal weaves at ±45° — on-brand for the
    product, with the weave pitch tunable by scale.
- Wash
  - A corner glow, here moved to the top-left to show the placement axis at work.
- Tunable
  - Move the glow, change the weave scale, and the whole surface re-tailors.

---

<!-- _class: finish finish-savile -->

## Savile — a tailored pinstripe, a placed monogram.

A new `pinstripe` texture rules fine vertical lines — Savile Row on a slide —
with the pitch tuned by scale. The monogram is **author-set** — this slide opts
in with its own `AB` initials; an unset finish shows no monogram. Editorial and
tailored, set with `_class: finish finish-savile`.

---

<!-- _class: finish finish-gallery -->

## Gallery — a museum keyline frame.

A new `frame` edge draws a thin inset keyline border — no soft shadow, just four
crisp accent strips — around a centered spotlight. The plate numeral is
**author-set** — this slide opts in with its own `04`; by default the frame
carries no glyph. Museum framing, set per-slide with `_class: finish
finish-gallery`.

---

<!-- _class: finish finish-signal -->

## Marks are sized, moved, and tilted — not stamped in a corner.

Every glyph-mark now carries its own **size**, **position**, and **tilt**. The
`Q3` ghost here is dialed large, nudged off-center, and tilted; drop the size
and it becomes a discreet corner emblem. Single-source washes (corner-glow,
spotlight) gain a **movable hotspot** and a **spread** — this one's pulled to the
lower-left. Exported verbatim from the Finish Studio.

---

<!-- _class: title silent finish-none -->

`brand · placed, not stamped`

# The brand mark moves too.

The deck logo is placed with `logo-x` `logo-y` `logo-scale` — the same
place-and-size model as a finish mark. This deck seats it along the
bottom of every title, enlarged; flip the numbers and the mark lands anywhere,
at any size, identically in the live preview and the baked PDF.

---

<!-- _class: agenda progress-2 -->

## How the finish is wired.

1. Front matter declares `finish: atrium` `once`
2. The engine appends `finish finish-atrium` `every slide`
3. The compositor blends the layer props `behind content`
4. A slide overrides with `_class: finish finish-<name>` `per-slide`
5. A slide opts out with `finish-none` `clean`

---

<!-- _class: finish-none silent -->

## Pick it in the Studio.

The Studio's Inspector has a **Finish** field — swatch-previewed, grouped Plain
and Finishes — that writes this `finish:` register for you, with the live preview
updating as you choose. This slide is clean (`finish-none`), so you see the
deck's default Atrium finish nowhere here.

---

<!-- _class: title silent finish-none -->

`one line to re-surface the room`

# Change the finish, keep the content.

Flip `finish:` to `halo`, `ledger`, or `boardroom` and the same Markdown ships
with a new surface — no edits to a single slide.
