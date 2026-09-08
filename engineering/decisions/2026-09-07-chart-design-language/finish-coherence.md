# A finish with exemptions is not a finish

**Before this change, 6 of the 11 members in the prototype rendered
byte-identical under all three finishes.** Three of the six kept a gradient body
that no finish was allowed to replace. Measured across 8 theme × mode
combinations, by flipping the live prototype and reading computed paint
(`tools/chart-finish-coherence.mjs`).

| | before | after |
|---|---|---|
| members whose body differs across `pigment`/`etching`/`tone` | **5 / 11** | **11 / 11** |
| gradient bodies surviving a finish | **3** | **0** |
| worst text-on-a-mark contrast (floor 4.5:1) | 6.63:1 | **4.98:1** |
| worst edge-vs-body under `etching` (floor 3:1) | — | **3.46:1** light · **4.84:1** dark |

## Two rules caused all of it, and both were ours

**1. `data-fill` decided WHETHER a finish applies, not only how.** `spend-rules.md`
§4 reads "etching retreats a body only where the fill encodes hue; `ramp` scales,
`presence` floors, `layered` is edge-only." Three of the four encodings therefore
got a stroke tweak and no body, so `map` (ramp), `matrix-grid` (presence) and
`radar` (layered) painted the same under every finish — and `radar`'s gradient
survived because nothing was allowed to overwrite its fill.

**The rule is now: every encoding gets a body under every finish.** What the fill
encodes still decides *how* the finish reaches it — a ramp is SCALED into the
finish's band rather than replaced, a layered body takes a flat alpha rather than
a solid — but never *whether*.

**2. `register="backdrop"` exempted a mark instead of capping it.** The reason was
real: text on an 82% body fails AA in 117 of 224 theme × mode × slot combinations.
The answer chosen — don't touch it — makes a mark that renders identically under
all three, which is what `gantt`, `progress` and `matrix-grid` did.

**The register now CAPS the level; the finish still picks one inside the cap.**
Every backdrop body is measured against 4.5:1 for its own text. `matrix-grid` gave
up 6.63:1 to gain a finish and still clears at 4.98:1.

## And one datum was simply wrong

`funnel-band` was declared `backdrop` on the assumption that a band carries its own
label. It does not — the labels sit in the **left gutter**, outside the band.
Measured by geometric overlap: **0 of 5** funnel bands have any text ≥60% inside
them, against 5/5 for `gantt-bar`, 5/5 for `progress-fill` and 6/6 for
`cell-filled`. The wrong register is the whole reason funnel looked the same in all
three finishes. `spend-rules.md` §7's text-bearing list carried the same error.

## Levels, as they now stand

| | body | text-bearing body | ramp band | presence on | layered | edge |
|---|---|---|---|---|---|---|
| `pigment` | 82% flat | 40 / 46% | 16→70% | 40 / 46% | 82% @ .55 | 1× |
| `etching` | 30 / 40% | 14 / 19% | 6→30% | 14 / 19% | 30% @ .18 | 2× (3× on a backdrop) |
| `tone` | 92/76/61/47/34/22/14/9% of ONE hue | 30→9% light, 35→10% dark | 10→92% | two steps | the step, alpha tracking it | 1× (2.5× on a backdrop) |

Two levels are deliberate and were arrived at by measurement, not taste:

- **The tone ramp is doubled.** A text-bearing mark cannot wear the 92% step, so
  tone carries a second, compressed ramp for that register. A single ramp collided
  with `pigment`'s backdrop level in one mode or the other — twice, at 46% and then
  at 52% — and a finish that produces the same paint as another finish is the
  defect this document is about.
- **Under `tone` a STATUS mark's body joins the one hue; the status stays on the
  edge.** Leaving the body on `--slot-hue` left `gantt` and `progress` as the only
  multi-hue cards under a finish whose entire claim is one hue in shades. The
  semantic ink is not lost — it is what outlines the bar.

## What is still open

**Dark-mode `etching` reads as a saturated colour rather than a whisper.** Mixing
40% of a hue into a dark base keeps visible chroma at low lightness contrast, where
the same recipe over a light base desaturates. The numbers say the finish is
working — etching has the quietest body in both modes (1.09:1 vs the canvas on
dark, 1.59:1 on light) and the strongest edge (4.84:1 dark, 3.46:1 light) — so this
is a perceptual call on a pair the record set, not a measured failure. Flagged
rather than re-tuned.
