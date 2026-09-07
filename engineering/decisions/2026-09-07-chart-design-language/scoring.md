# Scoring the three finishes — measured, and the one thing that blocks all three

**Verdict: 5 / 10 as built. Not one of the three clears the 9.5 bar, and they
all fail for the same reason — not three design problems, one substrate
problem.**

`pigment`, `etching` and `ground` are written as CSS against `[data-cat]`.
**Five of twenty-one members emit `data-cat` on a mark.** Every rule aimed at
the other sixteen matches nothing, silently, and the member renders exactly as
it did before. That is why `pigment` and `etching` — which are supposed to be
the two extremes of the family — come out **pixel-identical on 19 of 22
slides**.

Both numbers are measured, both are reproducible, and the second one is the
same failure the four-finish attempt shipped in `finishes.superseded.spec.js`.
It was not fixed; it moved.

---

## How it was measured

Two arms, both now in the tree:

```
node tools/chart-language-census.js --theme indaco          # § KEYING
node tools/chart-finish-divergence.js --theme indaco \
  --variant pigment=pigment.css --variant etching=etching.css --variant ground=ground.css
```

The census's **KEYING** arm is new and is the arm that was missing when the spec
was written. It reports, per member, which attribute a mark carries its slot
on. The divergence tool renders the gallery once per variant and reports, per
member and per variant pair, the percent of pixels a reader would see change.

Neither is a gate. There is no correct divergence — `radar` keeps its alpha
under every finish by decision, so 0% there is right. What they refuse to let
you do is believe a finish reaches a member it does not.

---

## Arm 1 — the family keys its marks five different ways

| Slot attribute | Members |
|---|---|
| `data-cat` | bar, bullet, line, scatter, stacked-bar |
| `data-mark` (+ `data-s` / `data-cell`) | funnel, gantt, piechart, quadrant, slope, state-chart, waterfall, map |
| `data-s` alone | progress, timeline-list |
| `data-series` | radar |
| **nothing** | journey, kanban, matrix-grid, map (167 regions), roadmap, word-cloud |

Six members carry **no slot attribute at all** on their marks. No attribute
selector can reach them — a finish cannot style them without an emitter change
first, whatever the finish says.

And the attributes do not mean the same thing. `gantt`'s bars are keyed on
`data-s` because they are coloured by **status**, not category; `radar`'s
`data-series` names a series. Stamping `data-cat` on everything would be a lie
about what those marks encode. **The fix is a declared slot contract — one way
to name "this mark's colour slot, and what kind of slot it is" — not one more
attribute.**

## Arm 2 — divergence, all 21 members, indaco

`moved` is the percent of pixels a reader would see change. `!` marks a pair
under 0.5%, i.e. indistinguishable.

| member | base>pigment | base>etching | base>ground | pigment>etching |
|---|---|---|---|---|
| bar | 7.7% | 4.3% | 52.7% | **7.9%** |
| bullet | 0.1% ! | 0.1% ! | 39.7% | 0.0% ! |
| funnel | 0.0% ! | 0.2% ! | 52.3% | 0.2% ! |
| gantt | 0.1% ! | 0.1% ! | 35.7% | 0.0% ! |
| journey | 0.0% ! | 0.0% ! | 39.7% | 0.0% ! |
| kanban | 0.0% ! | 0.0% ! | 7.3% | 0.0% ! |
| line | 0.5% ! | 0.5% ! | 54.3% | 0.0% ! |
| map | 0.0% ! | 0.0% ! | 46.0% | 0.0% ! |
| matrix-grid | 0.0% ! | 0.0% ! | 30.2% | 0.0% ! |
| piechart | 7.4% | 8.5% | 46.3% | **8.1%** |
| progress | 0.0% ! | 0.0% ! | 16.4% | 0.0% ! |
| quadrant | 10.9% | 10.9% | 48.1% | 0.0% ! |
| radar | 0.0% ! | 0.0% ! | 50.1% | 0.0% ! |
| roadmap | 0.0% ! | 0.0% ! | 29.3% | 0.0% ! |
| scatter | 0.8% | 0.8% | 50.3% | 0.2% ! |
| slope | 0.0% ! | 0.0% ! | 54.5% | 0.0% ! |
| stacked-bar | 1.3% | 11.8% | 55.0% | **10.7%** |
| state-chart | 0.0% ! | 0.0% ! | 30.2% | 0.0% ! |
| timeline-list | 0.0% ! | 0.0% ! | 22.7% | 0.0% ! |
| waterfall | 0.2% ! | 0.4% ! | 48.7% | 0.2% ! |
| word-cloud | 0.0% ! | 0.0% ! | 52.4% | 0.0% ! |

