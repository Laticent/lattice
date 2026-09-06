---
status: shipped
summary: >
  The open fork left by the Cartesian expansion asked whether a label ranking is information
  or false precision when marks overlap. Measured on the real charts, the premise splits: a
  reader's first question is not "what rank is this?" but "which mark is this?", and the two
  charts were in opposite positions on it. `scatter` already draws a leader from every name
  that had to travel, so its cluster is dense rather than misleading; `quadrant` draws
  nothing, and six of the fourteen names on its own stress slide sit closer to another
  initiative's dot than to their own. So the larger defect was never the ordering — it was
  that one chart had no attribution channel at all. Both land: the leader emitter moves into
  the shared label kernel and `quadrant` draws it, and a column's order becomes a preference
  inside `placeLabels` rather than a repair after it. The repack the brief proposed was built,
  measured, and declined — on the two real slides it declines itself.
---

# A label column, and the two questions a reader actually asks

**Scope**: `lib/components/chart/_chart-family/svg-label.js` (the shared label
kernel), `quadrant.transform.js`, `scatter.transform.js`,
`chart-family.css` § Label leaders.

**Answers the fork left open by**
`engineering/decisions/2026-09-06-cartesian-chart-expansion.md` §6.

---

## 1. The question, and why it was the wrong shape

The Cartesian expansion recorded a real defect and declined to fix it. On
`scatter`'s twelve-tool stress slide the four names in the tight cluster read
Ironwood · Cardinal · Granite · Halyard down the column while their dots ran
Ironwood · Granite · Cardinal · Halyard. The note asked the design question
before the implementation one:

> When marks overlap, is a label ranking information or false precision?

Both answers are defensible in the abstract, which is why it stayed open. What
settles it is not an argument but the two charts, looked at.

**A reader's first question is "which mark is this name?", not "what rank is
this?"** — and on that question the two callers were in opposite positions.

- **`scatter` already answers it.** Every name that travels gets a hairline back
  to its own dot. Three of its twelve stress-slide names sit nearer another
  entity's dot than their own, and all three carry a leader. The column's order
  is then a tidiness question, exactly as the expansion note concluded: dense,
  not misleading.
- **`quadrant` could not answer it at all.** It draws no leaders, no value pills
  and no axis to read a position off. Proximity was its only channel — and on
  its own fourteen-initiative stress slide, **six of the fourteen names sit
  closer to another initiative's dot than to their own.** Proximity gives the
  wrong answer six times, and nothing on the slide corrects it.

So the fork's premise was too narrow. The ordering defect is real and worth
fixing. It is not the larger one.

### The answer, stated

**A column of names is read as an order whether or not the pass meant one, so
the rule is not "rank the labels" — it is that the column must not CONTRADICT
the marks it names.** Where the marks are separable, an inverted column is
simply false: a reader can see one dot above another and the names say the
opposite. Where the marks overlap, ordering the column by the marks' own
coordinate is not false precision either — it reports an order that exists in
the data, and it claims nothing about the SIZE of the gap, because the pitch is
never proportional and a leader ties each name back to its own mark. What WOULD
be false precision is implying a distance: rank numbers, or spacing labels by a
difference the reader cannot see. We do neither.

And the honest limit: some clusters have no clear position that reads the right
way. This pass makes a column that does not contradict its marks; it does not
promise a rank readout, so nothing in the chart invites one to be read off.

## 2. What ships

