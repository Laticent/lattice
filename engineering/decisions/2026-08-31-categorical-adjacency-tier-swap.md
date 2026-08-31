---
status: shipped
summary: >
  #1864 reports the categorical fill ramp at ΔE 0.013 against a 0.15 floor and reads it as the
  ramp failing. The number is right and the token is wrong: the two categorical tiers SWAP by
  canvas — the mark carries the chroma on a light ground, the fill carries it on a dark one — so
  a gate naming a token measures the wash in one mode and the code in the other. On indaco the
  fill reads 0.013 and the mark reads 0.1549, a factor of twelve. `2026-07-15-categorical-token-
  contract.md` §5 already specified the right gate six weeks earlier (saturated tier, adjacent
  among the first 6, calibrated to indaco+cuoio rather than a constant); this implements it, with
  the tier derived by chroma instead of named. BOTH tiers are gated, because the Mermaid pie
  paints the wash with no per-slot stroke and so has no second channel. "12 slots at 0.15 is
  unreachable" was measured FALSE — sRGB packs 25, the fill's own contract still allows 15, and
  what binds is an unstated chroma ceiling that leaves the ramp about 4x below its own restraint.
---

# The categorical tiers swap by canvas, so #1864 measured the wash

**2026-08-31 · issue #1864, and `2026-07-15-categorical-token-contract.md` §5**

## What #1864 says, and the one thing it gets wrong

> The 12-slot categorical fill ramp does not function as a discrimination channel — not under
> colour-vision deficiency, and not under normal vision either. Adjacent `--cat-N-fill` pairs
> measure ΔE 0.013 on `indaco` against the project's own 0.15 separability floor.

The measurement reproduces exactly. What it names is `--cat-N-fill` on a **light** canvas, and on
a light canvas that token is the pale wash — not the tier carrying the category.

**The two tiers swap by canvas, and nothing in the docs said so.** Measured across the catalog as
chroma maxima and lightness midpoints:

| tier | canvas | chroma max (median) | L mid (median) | role |
|---|---|---|---|---|
| `--cat-N-mark` | light | 0.150 | 0.450 | saturated |
| `--cat-N-fill` | light | 0.056 | 0.862 | wash |
| `--cat-N-fill` | dark | 0.243 | 0.440 | **saturated** |
| `--cat-N-mark` | dark | 0.053 | 0.869 | **wash** |

The flip is correct and deliberate — on a dark ground the roles have to swap or one tier is
invisible against it, the same reason `design/theming.md` gives for the `--cat-on-*` inks
flipping. The consequence is that **any gate naming a token measures the wash in one mode and the
code in the other**, and the error is not small:

| | `--cat-N-fill` | `--cat-N-mark` |
|---|---|---|
| indaco (light) | **0.0130** ← #1864's number | 0.1549 |
| indaco-dark | 0.1050 | 0.0335 |

A factor of twelve, and the difference between "the ramp is broken" and "the ramp is the
healthiest in the catalog". So the gate derives the tier per theme, **by chroma**, and never
names it.

## The gate was already specified — this implements it

`engineering/decisions/2026-07-15-categorical-token-contract.md` §5, written six weeks before
#1864 was filed:

> Measure on the saturated tier (the hue / mark), never the pale fill. … pick the threshold as
> (minimum adjacent distinctness that `indaco` + `cuoio` already pass) minus a small margin …
> Check adjacent slots among the first N (chart-family checks the first 6; past ~6 categories
> perceptual distinction collapses anyway — Wong 2011) … Run over every base theme.

`test/unit/palette/cat-adjacency-floor.test.js` is that spec, with one correction: §5 says "the
hue / mark", and per the table above that is only true on a light canvas.

No margin is subtracted from the reference minimum. The references are themselves the best rows in
the table, and a margin would only excuse the fifth.

**Derived floors, from the references, per tier:**

| tier | floor | set by |
|---|---|---|
| saturated | **0.1050** | `indaco-dark` (fill) |
| wash | **0.0295** | `cuoio-dark` (mark) |

## Why the WASH tier is gated too

The natural reading — the wash is a quiet surface a label sits on, while the saturated tier
carries identity beside it — is true on most surfaces and **false on the ones that matter most for
this issue**:

- **The Mermaid pie.** `lib/integrations/mermaid/mermaid.css` paints all twelve wedges from
  `var(--cat-N-texture, var(--cat-N-fill))` with `!important` and declares **no stroke**. The
  separator is Mermaid's own white spacer; the single `--diagram-stroke` on the diagram is the
  outer ring. There is no per-slot mark on screen at all, so the wash is the entire discrimination
  channel — for twelve categories, on a documented supported diagram type. On `indaco`, 12 of 66
  legend↔wedge pairs sit under ΔE 0.035; the worst are `#D1C5DC` vs `#D9C7DC` at **0.0130** and
  `#E7BEBE` vs `#E6C1C8` at **0.0132**. Those wedges are the same color in the render.
- **`list-steps` categorical badges** — `background: var(--cat-N-fill)` on a `border-radius:999px`
  pseudo-element with no border. Its own docblock records that the badge ink was moved *off*
  `--cat-N-mark` because it failed AA on the fill, which is to say the mark was deliberately
  removed from that surface.

So #1864's underlying worry is right, on the surfaces it is right about. What it needed was the
tier split, not a repair of the whole ramp.

## "Unreachable" was measured false, and this matters more than the gate

An earlier draft of this note was going to record that twelve slots at ΔE 0.15 is unreachable —
`tools/cvd-audit.js` already carries the arithmetic (12 × 0.15 = 1.65 of range where L spans 0..1)
and 0 of 33 palettes reach it. **That reasoning is sound for MONOCHROMACY, where only lightness
survives, and false for normal vision, where three axes do.** Greedy packing of sRGB in OKLab:

| constraint | max mutually distinct at ΔE ≥ 0.15 |
|---|---|
| sRGB, unconstrained | **25** |
| holding ≥4.5:1 against `--cat-on-fill` (the fill's own gated contract) | **15** |
| holding ≥3:1 vs `--bg` and ≥4.5:1 vs `--cat-on-mark` (the mark's) | **14** |
| + inside indaco's shipped wash band (≤1.68:1 vs `--bg`) | 5 |
| + indaco's shipped chroma ceiling (C ≤ 0.056) | 1 |

What binds is the last row — **an unstated chroma ceiling**, not the gamut and not the contract.
Inside indaco's own wash band at that ceiling there is room for **15 slots at ΔE 0.05 and 7 at
0.075**, against a shipped minimum of 0.0130. The ramp is roughly **4x below what its own
restraint permits**.

That is the durable finding. A note saying "unreachable" would have stopped the next person
looking; the number to carry forward is the deficit and its cause.

## What this ships, and what it deliberately does not

**Ships:** the gate, both tiers, frozen per palette, reference-calibrated, with **75 adjacent
readings below their tier's floor** pinned as a count that fails when it rises *and* when it falls
— so an improvement has to be written down rather than absorbed. Every failure message prints the
floor and the deficit, because a green run here means "no worse than before" and never "good
enough". Worst deficits today:

| palette | pair | tier | reading | short by |
|---|---|---|---|---|
| ardesia-dark | 4^5 | saturated | 0.0298 | 0.0752 |
| ardesia | 4^5 | saturated | 0.0379 | 0.0671 |
| crepuscolo-dark | 4^5 | saturated | 0.0432 | 0.0618 |

**Does not ship:** the palette re-tune. That is a size call and not a gate call — CLAUDE.md's
export sign-off is scoped to changes that alter the *bytes of an exported artifact* (the PDF /
PPTX / HTML pipeline, font embedding) and explicitly excludes CSS that merely looks different, so
no human gate blocks it. What blocks it is that re-tuning the ramps of a dozen palettes and
rebuilding their galleries is a diff of a different size and shape from the instrument that
measures them, and the instrument has to exist first for the re-tune to be checkable at all. The
target is in the table above.

## `concrete` is exempt on a technicality, and the technicality should not be laundered

§6 of the contract doc puts `ardesia`, `onyx` and `concrete` in one bucket: *"give them the
`a11y-achromatopsia` treatment (luminance-spread ramp + textures) so the monochrome identity
survives with distinctness."*

- `onyx` and `a11y-base` ship the ramp — twelve evenly spaced grays, `#e8e8e8` … `#868686`,
  adjacent **0.0276**, which is better fill separability than every brand palette in the tree.
- `ardesia` got twelve pastel hues instead (0.0301).
- `concrete` ships twelve grays differing by ±2 in one channel — `#dfdddd`, `#dddfde`, `#dddedf`
  … — adjacent **0.0013**. It got the textures without the ramp.

`concrete` is exempt from the hue floor in the gate because it really does carry a texture
channel, not because 0.0013 is a design. Naming that here is the point; the fix is §6's ramp.

## Off-path findings, logged not fixed (HARD RULE #18)

Found while measuring, outside this change's path:

1. **The Mermaid pie legend swatch cannot be textured.** Mermaid writes the resolved flat fill
   inline (`<rect style="fill: rgb(223,221,221); …">`), which beats the stylesheet, and no
   `.legend rect` rule exists. So on `concrete` the wedges carry twelve distinct patterns and all
   twelve legend swatches are the same gray — the key is unreadable. The tree already solved this
   for the **native** `piechart` (`themes/a11y-base.css` textures `.chart-key-swatch[data-cat]`,
   "so the key matches by pattern, not just value") and never for the Mermaid one.
2. **`--cat-N-texture` is an SVG paint server** (`url(#…)`), so it cannot reach a DOM consumer. It
   cannot rescue `list-steps` badges or any CSS `background`. "Texture is the remedy past hue
   capacity" is true only inside SVG.
3. **`--print-cat-1..12-fill`** (`lib/base/base.tokens.css`) is twelve grays at min pairwise
   **0.0122**, textured only inside SVG under `section.print`.
4. **Nothing measured curated `--cat-N-fill` inter-slot distance** before this change, through a
   circular delegation: `cvd-audit` excludes pale-fill pairs because "contrast-audit covers normal
   distinctness"; `contrast-audit` says the curated slots are "NOT re-audited here" and points at
   `checkCatContrast`, whose only distance floors are fill-vs-mark within one slot.

## Verification

The thesis this note replaces was put to a red team and a Munger inversion (HARD RULE #25, tier 2)
before anything was written. Three of its six points broke — including "the mark is the code"
(the mark has the same capacity as the fill at 12 slots), "12 at 0.15 is unreachable", and
"`concrete` is near-zero by design". The tier swap was found independently by both. The gate was
then mutation-proved: collapsing `ardesia`'s slot 5 onto slot 4 fails three clauses, and
collapsing a *reference* palette's slot fails the pinned floor and the deficit count together.

Rendered and looked at (HARD RULE #23), light mode, real export path: a 12-slice and a 6-slice
Mermaid pie and a `journey` on `indaco`, `burgundy-dark` and `ardesia-dark`. The `journey` on
`burgundy-dark` is the clearest instance of the defect — four section bands whose bodies are the
same maroon, separated only by a hairline top rule. **Dark-mode Mermaid was not rendered**, and
given the tier swap that is where the failure mode may invert; marked UNVERIFIED.
