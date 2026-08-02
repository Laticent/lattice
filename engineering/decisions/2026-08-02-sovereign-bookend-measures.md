---
status: shipped
summary: The sovereign bookends' width caps were a fraction of the SLIDE (`cqi`) where they meant a count of CHARACTERS, so one declaration set ~22 characters per line on landscape and ~12 on portrait — `--fs-*` is curated per orientation, and the two only agree while the type size holds still. Re-expressed as two named `em` tokens, `--measure-bookend-heading: 16em` (~33 characters) and `--measure-bookend-lede: 26em` (~56), so one number means one measure on every slide shape; plus `text-wrap: balance` on the headings, which fixes the orphan the cap was wrongly blamed for. Six declarations read the tokens across eight rules that change, in title / closing / divider. Measured over 48 text boxes x 3 orientations: 469 -> 306 rendered lines, clipped bookend slides 12 -> 3 (all three survivors pre-existing), and not one box gained a line. Both tokens go inert on portrait and the heading measure on square too; the one place a cap still binds a narrow frame is divider.light's subtitle, whose frame is wider than every other bookend's because the light variant drops divider's left inset. Landscape was NOT held byte-identical — that was available and was declined, because holding it would have meant keeping the same too-tight number.
---

# A bookend measure is a count of characters, not a fraction of the slide

## The principle it serves, unchanged

#1276 drew the line: **on a sovereign bookend (`title` / `closing` / `divider`) the heading and
subtitle ARE the slide's content**, so a composed measure is the component's own call; on every
other component the framing text is chrome, fills its masthead band, and takes its behavior from
the `headline:` register. That exemption was right and it stands. What this note replaces is the
*mechanism* implementing it, which #1303 opened with the observation that `divider h2` bound on
15 of 15 measured slides — "a cap that always binds isn't setting a measure, it's setting a
width."

That framing turned out to understate it. The caps were not merely too tight. They were not
measures at all.

## The defect

A measure is a count of characters per line. It is therefore a property of the **type**. The five
caps named a fraction of the **slide**:

```css
section.title   h1 { max-width: 59.4cqi   }
section.closing h2 { max-width: 62cqi     }
section.closing p  { max-width: 48.4cqi   }
section.divider h2 { max-width: 62.5cqi   }
section.divider.light p { max-width: 46.875cqi }
```

Those two agree only while the type size holds still, and in this engine it does not. `--fs-*` is
**curated per orientation** — three hand-tuned coefficient sets selected off the `data-orientation`
stamp (`lib/typography/scale.js`), not one set times a multiplier. Portrait deliberately runs much
larger type on a much narrower frame. So the same declaration resolves to a different measure on
every slide shape. Measured, on the three galleries at three orientations:

| Rule | landscape | square | portrait | portrait ÷ landscape |
|---|---|---|---|---|
| `title h1` | 10.69em ≈ **22 ch** | 8.49em | 5.91em ≈ **12 ch** | 55% |
| `closing h2` | 11.16em ≈ 23 ch | 8.86em | 6.17em | 55% |
| `closing p` | 19.91em ≈ **43 ch** | 12.45em | 8.38em ≈ **18 ch** | 42% |
| `divider h2` | 10.70em ≈ 22 ch | 8.49em | 5.91em | 55% |
| `divider.light p` | 20.36em ≈ 44 ch | 12.72em | 8.56em ≈ 18 ch | 42% |

Twelve characters per line on a portrait title. Eighteen on a portrait sign-off.

**That arithmetic is the reported bug, exactly.** #1303's worst case — portrait `divider.light p`
running to *10 lines where 4 would do* — is 44 ch collapsing to 18 ch, a factor of 2.4, and
4 × 2.4 ≈ 10. Nothing else needed to be wrong for that slide to fail.

Two further measurements the issue did not have:

1. **The caps were causing clipping.** Across the corpus at three orientations, the extra lines
   they forced overflowed **12 bookend slides**; with the measures below, 3 — and all three of
   those clipped before the change too.