**One.** `leaderLine` moves out of `scatter.transform.js` into
`svg-label.js` and takes its class from the caller (HARD RULE #1). `quadrant`
draws it. The paint moves with it, from `scatter.styles.css` to
`chart-family.css` § Label leaders, as one `.chart-leader` rule — the two charts
draw the same mark for the same reason, and a second copy of one hairline would
drift.

**Two.** Order becomes a term inside `placeLabels`. A candidate position that
would read backwards against an already-placed label sharing its column costs
`ORDER_COST` — added to the ANCHOR preference, never to the collision score. Two
things follow, and both are the design:

- the pass answers "that reads backwards" with a different **position**, which
  is its own native move — the module's docblock already says the answer to "no
  room" is another position, not a slide;
- when every clear position reads backwards it takes one anyway. **Order is
  worth an anchor. It is never worth a name.**

`ORDER_COST` is 10 on an anchor scale that runs 0 (`above`) to 15 (`left`): it
buys the whole vertical family and both diagonals before it gives up on the
order, and stops short of buying a pure side placement, which is the read the
module deliberately avoids. Its neighbors bracket it on the same corpus — 1 is
too weak to change an anchor (16.78% against 6.04%), and 100 buys 0.31 points
more while dropping THREE MORE NAMES to get them (84 hidden against 81), which
is the trade this pass refuses.

## 3. The measurements

Over 20,000 randomized layouts through the real kernel, scoring every pair of
placed labels that share a column (horizontal overlap ≥ 50% of the narrower box)
against the marks they name:

| | pairs sharing a column that read against their marks | …of those whose marks a reader CAN separate |
|---|---|---|
| before | 18.61% | 6.33% |
| **shipped** (order as a preference) | **6.04%** | **2.50%** |
| place top-down instead | 8.7% | 4.7% |
| the repack (§4) | 14.8% | 4.9% |

The first two rows are the real kernel, before and after, on one corpus; the
last two are prototypes measured on the same corpus through a faithful copy of
the pass.

What the shipped row costs, same corpus, base → head:

| | base | head |
|---|---|---|
| labels seated directly above or below their own mark | 74.37% | 70.78% |
| mean ring | 0.564 | 0.551 |
| mean distance from a label to its own mark, user units | 10.95 | 11.14 |
| label-on-label overprints | 0 | 0 |
| labels painted over a mark | 0 | 0 |
| names dropped because nothing cleared | 87 | **81** |
| ms per layout | 0.0612 | 0.0745 |

So the price is 3.6 percentage points of labels moving off a vertical anchor
onto a diagonal, a fifth of a user unit of adjacency, and 13 microseconds a
chart. It introduces no overprints and no labels on marks, and it drops six
FEWER names than before — a position that avoids an inversion is sometimes also
a position that clears.

On the two real slides, before → after:

| Slide | ambiguous names (nearer another mark than their own) | of those, carrying a leader | column pairs reading against their marks |
|---|---|---|---|
| `scatter` stress, 12 entities | 3 → 4 | 3 → 4 | 1 → 0 |
| `quadrant` stress, 14 initiatives | 6 → 6 | **0 → 6** | 2 → 1 |

The quadrant row is the change. The count of ambiguous names barely moves — the
pass is not trying to move labels closer — but every one of them now carries a
line back to its own mark, where before none did.

**The leader threshold stays `scatter`'s `r + 5`, and that is a measurement, not
an inheritance.** At `r + 5` a label seated at the first ring gets no line and
anything further out does. On both stress slides that covers every ambiguous
name; lowering it to `r + 2.6` draws one more line on the quadrant and covers
nothing extra, and raising it to `r + 6` covers the same six. On an ordinary
six-item quadrant it draws nothing at all.

## 4. The repack was built, measured, and declined

The expansion note's own suggestion was to lift `slope`'s fixed-pitch repack —
monotonic by construction — into the kernel to serve all three callers. It was
implemented and measured rather than reasoned about, and it does not carry over.

**On the two real slides it declines itself.** With an honest post-condition —
no new collision with a mark, with the plot bounds, OR with any other placed
label — it applied to neither the scatter stress slide nor the quadrant one:
zero pixels changed on both.

**Drop that post-condition and it trades one defect for a worse one.** Checking
only marks and bounds, as `slope`'s own pass effectively can, it introduced
**2,102 label-on-label overprints per 20,000 layouts** — in a pass whose current
overprint count is zero. Two overprinted names are two names lost, which is the
outcome the hide-overlap rule exists to prevent.

**Why `slope` gets away with it.** Its end labels own two empty gutters outside
the plot; nothing else is ever in them, so a column can be repacked at a fixed
pitch without asking what it might land on. `scatter` and `quadrant` labels share
the plot with every mark and every other label. The mechanism is not portable,
and the property it guarantees — monotone by construction — is bought there by
the geometry, not by the algorithm.

**`slope`'s repack stays where it is, unchanged and byte-identical.** Its
galleries do not move under this change, which is the check that says so.

## 5. Considered and not taken

- **Refusing to imply an order at all** — penalizing a shared column over
  overlapping marks so the names spread horizontally and the leaders carry
  everything. Honest, but it spends the vertical anchors the module deliberately
  prefers ("a name over its point reads as that point's caption; beside it reads
  as a row in a list"), and it does nothing for the pairs whose marks a reader
  CAN separate, which are wrong rather than imprecise.
- **Placing top-down (in mark order) rather than in authoring order.** The
  closest translation of "monotonic by construction" into this pass's idiom, and
  visually the tidiest on the scatter stress slide — all four names in one
  column, in order. It loses on the corpus (8.7% against 6.3%), so it is not
  what ships; it is the first thing to re-measure if the residue ever matters.
- **Re-attempting `preserveOrder` / `repairClusterOrder`.** The reverted pass
  from the expansion note. §6 there records why it failed — a docblock that
  argued a property the code never computed, a guard nothing exercised — and
  nothing here revisits it.

## 6. Surfaces driven

| Surface | How | What it showed |
|---|---|---|
| CLI PDF, light | `quadrant` + `scatter` galleries and the demo deck, rasterized and read | Every changed page reviewed; the bubble variant's three floating names now each carry a line to their own bubble |
| CLI PDF, dark | The same quadrant stress page in `dark` | The hairline follows `--text-body` in both modes and reads at the same weight against the dark canvas |
| Docs site | `/components/chart/quadrant/` at 1440px in a real Chromium, querying the live DOM | Two `.chart-leader` elements computing `stroke: oklab(0.487766 0.011021 0.0260308 / 0.52)` and `stroke-width: 0.55px` inside `section.quadrant form chart-frame` — the moved rule resolves on a different builder, and no `scatter-leader` survives on the page |
| `--player` HTML export | The demo deck exported with `--player`, grepped for the rule | The CSS prune keeps `section.chart-frame .chart-leader,figure.chart-frame .chart-leader` with both arms — a renamed class is exactly what a pruner can drop, so this was checked rather than assumed |
| The kernel, as a corpus | 20,000 randomized layouts, scored | The tables in §3 |
| The kernel, as a suite | 14 mutations of the two guards | All killed — see §7 |

**Not driven, and not claimed:** the Studio's Present and Read·Article surfaces.
They re-host the same SVG through the same `figure.chart-frame` arm the docs-site
probe exercised, which is an argument rather than an artifact (HARD RULE #23).

## 7. What the tests actually hold

Both guards are pinned by arms that were mutation-checked rather than assumed —
the lesson §6 of the expansion note paid for.

- **The fixtures are calibrated, and that is the point.** Two marks in a column
  resolve themselves: every mark is an obstacle for every label, so the upper
  mark blocks the lower label's `above` and the order falls out. It takes THREE
  marks inside a label-height for the greedy pass to paint a column that reads
  backwards. Both order fixtures were picked by running the search with the term
  switched off and keeping only the sets that invert without it. An earlier pair
  of fixtures passed either way and tested nothing.
- **The attribution arm is stated as the property, not the mechanism**: every
  name in a blob is either seated nearest its own mark or carries a leader
  springing from it. "All four carry a leader" was the old scatter arm, and this
  change breaks it honestly — one of the four is now seated against its own dot
  and needs no line.
- Mutants killed, fourteen of fourteen: the order term disabled, weakened to 1,
  never applied, inverted, and with its same-height escape removed; the column
  test removed and `columnShare`'s formula altered two ways; the leader always
  drawn, never drawn, drawn for a hidden label, thrown 50 units out, and
  detached from its mark; and `quadrant`'s leaders removed and attached to the
  wrong dot.
- **One of those mutants is a bug the sweep found in this change before it
  shipped.** The order term billed a penalty for two marks at the SAME height,
  where there is no order to contradict — so every position for the second label
  cost the same phantom 10 and the pass left a column for no reason a reader
  could name. The fix is a tie escape on the MARK sign, and the arm that pins it
  is the fixture the search found: a three-line name and a one-line name eight
  units apart at equal height, where the buggy pass takes `above-right` (cost 6)
  over the `below` (cost 1) it should have.

## 8. Found, not caused

Regenerating the two committed artifacts this change moves also picks up
pre-existing drift, and the numbers say which is which. `examples/adaptive-sweep.pdf`
was last built at `70d711d` (2026-09-03) and its base render differs from the
committed file by 42 bytes; `test/integration/baseline-decks/gallery.pdf` was last
built at `e69d99c` and differs by 14 bytes. Both were stale before this branch —
measured by rendering each deck against the base engine and comparing — and both
had to be rebuilt here because this change genuinely moves them. This is the class
`engineering/decisions/2026-09-06-cartesian-chart-expansion.md` §6 already records:
per-PR CI structurally cannot see a golden nobody edits, and the nightly
committed-golden freshness step is its only watcher.

**`bench:check`'s `charts` row has been recording nothing since 2026-09-06.** It
reports `WORKLOAD CHANGED (re-bless)` — 15 slides blessed against 22 rendered —
because `lib/components/chart/chart.gallery.md` grew by seven members at
`7ab03b4` (#2080) and `test/benchmark/baseline.json` was last blessed at
`e745307` (2026-09-02), before it. This branch does not touch that deck, and its
other two rows are inside the band (−6.3% and −9.9%), so the baseline is NOT
re-blessed here: HARD RULE #19(b) asks for a re-bless from the PR that justifies
it, and folding an unrelated baseline refresh into this one would hide exactly
the drift the ratchet exists to show.
