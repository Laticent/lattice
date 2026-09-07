# Colour carries context — the correction, and the brief for three finishes

**Status:** brief. Supersedes the four-finish sketch in `taxonomy.md` § Who decides
and corrects two errors in `finishes.spec.js`.

---

## What went wrong, stated plainly

**1. Colour was stripped where it should have been MOVED.** `matrix-grid` spent six
categorical hues on its row labels — the axis a reader decides least from. The rule
says move the colour to the deciding axis. The implementation neutralised the rows
and left the chart poorer than it started: a filled cell and an empty one
distinguishable only by their text. A correction that removes information is not a
correction.

**2. The chrome ladder pointed the wrong way.** It resolved labels, ticks and axis
titles toward neutral greys "so no chrome rung is louder than the mark." That is
right about *rank* and wrong about *hue*: a label can be subordinate to its mark and
still be the mark's colour. The ladder as written would have taken colour OFF
`stacked-bar`'s series names and `line`'s direct labels, both of which already carry
it correctly today.

**3. The four finishes varied trivia.** They differed on furniture opacity
(`.55` vs `1`) and corner radius. Nobody can see that. Only `plate` was
distinguishable, and only because it had a ground. A finish must vary something a
reader actually reads.

## The principle these violated

> **Colour carries context. It is never removed as a correction — only relocated,
> re-ranked, or given a companion channel.**
>
> The single exception is a reader who cannot receive it: on the a11y palettes and
> in monochrome print, pattern, shade and label carry what hue carried. That is a
> SUBSTITUTION for one audience, never the design for everyone.

The world's charts have drifted grey. Ours should not. A boardroom chart earns its
restraint by spending colour precisely — not by refusing to spend it.

---

## What the engine already has, and is under-using

**`--chart-cat-N-ink` — "the category's hue AS TEXT, on the slide."** It exists per
palette, is solved to AA on both canvases (`lib/tokens/`, `derive-cat-ink.js`), and
**seventeen files already consume it**. `stacked-bar` paints each series name in its
own ink; `line` paints its direct labels; `timeline-list` paints its stage dots.

So "colour should reach the labels" is not a new capability to invent. It is an
existing, contrast-solved token that three members use correctly and the rest
ignore. **The language's job is to make it a rule instead of an accident** — which
is the same job the whole design has: generalise what the tree already does well.

The three inks the family carries, and what each is for:

| Token | Sits on | Already used for |
|---|---|---|
| `--chart-cat-N-ink` | the slide canvas | a direct label, a series name, a dot, a key entry |
| `--cat-on-fill` | a pale categorical surface | text on a tint |
| `--cat-on-mark` | a saturated categorical mark | text on full pigment |

---

## The grouping rule — the correction to axis B1

The taxonomy asked "does colour encode CATEGORY / STATUS / MAGNITUDE / NOTHING." The
`NOTHING` bucket was wrong, and it is what let a single-series bar chart read as a
chart with no colour decision to make. The real question is about **grouping**:

> **A group shares one hue. A singular may own one.**
>
> Every mark belongs to a group of one or more. Marks in the same group take the
> same hue — that is what makes them read as one thing. A group of one is a
> singular, and a singular may take a hue of its own, because there is nothing for
> it to be confused with.

Restated per member, this changes real outcomes:

- A **single-series bar** is one group → one hue, spent confidently, not "no colour".
- A **grouped bar** has one hue per series, repeated across categories.
- A **scatter of named entities** is a set of singulars → each may own a hue.
- A **stacked bar's parts** are groups → the part keeps its hue across every bar.
- **matrix-grid's marked cells** are one group (a path through the grid) → one hue,
  which is the fix its rows never needed.

---

## The axes are not orthogonal

The taxonomy presented substrate, occlusion, text-bearing, encoding and naming as
independent. They interact, and the interactions are where the design lives:

- **Occlusion × hue.** A LAYERED member's hues must stay distinct *after* they
  composite over one another. Radar's three polygons at 0.10–0.20 alpha do not have
  the separation their tokens do — the overlap region is a fourth colour nobody
  chose.
- **Naming × ink.** A KEYED member's legend entry and its mark must be the same
  colour, or the key does not name the mark. The pie's swatch and wedge disagreed
  for exactly this reason before the dome died.
- **Text-bearing × saturation.** A mark that carries text is capped in saturation by
  the contrast floor, so colour reaches it through its EDGE and its label, not its
  fill. That is not less colour — it is colour placed where it survives.
- **Substrate × weight.** A 1px stroke and a 200px area at the same hue are not the
  same colour experience. A LINE member needs more saturation than an AREA member to
  read as equally coloured.

**A finish that ignores these produces a chart that is colourful in the tokens and
grey on the slide.**

---

## The brief

Design **three** chart finishes — final, not four — that an author selects with
`charts:` in front matter.

**They must be distinguishable at a glance, on every one of the 21 members.** The
previous attempt failed this. If two finishes differ only where one member happens
to carry a gradient, they are one finish with a bug.

**They must be colour-forward and boardroom-ready at once.** That is the whole
difficulty: this is not a licence for loud charts. Colour should reach labels, axes,
points and fills where it earns its place, and the finishes should differ in *how far
it reaches and how it is spent*, not in whether it exists.

**Every member is in scope** — all 21, including the HTML ones (`kanban`,
`progress`, `roadmap`, `timeline-list`, `matrix-grid`, `journey`) and the two
hybrids.

### Settled, and not to be re-opened

- **The three registers** — MARK / BACKDROP / INK, plus the PLATE composition — and
  R0, the question that assigns them.
- **The radial dome is dead** on pie and quadrant (measured: 0.214 self-range against
  0.071 separation; 2.9× on onyx).
- **Radar keeps its alpha** — it is the family's only layered member.
- **The palette itself.** Curated across 13 themes and gated. Spend it; do not
  redesign it.
- **The taxonomy's axes**, with B1 restated as the grouping rule above.

### What a proposal must answer

1. **Where colour reaches** in each finish — fills, edges, labels, ticks, axis
   titles, keys, furniture — and why that reach suits that finish's purpose.
2. **How the three stay distinguishable** on a member that carries no gradient at
   all, e.g. `scatter` or `funnel`. Name the mechanism.
3. **The grouping rule applied**: for each of the 21, what is the group, and does
   any member carry singulars.
4. **The four interactions above**, each resolved with a rule rather than a
   per-member exception.
5. **The a11y and print substitution** — what replaces hue for that audience, per
   finish, given texture is the last rung and not the first.
6. **Cost**: members changed, decks re-rendered, and what a NEW chart pays. The
   architecture target is unchanged — a finish is token declarations with zero rules
   naming any member.

### How it will be judged

- Would a boardroom call it **excellent**, not merely correct?
- Are the three **visibly different on all 21**, or only on the ones with gradients?
- Does colour **carry meaning** everywhere it appears, or is any of it decoration?
- Does it survive **onyx** (value, not hue) and **achromatopsia** (no hue) without
  the design collapsing to the grey it was trying to avoid?
- Can a **new chart** adopt it without a single new rule?