2. **`text-wrap: balance` is a complement, not an alternative.** #1303 offered it as candidate
   direction 1, i.e. as a *substitute* for the cap. It isn't: applied across the corpus it changed
   the break positions of 60 headings and changed the line *count* of none. The cap decides how
   wide the block is; balance decides where the breaks fall inside it. They are orthogonal, and
   the codebase needed both.

That second point also settles a piece of blame recorded in the CSS. `closing.styles.css` carried
a comment crediting an earlier *widening* of its cap with fixing "a six-word sign-off … with one
orphan word." Widening a cap does not fix an orphan; it moves it. The orphan was always balance's
job, and the widening happened to hide that instance.

## What shipped

Two named tokens in `lib/base/base.tokens.css`, sized to the classic typographic ranges — a
display line wants 20–35 characters, a reading line 45–75:

```css
--measure-bookend-heading: 16em;  /* ≈33 characters at the display tier   */
--measure-bookend-lede:    26em;  /* ≈56 characters at the statement tier */
```

**Six declarations read the tokens**, across eight rules that change (up from the five #1303
enumerated — see *Scope* below). The two rows below that read no token still change: one drops a
cap it should never have carried, the other gains only `balance`.

| Rule | was | now |
|---|---|---|
| `title h1` | `59.4cqi` | `--measure-bookend-heading` + `balance` |
| `closing h2` | `62cqi` | `--measure-bookend-heading` + `balance` |
| `closing p` | `48.4cqi` | `--measure-bookend-lede` + `balance` |
| `closing :is(ul,ol)` | `60cqi` on the list | `--measure-bookend-lede` **on the `li`** |
| `closing.index :is(ul,ol)` | `62cqi` on the list | (folded into the row measure above) |
| `divider h2` | `62.5cqi` | `--measure-bookend-heading` + `balance` |
| `divider.light h2` | `none` | `none`, + `balance` |
| `divider.light p` | `46.875cqi` | `--measure-bookend-lede` + `balance` |

