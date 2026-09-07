# Where colour is spent, and what a finish owns

**Status:** settled direction, from the review of `scoring.md`. Corrects four
rules in `finishes.spec.js`'s FLOOR and restructures the three finishes.
Read `colour-brief.md` first — the principle there is unchanged; this says
where it applies.

---

## 1. A finish retreats a fill only where the fill is not the sole carrier

`etching` hollows a scatter dot and leaves a quadrant dot solid. That looked
inconsistent. It is not — but it was an accident, and the accident hid a rule
worth having.

The accident: `.quadrant-dot` carries `data-cell`, not `data-cat`, so the rule
missed it (`scoring.md`). The rule it should have obeyed anyway:

| | what the fill carries | may a finish retreat it? |
|---|---|---|
| `.scatter-dot` | nothing — every dot is `data-cat="0"`, and the transform says why: *"a scatter's encoding is position, not hue"* | **yes** |
| `.quadrant-dot` | `fill: var(--cell-ink)` — WHICH QUADRANT the item landed in. Its label is `--quadrant-label-ink`, a neutral, so no other element carries the cell | **no** |

> **A finish may move a mark's identity out of its body only when the body is
> not the sole carrier of a channel.** Where the fill *is* the channel, the
> body holds at full strength under every finish, and the finish expresses
> itself on that member through its edge and its ground instead.

This is one rule, checkable per member, and it generalises: `progress` and
`gantt` colour by status, `map` by magnitude. None of those may go hollow
either. It also means the three finishes are *not* required to differ on every
member — they are required to differ **wherever the fill is free**, and to say
which members those are.

## 2. Singular does not mean "own hue" — it means "may own one, if hue carries"

A scatter's points are singulars and they do not get six colours.

`colour-brief.md` says *a group shares one hue; a singular may own one*. **May**
is doing the work, and the qualifier is: **only when hue is the channel that
distinguishes them.** In a scatter it is not — position distinguishes them, and
a direct label names them (census: `scatter → direct-labels`). Six hues would
spend the palette on a channel carrying nothing, and would assert a grouping
the data does not have.

What a scatter's one hue *should* do is reach its direct labels, so the label
and its dot read as one object. That is rule 3.

If a scatter ever gains a series dimension, hue becomes the group channel and
the rule flips itself — no per-member exception needed.

## 3. Colour goes to the join, once

A legend swatch and a coloured legend label are two copies of the same fact,
and the second copy is the one at the worse contrast. The census already splits
the family by how it names a category, and that split is the rule:

| member's key | who wears the hue | members |
|---|---|---|
| **legend rail** — a swatch sits next to the label | the **swatch**. Label stays `--text-body` | gantt, journey, map, matrix-grid, piechart, radar, roadmap, state-chart |
| **direct labels** — no swatch; the label *is* the key | the **label** | line, scatter, slope, stacked-bar |
| **no key** — every name sits on or beside its own mark | nobody; adjacency already joins them | bar, bullet, funnel, quadrant, progress, timeline-list, waterfall, kanban, word-cloud |

> **A hue appears once per link between a name and its mark** — in the swatch
> if there is one, in the letterform if there is not, and nowhere at all when
> the name is already touching the thing it names.

`finishes.spec.js`'s FLOOR painted `.chart-key-label` in category ink for every
member. On the eight legend-rail members that is the redundant copy. It is
wrong and it comes out.

## 4. The spend is ranked, and it stops at two rungs

Not "colour everything that is owned". **Colour what the reader would otherwise
have to search for.** Adjacency is free; search is what costs.

1. **The mark.** Always, under every finish.
2. **The one join**, per rule 3 — and only when the name is not adjacent to its
   mark.
3. **Nothing else.**

Neutral under every finish, without exception: axes, gridlines, plot bounds,
tick labels, axis titles, a value printed inside or immediately beside its own
mark, a category label under its own bar. An axis is owned by no group (that
part of the FLOOR was right). A tick label is owned by the axis, not by a mark.

This retires `etching`'s move of `.cart-value` and `.cart-cat` to category ink:
those sit against their own marks, so the colour buys nothing and spends a
4.5:1 budget to buy it.

## 5. Two contrast floors, by role — and a finish never moves a token across them

The tree already carries this and it is stricter than a single 4:1 line, in the
direction that matters. `lib/tokens/contracts.js`:

- **`TEXT_FLOOR = 4.5`** — WCAG 1.4.3 AA normal text. The floor an `-ink` /
  `-fg` / `text-*` value clears.
- **`GRAPHICAL_FLOOR = 3`** — WCAG 1.4.11 non-text contrast. The floor a
  `-mark` / `-border` / `-stroke` clears.

`lib/theme/cat-ink.js` solves `--chart-cat-N-ink` to **4.65:1**, a deliberate
0.15 margin so a later regeneration cannot land under 4.5.

A single 4:1 floor would be worse at both ends: it fails AA for text, and it
over-constrains a mark, which cannot hold the palette's chroma at 4:1. **The
answer is not one number — it is that every element declares which role it
plays, and a finish may not silently move an element from one role to the
other.**

Two consequences a finish must obey:

- **Mark depth and on-mark ink are coupled.** `--cat-on-mark` is solved against
  a mark at full strength. A finish that drops the body to 30% has invalidated
  it. The settled register system already answers this: **MARK** (bare mark,
  full strength) is where a finish varies depth; **BACKDROP** (text-bearing,
  quiet) is pinned by the register and a finish does not touch it. Measured
  earlier: text on the 82% mark fails AA in 117 of 224 theme × mode × slot
  combinations, against 0 and 1 for the two quiet levels. The register is the
  guard; the finish is not allowed to be.
- **Every element a finish repaints declares its floor,** so the existing
  contrast tooling can check a finish the way it checks a theme. A finish that
  cannot be measured against these two floors is not shippable.

## 6. A finish owns how the MARK is drawn. The frame is its own register.

Today `ground` owns the figure frame, `etching` owns the doubled edge, and
`pigment` owns nothing distinctive. Three finishes each hoarding one attribute
is not a system, and it is why `ground` measured as distinguishable on 21 of 21
while changing nothing about how a chart is drawn (`scoring.md`).

**Split the axes.**

**`charts:` — the finish. Owns the mark body, and sets every other knob rather
than hoarding one.**

| | the body | the edge (derived, not chosen) | the mark's ground |
|---|---|---|---|
| `pigment` | full strength | single weight | none |
| `etching` | retreats to a whisper | doubled — the boundary now carries identity | none |
| `ground` | mid strength | single weight | **each mark sits in its own drawn track** |

Edge weight is a *consequence* of body depth, not an independent knob: when the
body retreats, the boundary has to carry more. Deriving it is what keeps the
three coherent and stops an author assembling an incoherent combination.

`ground`'s real story is the **per-group track** — a bar's headroom, a funnel's
intake, the denominator made visible. `bullet`, `progress` and `quadrant`
already draw one; `ground` generalises it. That is a statement about the mark,
so it belongs to a finish. The figure frame never was.

**`frame:` — the container. Orthogonal, available under all three.**

`none` (default) · `ground` (the figure declares its own tinted ground) ·
`ruled` (ground plus a border)

This is the export and visual-distinction feature asked for directly, it is a
slide-composition decision like the existing `rule:` and `corners:` registers,
and no finish has a monopoly on it. Each finish declares a sensible default;
an author overrides per deck or per slide.

**Both still gate on the same rule:** a register offers pre-canned choices that
cannot be combined incoherently. Two registers with three and three values are
nine combinations, all of which have to look deliberate — which is exactly why
the edge is derived rather than exposed.

---

## What changes in the spec

1. FLOOR drops `.chart-key-label` recolouring on the eight legend-rail members;
   swatches already carry the hue.
2. FLOOR keeps direct-label recolouring (line, scatter, slope, stacked-bar) —
   that is the join, and three of the four already did it correctly.
3. `etching` drops `.cart-value` / `.cart-cat` recolouring entirely, which also
   retires the F4 emitter-contract dependency that was blocking it.
4. `etching` gains a fill-carries-a-channel exclusion list, derived from the
   slot contract rather than hand-written per member.
5. `ground` loses `.chart-body` to the new `frame:` register and gains its
   per-group track, which is the part that was never built.
6. Every finish declares, per element it repaints, whether that element is text
   (4.5) or graphical (3), so a finish is checkable by the existing contrast
   tooling.

All six sit downstream of the slot contract in `scoring.md`. None is buildable
until a mark can be addressed on every member.