Three readings, none of them comfortable:

**`pigment` and `etching` are one finish on 19 of 22 slides.** They separate on
`bar`, `piechart` and `stacked-bar` and nowhere else. The brief's own test —
*"if two finishes differ only where one member happens to carry a gradient, they
are one finish with a bug"* — is failed.

**The FLOOR does not land either.** "Every element that names a mark wears that
mark's hue" is the colour correction, not a style, so it should move pixels on
almost every member. `base>pigment` is under 0.5% on 17 of 21. The correction
reached four charts.

**`ground` is distinguishable on 21 of 21 — entirely by its frame.** Its
30–55% comes from one rule, a translucent background and border on
`.chart-body`. Delete that rule and `ground` collapses onto `pigment` on the
same eighteen members. Its distinctness is real and shallow, and it conflates
two separate author decisions: a **finish** (how a mark is painted) and a
**figure frame** (whether the chart declares its own ground — the thing asked
for on export grounds). Those should be two registers, not one.

---

## Scores

One score per finish, against the brief's five judging questions. Lowest
qualifying axis sets the number.

| | pigment | etching | ground |
|---|---|---|---|
| Boardroom excellent where it lands | 8 | 8.5 | 7 |
| Visibly different on all 21 | 3 | 2 | 6 |
| Colour carries meaning everywhere | 4 | 4 | 4 |
| Survives onyx + achromatopsia | 6 | 6 | 6 |
| A new chart adopts it with no new rule | 3 | 3 | 3 |
| **Overall** | **6** | **4.5** | **5.5** |

**`pigment` — 6.** The strongest of the three, and the only one with a defence
for its own no-op: a default finish *should* sit close to what ships. Where it
lands — bar, stacked-bar, pie, scatter, and the quadrant floor that kills the
dome — it is genuinely good: an 82% body, a category-ink edge, names in their
mark's hue. It loses four points for reaching five members.

**`etching` — 4.5.** The best *idea* of the three and the worst *artifact*. A
hollow scatter dot with a doubled ink ring, values and category labels moved to
full-strength ink: on `stacked-bar` it moves 11.8% of pixels and looks like a
different chart family. On 19 slides it is `pigment` with a different name. It
also depends on an emitter contract that does not exist — `.cart-value` and
`.cart-cat` carry no `data-cat`, so its coloured values land only on
single-group members and the spec special-cases `bar`, `waterfall`, `funnel` to
hide it.

**`ground` — 5.5.** Passes the visibility test and fails the honesty one. The
figure frame is a good idea the user asked for directly, but it is doing all the
work, and it belongs to a different register. Its per-group grounds — the part
that would make it a real finish — are not built.

**The design language as a whole — 5.** Not because the three looks are wrong.
The taxonomy, the three registers, the colour correction and the grouping rule
all survive this measurement intact; the judgement that the dome is dead and
radar keeps its alpha survives it. What fails is that the language was written
as a stylesheet over a substrate that cannot receive it.

---

## What raises it

**One change, and it is upstream of all three finishes: a slot contract.** Every
mark declares its colour slot and the kind of slot it is — category, status,
series, or magnitude — in one place, on every member. Until that exists, a
finish is a stylesheet aimed at five charts, and any score for the three is a
score for `bar`, `piechart` and `stacked-bar`.

With it, these same three CSS files reach all 21 and the scores above are
re-measurable in one command. That is the next thing to build, and the two
tools in this note are how it gets checked rather than claimed.

Second, smaller: **split the figure frame out of `ground` into its own
register.** It is an author decision about the figure, not about the mark, and
folding it into one finish is what let `ground` look distinguishable while
changing nothing about how a chart is drawn.