Both eyebrows are held **out** of the lede measure. `closing`'s already was (an explicit
`max-width: none`); it gains `text-wrap: normal` to match, because balance on a one-line label is
a no-op at best and an even split on a label that *does* wrap reads as a heading.
`divider.light`'s was **not**, and now is: `section.divider.light p` is written for the subtitle
but matches every paragraph on the slide, so it also caught the eyebrow. That straddle was latent
rather than live — a realistic eyebrow is far too short to reach 26em, and was too short to reach
the 46.875cqi it replaces — but it is real, it is in a file this change is already rewriting, and
its twin was already excluded. Fixed in place (HARD RULE #18).

The exclusion matches **the code-only paragraph itself**, not a heading-adjacency form, and that
detail was earned rather than chosen: `divider.light` accepts *three* eyebrow shapes, not one.
`base.modifiers.css` gives it the before-heading rules for `+ h2` **and** `+ h1` (:153-154) plus
the after-heading `h1 +` / `h2 +` pair (:79-80) — and `divider.docs.md` explicitly tells authors
the after-heading form "still renders." A first cut copied divider's usual before-heading selector
(`p:has(> code:only-child):has(+ h2)`), which excluded one shape and left the other two capped;
a maker-checker pass caught it. The shape all three share is a paragraph whose only child is a
code span, so that is what the rule matches.

### Why `em` is the right unit, and why this does not touch the `cqi` contract

`cqi` is curated and load-bearing: it is what makes a deck render identically at 8K. It is not
being questioned here, and the #1276 finding that "this was a width problem, not a unit problem"
is not being reversed — that was about a *chrome* cap that needed to see a masthead bay, which no
unit can express. This is a different rule about a different thing.

`em` resolves against the element's own `font-size`. So a measure written in `em` says what a
measure means — *this many letter-heights of line* — and says the same thing on every slide shape.
And it stays resolution-independent **for free**, because `--fs-*` is itself `cqi`: the em rides
the curated scale rather than competing with it. There is no 8K exposure to argue about.

### Why the values, and where they bind

Measured landscape frames are ~37 characters wide for a bookend heading and ~90 for a lede. So:

- **16em (≈33 ch)** trims only the longest headings, leaving ~11% side air instead of running
  frame-edge to frame-edge — the "title block, not a banner" proportion `title.styles.css` was
  written to protect.
- **26em (≈56 ch)** holds a sign-off inside the reading range; the frame alone would allow ~90
  characters on one line, well past the 75-character ceiling.

**Where they bind, measured on the three galleries:**

Frame width vs the cap, per orientation (`title` / `closing` share a frame; `divider` is inset,
`divider.light` is not):

| Box | landscape | square | portrait |
|---|---|---|---|
| heading — `title` / `closing` | 1152px frame vs a **1024px** cap → **binds** | 972 vs 1088.6 → inert | 972 vs 1563.8 → inert |
| heading — `divider` | 1096 vs **1024** → **binds** | 924.8 vs 1088.6 → inert | 924.8 vs 1563.8 → inert |
| lede — `closing` | 1152 vs **728** → **binds** | 972 vs 982.8 → inert | 972 vs 1460.2 → inert |
| lede — `divider.light` | 1216 vs **728** → **binds** | **1026 vs 982.8 → BINDS** | 1026 vs 1460.2 → inert |

So the measure is a landscape-only refinement **with one exception**, and the exception is worth
naming rather than rounding away: `section.divider.light` sets `padding-left: 0`, dropping the
`9.375cqi` left inset the dark divider carries, so its subtitle sits in a frame ~54px wider than
any other bookend's. On square that frame (1026px) is just wider than the lede cap (982.8px), and
the measure binds by about 1em.

That is a consequence of the light variant's own framing, not of the measure — and a first draft
of this note asserted "inert on portrait and square" flatly, in five places, on the strength of a
corpus where this box happened not to appear. A maker-checker pass measured it and refuted the
claim. Recorded because it is the same over-generalization #1276's note had to correct twice: a
property observed across a measured corpus stated as a property of the engine.

### Not held byte-identical, deliberately

Re-expressing each cap at its own landscape-equivalent `em` value was tested and is exactly
byte-identical on landscape (Δ 0 lines across the corpus) while fixing portrait and square
outright. It was **declined.** Byte-safety here would have meant preserving 22 characters per
line as the landscape display measure — the number the audit says is wrong. A migration that
carries the defect forward on the majority orientation is not a fix. Landscape moves, and the
gallery goldens are re-blessed accordingly.

## Measured result

48 text boxes × 3 orientations, across the three anchor galleries, the 87-slide baseline gallery,
and the bloom deck. Before and after are measured on the **same page load** — the old
declarations are re-injected as an override sheet rather than re-rendered from a rebuilt bundle —
so no cross-run drift or counter change can contaminate the delta:

| | rendered lines | clipped slides | boxes that gained a line |
|---|---|---|---|
| before | 469 | 12 | — |
| after | **306** (−35%) | **3** | **0** |

Per rule, lines before → after:

| Rule | landscape | square | portrait |
|---|---|---|---|
| `title h1` | 11 → 9 | 14 → 10 | 16 → 12 |
| `closing h2` | 24 → 18 | 26 → 19 | 37 → 26 |
| `closing p` | 15 → 11 | 22 → 11 | 34 → 17 |
| `closing` list rows | 12 → 12 | 21 → 12 | 30 → 20 |
| `divider h2` | 42 → 29 | 51 → 32 | 75 → 48 |
| `divider.light p` | 8 → 6 | 12 → 6 | 19 → 8 |

**Not one box gained a line, in any orientation** — the measure is strictly looser everywhere it
moved. Landscape `closing` list rows are the one row that is flat: their old `ul` cap did not
bind on landscape, and the new row measure doesn't either. It is portrait and square that were
carrying that defect (21 → 12, 30 → 20).

**All three surviving clipped slides are pre-existing** — `closing.gallery` p4 (landscape and
portrait) and the baseline gallery p258 (portrait) clipped before this change too, and no slide
that fit before clips now. They are off-path for this change and are left alone (HARD RULE #18):
their cause is content volume, not framing width.

`divider h2` still *binds* on 13 of 13 landscape slides, and that is no longer the tell it was.
Binding at 33 characters while costing an extra line on **1** slide (down from 12) is a measure
composing a block. Binding at 22 characters while costing a line on 12 of 13 was a width.

## Scope: eight rules, not five

#1303 enumerated five. Measuring turned up three more, all with the identical defect and all in a
file this change was already rewriting, so all three are **on the path** and fixed in place rather
than logged (HARD RULE #18):

- `closing`'s trailing list (`60cqi`) and its `index` variant (`62cqi`), which bound on 10 of 21
  observations and cost a line every time, worst case 16 lines where 12 would do. The 3% split
  between the two values had no intent behind it and is gone.
- `divider.light`'s eyebrow, which inherited the subtitle's measure because the subtitle rule
  matches every paragraph on the slide (see *What shipped*). Latent, not live — but its twin on
  `closing` was already excluded, and a straddle left in place is a straddle someone re-derives
  later.

The two list caps moved **from the `ul` to the `li`**, which is a real change and not a mechanical
substitution. A `ul` is the one box in that stack that declares no type tier — it inherits the
section's body size while its rows render at `--fs-message` — so an `em` measure written there
would have counted characters of the wrong tier, reintroducing on the type axis the same
mismatch this note removes on the orientation axis. The list is a shrink-to-fit flex column
(`align-items` is only ever `flex-start` / `center` / `flex-end`, never `stretch`), so it still
tracks its widest row.

## Documented, which is half the point

None of the eight original values appeared in any `.docs.md`, in `base.docs.md`, or in
`engineering/typography.md`. An author could only discover them by writing a title and noticing it
wrapped early. That is now fixed in four places: the token declarations carry the reasoning,
`engineering/typography.md` §8 defines measure as a first-class concept alongside size,
`lib/base/base.docs.md` documents the two tokens under the `headline:` register beside the
sovereign exception they implement, and each of the three components' `.docs.md` names its own.

Being tokens is what makes them overridable — a deck that wants a different bookend proportion
sets `--measure-bookend-heading` in front-matter `style:` rather than losing to a number it cannot
see.

## Method

`.scratch/` harnesses (throwaway, not gates), rebuilt for this change rather than inherited:
a measured pass that renders each bookend-bearing deck through the real emulator at three
orientations and, for every capped box, records the parent's available width, the rendered width,
the width with the cap lifted, the line count both ways, and the computed `font-size` — which is
what makes the `em` column above a measurement rather than an inference. A second pass injects
each candidate mechanism as an override sheet and remeasures, so all seven candidates are compared
on identical renders.

One methodological trap, recorded because it silently corrupted a first pass: forcing an
orientation by *prepending* `size:` to a deck's front-matter does nothing when the deck declares
its own `size:` later — the deck wins. The baseline gallery (`size: 4k`) and the bloom deck
(`size: 16:9`) both did, so their "portrait" and "square" rows were landscape renders wearing the
wrong label, which inflated the bind counts. The values in this note come from the pass that
*replaces* the key.

## Cross-references

- `engineering/decisions/2026-07-30-masthead-framing-fills-the-band.md` — the principle this
  serves, and the non-sovereign half of the rule.
- `lib/typography/scale.js` — the per-orientation coefficient sets that make a `cqi` measure
  orientation-dependent.
- `engineering/typography.md` §8 — measure as a contract.
- Issue #1303.
