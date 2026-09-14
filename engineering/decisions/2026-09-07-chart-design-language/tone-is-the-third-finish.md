# `tone` is the third finish

Date: 2026-09-13. **Settled by the human**, and this note is the record it never
had.

Round two's competition picked `pigment` / `etching` / **`ground`**
(`judgement-colour.md`, `finishes.spec.js`). What every prototype, every tool and
every deck since has actually rendered is `pigment` / `etching` / **`tone`**. The
substitution happened inside `tools/gen-chart-finish-css.py` and propagated into
`finish-coherence.md` as a settled fact. Its entire justification on record was
one comment — `body=None,  # value, not hue`. Nothing else anywhere named what
`tone` is for.

**`ground` is retired.** Do not restore it because a design document still
argues for it; that document predates this call.

## What `tone` is

**One hue, eight value steps.** The group's identity moves out of the body's HUE
and into the body's VALUE — where the mark sits on a single-hue ladder is what
says which group it is.

## What the three finishes are three answers to

With `ground` out, the question is no longer "which register holds the hue"
(MARK / BACKDROP / INK). The axis that separates all three is **what the body's
paint is made of**:

| | identity lives in | the image | body | edge |
|---|---|---|---|---|
| `pigment` | the body's **HUE** | the newspaper page — the mark is the statement | 82% | ink, 1× |
| `etching` | the **LINE and the LETTER** | the drafted sheet — bodies retreat to a whisper | 30/40% | ink, **2×** |
| `tone` | the body's **VALUE** | one family in shades — depth is the datum | 92/76/61/47/34/22/14/9% of ONE hue | ink, 1× (2.5× on a backdrop) |

`pigment` is still the default — the smallest move from what ships.

## The law still holds, and it is what makes `tone` legitimate

> **THE INK LAW.** A finish spends one color budget on one group. Reach and depth
> trade: the further a group's hue travels from its datum, the less of it the
> datum keeps. Color is never added or removed between finishes — it is moved.

`pigment → etching` moves colour out of the body into the edge and the words.
**`pigment → tone` moves the HUE out of the body onto the edge, and repays the
body in value depth.** The body is not quieter under `tone` — its top step is 92%,
louder than `pigment`'s 82%. What it gives up is the hue, and the hue is not lost:
it is what outlines the mark. That is why `tone` is a third answer and not a
third volume.

## Both invariants survive, and one of them is easy to break

**1. Every mark carries an ink EDGE in every finish.** Measured: no body clears
the 3:1 graphical floor against its own canvas at any depth (82% bottoms out at
2.45:1; 30% clears it in 0 of 224 theme × mode × slot combinations) while the ink
clears it everywhere (worst 4.65:1). Under `tone` this edge is doing double duty,
because it is the **only** place the categorical hue survives.

**2. Every NAME wears its group's hue in every finish.** Under `tone` there is
one hue, so a name cannot distinguish itself by hue — and it certainly cannot
wear a 9% value step, which no type could survive. The channel it has left is the
**ink**, the same one on the edge.

**The first implementation got this exactly backwards** and sent every naming
element to `--text-body`. That rule REMOVES colour, which the law forbids in every
finish; it read as a reasonable accommodation and was a floor violation. Names now
resolve their own mark's ink: measured on the rendered deck, `sbar-name` 3 distinct,
`line-series` 3, `slope-name` 3, `cart-series` 5.

**This does not contradict "one hue".** `tone`'s claim is about BODIES. Its edges
and its names keep the categorical ink, and that is what makes the finish readable
rather than merely monochrome.

*(One gap, and it is the component's not the finish's: `.chart-key-label` renders
one colour for all 16 instances in the baseline too. A legend label names a mark
and by the floor should wear its ink. Logged, not fixed here.)*

## Two levels are deliberate, and both were arrived at by measurement

- **The ramp is doubled.** A text-bearing mark cannot wear the 92% step, so `tone`
  carries a second, compressed ramp (30→9% light, 35→10% dark) for that register.
  A single ramp collided with `pigment`'s backdrop level in one mode or the other,
  twice — and a finish that produces the same paint as another finish is the
  defect the coherence work exists to stop.
- **A STATUS mark's body joins the one hue; the status stays on the edge.**
  Leaving the body on the slot hue left `gantt` and `progress` as the only
  multi-hue cards under a finish whose whole claim is one hue in shades.

## Where `tone` is weakest, stated plainly

**A member with no body has nothing to vary.** `line`, `slope` and `word-cloud`
paint with strokes and type, which `kernel.marks` declares `paint: "none"` — so no
finish reaches them and `tone` renders them identically to `pigment`. Measured on
the deck: six hues survive in the word cloud and three in the line strokes, under a
finish claiming one.

This is the same weakness `ground` had on `word-cloud`, for the same reason, and
the winning document named it rather than pretending otherwise. Closing it needs a
`paint: "stroke"` value in the manifest schema — a breaking change to the mark
contract, and a separate decision.

## What is still NOT built

- **`etching`'s LETTER half — and it must NOT be built as written.** The design
  re-points `.cart-value`, `.cart-cat`, `.cart-tick` and the mark's own lane rule
  to the category ink. The generator emits **zero** rules for any of them, which
  is why independent reviewers read `etching` as "pigment with a quieter body".
  Measured against the rendered baseline before writing the rule, two of the four
  cannot be done on today's substrate and one of them should never be:

  | class | resolves the ink chain PER MARK in | if re-pointed anyway |
  |---|---|---|
  | `.cart-series` (the NAME) | **3 of 4** members | works — this is the one already done |
  | `.cart-value` | **1 of 4** (slope only) | bar, bullet and stacked-bar paint every value number one `--chart-cat-1-ink` blue |
  | `.cart-cat` | **0 of 5** | every category label, one blue |
  | `.cart-tick` | **0 of 5** | every value-axis number, one blue — **and it is shared furniture** |

  The first two are the flattening defect again, in the type channel: a rule that
  gives every label the same colour fails the floor exactly as surely as one that
  neutralises them. The third is worse than unimplementable, it is wrong —
  `.cart-tick` is the numeric axis tick (`cartesian.js` builds it from the scale's
  own ticks), so it is owned by no group, and *"ink belongs to whatever owns it"*
  is the rule that stops decoration. Painting it a categorical hue IS the
  decoration.

  This is the same substrate gap that made `finishes.spec.js` reach 5 of 21
  members, and its own header says so: the design was written against a prototype
  where a slot contract existed, and these labels carry no slot in the engine.
  Closing it means the transforms publishing the slot on their labels — the same
  class of change as `paint: "stroke"`, and the same decision.
- **The register audit.** Three of the eight destinations in the design's reach
  table are implemented (mark body, mark edge, and now the mark's name). The
  mark's VALUE and its own chrome are not.
