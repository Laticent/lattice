---
marp: true
theme: indaco
paginate: true
header: "Lattice · chart axis grammar"
acronyms:
  SMB: small and mid-sized business
---

<!-- _class: title silent -->

# One grammar for an axis. Position says what it means.

`Chart axes · matrix-grid · scatter`

Four components named their axes four different ways — by counting code spans,
by an arrow glyph, by a keyword prefix. They now share one bracketed list, and
where you put it is what tells the engine whether it names the axes or renames
the key.

---

<!-- _class: matrix-grid -->
<!-- _footer: "Above the grid · the list names the axes" -->

`[Wider reach, Deeper cognition]`

## The axis line sits above the chart.

First member names the column axis, second the row axis. Arrows are drawn, not
typed.

| Verb       | Self       | Team       | Org       |
| ---------- | :--------: | :--------: | :-------: |
| Create     | [ ]        | [-]        | [x] Staff |
| Apply      | [-]        | [x] Senior | [-]       |
| Remember   | [x] Junior | [-]        | [ ]       |

---

<!-- _class: matrix-grid -->
<!-- _footer: "Both slots · same shape, different authority" -->

`[Wider market, Deeper product]`

## The same shape below the grid renames the key.

Nothing about the two spans distinguishes them. Only where they sit.

| Segment    | Direct     | Partner    | Self-serve |
| ---------- | :--------: | :--------: | :--------: |
| Enterprise | [x] Core   | [-]        | [ ]        |
| Mid-market | [-]        | [x] Core   | [-]        |
| SMB        | [ ]        | [-]        | [x] Core   |

`[{[-], within reach}, {[ ], out of band}]`

---

<!-- _class: scatter -->
<!-- _footer: "scatter · two members, x then y" -->

`[Annual cost, Teams adopting]`

## The same line reads on a scatter.

- Atlas `$420k` `18%`
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`

---

<!-- _class: scatter bubble -->
<!-- _footer: "scatter bubble · a third member names the size measure" -->

`[Annual cost, Teams adopting, Seats]`

## A third member sizes the dot.

- Atlas `$420k` `18%` `1200`
- Borealis `$310k` `24%` `800`
- Cardinal `$180k` `52%` `2400`
- Dovetail `$95k` `61%` `3100`
- Everline `$240k` `31%` `600`

---

<!-- _class: scatter -->
<!-- _footer: "Quotes protect a comma, so this is two axes and not three" -->

`["Cost, excluding tax", "Teams adopting"]`

## Quotes are optional, and they are not decoration.

Unquoted, every comma splits. Quoted — single or double — a comma is part of the
name. The alternative was banning commas, which fails the first author who
measures cost excluding tax.

- Atlas `$420k` `18%`
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`

---

<!-- _class: matrix-grid -->
<!-- _footer: "An ordinary eyebrow is not a bracketed list, so it is left alone" -->

`Capability review · FY26`

## A paragraph that is not a list still passes through.

The bracket is what makes a span a construct; position only decides which one.
An eyebrow above the grid stays an eyebrow.

| Verb       | Self       | Team       |
| ---------- | :--------: | :--------: |
| Create     | [ ]        | [x] Staff  |
| Apply      | [x] Senior | [-]        |

---

<!-- _class: content -->
<!-- _footer: "What it replaced" -->

## Four grammars, retired.

- matrix-grid and scatter
  - Counted code spans — two meant an axis, one meant an eyebrow. A label set
    was forbidden from being two spans as a result.
- quadrant
  - An arrow glyph, needing a carve-out in the typed-glyph gate.
- gantt
  - Keyword-tagged pills, and already the closest to right — it ships the `..`
    range this grammar adopts.
