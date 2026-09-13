<!-- Design-competition candidate (colour round), 2026-09-07.
     Track 1 — colourist.  Judge score: 7/10.
     Title: Pigment · Ink · Ground — three finishes on the reach ladder
     A PROPOSAL. The winner is track 3; the ranking and the grafts to
     fold into it are in ../judgement-colour.md. Brief: ../colour-brief.md. -->

**Perspective: colourist.** Everything below turns on two measurements I ran this session, and neither is the one I expected to find.

---

## The finding that decides the design

I resolved all four categorical tiers over the 14 curated themes × 2 canvases × 8 slots — 224 combinations — using the resolver from `test/unit/palette/chart-contrast.test.js` (`light-dark()`, `var()` with fallback, `color-mix(in oklab, …)`):

| tier | mean OKLCH chroma | worst adjacent separation | worst vs `--bg` | below 3:1 | below 4.5:1 |
|---|---|---|---|---|---|
| `--chart-cat-N-hue` (graphical) | **0.090** | 0.021 | 3.04:1 | **0/224** | 41/224 |
| `--chart-cat-N-ink` (text) | **0.089** | 0.025 | 4.65:1 | **0/224** | **0/224** |
| the 82% solid (area fill) | 0.073 | 0.015 | 2.45:1 | **36/224** | 185/224 |
| `--chart-cat-N-fill` (tint) | 0.028 | 0.007 | 1.03:1 | 224/224 | 224/224 |

*(An earlier draft carried a fifth column, "mean adjacent separation", at 0.070 / 0.070 / 0.057 / 0.022. It did not reproduce — re-running the same resolver gives 0.156 / 0.148 / 0.128 / 0.049 — so the column is withdrawn. The ordering claim it was there to support survives at the corrected values and is stated below on its own evidence.)*

Read it as a colourist and it says something the family has never acted on:

> **The most chromatic, most separable, most contrast-solved thing the chart family owns is its ink.**

`--chart-cat-N-ink` carries **1.21× the chroma of the 82% solid** and does so on **28 of 28 theme × mode combinations** (min 1.16×). Its adjacent separation beats the solid's on **28 of 28**. It clears AA against the canvas in **224 of 224**. The 82% solid — the level six members hand-paint and the level the winning candidate proposes to tokenize — falls under the 3:1 WCAG 1.4.11 graphical floor in **36 of 224**, worst 2.45:1 (`concrete/light/cat6`), because `chart-contrast.test.js` scores the raw `--chart-catN` hue and the slide shows the 82% mix.

**The second measurement is where the earlier draft of this design was simply wrong, and correcting it narrows the whole brief.** `node tools/chart-colour-reach.js` on `lib/components/chart/chart.gallery.md` reports **216 of 318 text elements (68%) wearing the colour of the thing they name, and 0 of 21 members with no keyed text at all.** The tool's `--chroma-floor` flag touches only the marks and rules columns, so it does not move that number. The "18 of 318 / 6% / 16 of 21 members grey" and "97% at the default floor" figures the earlier draft led with came from measuring *chroma* rather than *matching* — the exact question the tool's own docblock says it retired: *"Indaco's `--text-body` is #1E3A5F, a navy: it clears any reasonable chroma floor… Chroma is not reach. MATCHING the mark is reach."* Those numbers are withdrawn.

What the keyed metric actually shows, per member:

| already at 100% keyed text | the weak tail |
|---|---|
| `line` 14/14 · `matrix-grid` 19/19 · `roadmap` 13/13 · `scatter` 17/17 · `word-cloud` 15/15 | `progress` 1/6 · `timeline-list` 1/5 · `kanban` 2/8 · `state-chart` 6/24 · `quadrant` 9/19 · `bar` 4/8 · `gantt` 8/16 · `map` 8/16 · `piechart` 6/11 |

The tail is **the HTML and status members**, not the SVG categorical ones. So the problem is not "the family has gone grey" — it is that the members composed of cards, rows, columns and lanes never took the ink the SVG members already take. That is a narrower, cheaper and more defensible brief, and it changes which members F0 costs (§9).

So the design's first move is still not to invent a colour channel. It is to spend the tier that is already the strongest, on the third of the family that does not spend it.

---

## The answer in five sentences

1. **A floor applies to every deck, register or no register: every element that names a mark wears that mark's hue, and no chrome rung ranks itself by going greyer.** That is the correction to the brief's errors 1 and 2, and it is language, not a finish.
2. **A mark's identity never rests on its fill.** Measured above: the fill tiers are not contrast-solved and cannot be; the hue and ink tiers are, in 224/224. This is what lets a finish move the fill without moving the identity.
3. **The three finishes sit on two universal axes** — the *mark axis* (is the hue in the mark's area or on its edge) and the *reach ladder* (how far up the type-and-reference ladder the hue travels). Both are present on most of the 21, but **not all** — §8 names the members where a pair converges, rather than asserting they do not.
4. **`pigment` · `ink` · `ground`** — full pigment stopping at the naming rung; a drawn mark reaching the value rung; full pigment reaching all the way to the reference and the ground.
5. **Reach and loudness are independent, and the trio is built to prove it**: the finish that reaches furthest is the quietest, and the one that reaches least has the highest peak.

---

## 1 · The floor — what applies with or without a register

These are the language. They are not presetable, because they are the corrections the brief demands, and a preset that could switch them off would be a preset that changes whether a chart can be read.

**F0 — every element that NAMES a mark wears that mark's hue.**
Direct label, series name, key label *and* key swatch, stage name, node title, column head, stage dot. `--chart-cat-N-ink` where the text sits on the slide; `--cat-on-fill` / `--cat-on-mark` where it sits on a categorical surface; `--state-X-ink` for semantic marks. Five members already reach 100% on the keyed metric — `line`, `matrix-grid`, `roadmap`, `scatter`, `word-cloud` — and `line.styles.css`'s own comment states the rule: *"`-ink` rather than `-hue` here… A name set in the raw graphical hue would sit at the 3:1 stroke floor, which is legal for a line and not for a word."* F0 generalises that sentence, and the members it is *for* are the nine in the weak tail above.

**F1 — a chrome rung never ranks itself by going greyer.** A rung is quieter than the one above because it is lower in VALUE, never because it has been drained of hue. This is the brief's error 2 stated as a construction rule, and it is a prohibition, not a tint: it bars `--accent` on furniture and bars a rung that drops chroma to signal subordination. **It does not itself tint anything.** The tinted-furniture channel — ticks 30% toward the lead ink, rules 18% toward the lead hue — is **`ground`'s signature, not the floor** (§3), and the earlier draft's presentation of `ground`'s measurements as floor evidence was a contradiction with its own default token block. Those numbers now live where they belong, in §3, with the caveat that they are single-value readings whose 14-theme sweep is not yet run (§10).

**F2 — a mark's identity never rests on its fill alone.** Every categorical mark carries its hue on its EDGE (`--chart-cat-N-hue`, 3:1 in 224/224) and in the WORD that names it (`--chart-cat-N-ink`, 4.5:1 in 224/224), whatever its fill is doing. This resolves *Text-bearing × saturation* as a rule instead of a per-member exception, and it is what makes the `ink` finish safe rather than a downgrade.

**F3 — the grouping rule**, applied per member in §4.

**F4 — one emitter contract.** Every categorical mark **and every element that names one** carries `data-cat` (0-based) or `data-s`. Measured this session: `data-cat` is emitted by five transforms (`bar`, `bullet`, `line`, `scatter`, `stacked-bar`) — `piechart.transform.js` mentions it only in a comment and emits none; `data-s` by eight; **nine members emit neither** (`funnel`, `journey`, `map`, `matrix-grid`, `piechart`, `quadrant`, `radar`, `roadmap`, `word-cloud`); and **exactly two members stamp a slot hook on a TEXT element**. F4's second clause — *the naming text needs the hook too* — is the part nobody has written down, and it is why colour stops at the mark's edge on the weak tail.

*The correctness layer from the failed spec survives unchanged inside the floor:* the dome dies on pie and quadrant, radar keeps its alpha, and `matrix-grid`'s colour moves to its cells rather than being stripped from its rows.

---

## 2 · Why exactly three, and on which axes

Two axes are present on most of the 21, and only two:

- **The mark axis.** Where in the mark the hue lives — filling its area, or drawing its edge. Binary by construction: an intermediate ("a bit less fill") is precisely the invisible variation that sank the four-finish attempt, which differed on `.55` versus `1` furniture opacity and a corner radius. It is **inert on `word-cloud`** (the mark *is* text) and on the three members whose encoding is a magnitude ramp (§5).
- **The reach ladder.** How far the hue travels up the roles the reader depends on:

  > **rung 1** the mark's own edge · **rung 2** the word that NAMES the mark · **rung 3** the VALUE printed at the mark, and the key's value · **rung 4** the reference — tick, axis title, gridline, rule · **rung 5** the ground

Two values × three useful depths gives six cells. Three are coherent; three are contradictions:

| cell | verdict |
|---|---|
| pigment + rung 2 | **`pigment`** |
| drawn + rung 3 | **`ink`** |
| pigment + rung 5 | **`ground`** |
| pigment + rung 3 | `pigment` with a coloured number and nothing else changed — a difference nobody names |
| drawn + rung 2 | a chart whose marks have given up their area and whose type has not taken it up: the grey chart the brief exists to stop |
| drawn + rung 5 | no visual centre — the reference is as chromatic as the mark, and C1's "no chrome rung is louder than the mark" fails |

The three names are painter's materials, so a name says what carries the colour. That is a deliberate departure from `folio`/`plate`/`survey`, which named the *frame*: this brief is about colour, so the names are about pigment.

**Before the three: the two-name shape, and why it is a live alternative.** §7 ships `pigment` as a deliberately empty token block, which means the register's actual content is two deltas — four declarations for `ink`, six for `ground` — while everything that makes the family better (F0–F4, the key fix, the chrome ladder, the relocations) is non-presetable language that restyles all ~50 chart decks whether or not the register exists. The cheaper shape is therefore real and is put on the table here rather than argued past:

> **Land F0–F4 plus the chrome ladder as the language now; ship `ink` as the one new named finish; let the ground ride the `--chart-frame-bg` / `--chart-frame-edge` opt-in modifier the taxonomy has already designed.**

That is one new name instead of three, and it defers the resolver, the Studio control, the front-matter validation, the `base.registers.docs.md` entry and the typo-by-name tests until the language has actually been rendered and judged (§10 — nothing here has been). **What the third name buys that the modifier does not** is a single front-matter word that sets the ground *and* rungs 3–4 together, so ten `ground` charts in a deck read as one system without ten per-slide modifier declarations; and it keeps `--chart-frame-*` free to stay a per-figure override rather than becoming a de facto register. That is a real but modest buy, and it is a reasonable place for the human to overrule this design and take the two-name shape.

---

## 3 · The three finishes — where colour reaches, and what each spends to get there

### `pigment` — colour is area. *(the default)*

**Reaches:** the mark's fill at `--chart-mark-strength: 82%`; its edge at `--chart-cat-N-ink`; every word that names it (F0). It stops there. Value in `--text-heading`; tick and axis title in `--text-muted`; grid and rule off `--border`; no ground.

**Spends:** the whole budget on area. Highest figure/ground contrast in the family; the mark is unambiguously the first thing read, and the type around it is deliberately given no chroma to compete with.

**For:** one chart, one headline, one point. The FT/Economist block-colour page. This is the default because the thing that must reach every existing deck is the *correction* (F0–F4), not a *style*. That does not dissolve the taxonomy's open objection — defaulting a finish restyles every existing deck — it concedes it, and takes the restyle on the grounds that the restyle is the fix.

### `ink` — colour is line and letter.

**Reaches:** rung 3. The mark's fill drops to a wash with no contrast claim, the identity moves onto a **2× hairline edge in `--chart-cat-N-hue`** (the vivid graphical tier, 3:1 in 224/224) and into the coloured word, and the **printed value takes the mark's own ink**, as does the key's value.

**Three constraints on that wash, each of which the earlier draft's flat `26%` broke:**

1. **It never reaches the BACKDROP register.** `--chart-mark-strength` governs the MARK register only. `--chart-cat-N-fill` (24% light / 40% dark) and `--state-X-fill` (24% / 50%) are untouched by any finish, so R1 — *MARK out-ranks BACKDROP* — holds by construction rather than by arithmetic. A flat 26% mark sat level with the light backdrop and 14–24 mix-points *below* the dark one: the figure/ground inversion candidate 5 condemned in `quadrant`, reintroduced by a finish.
2. **It is two numbers, not one.** `26%` light, **`58%` dark** — the dark backdrop is 40–50%, so a wash below ~55% there is louder-backdrop-than-datum again. Both are first guesses; the honest brackets are 20–34% and 55–66% (§10).
3. **It is a no-op under an a11y palette.** Measured on the a11y grey VALUE ramp (`--chart-cat1..8` = `#2e2e2e`…`#929292`), dropping the strength collapses adjacent separation 0.0420 → 0.0137 (light) and 0.0420 → 0.0126 (dark); on light, contrast against the canvas falls from a 2.46–8.19:1 spread to 1.30–1.76:1 with **8 of 8 slots under the 3:1 graphical floor** (against 2 of 8 at 82%); on dark all eight land in 19.03–20.75:1 — eight near-identical near-white blobs. The `!important` texture override that would have saved this covers only `piechart` wedges, `funnel` bands, `scatter` dots/bubbles, `line` areas/bands, `waterfall` bars and key swatches; `bar`, `stacked-bar`, `map`, `quadrant`, `matrix-grid`, `radar` and every HTML card member have no texture rule and would follow the strength straight down. So under the a11y palettes `--chart-mark-strength` resolves to its `pigment` value, exactly as the texture override already overrides the hue. **The alternative precondition — widening the texture override to every AREA member — is the better long-term answer and is a bigger job than the 6 → 8 cycle widening costed in §9; it is not assumed here.** Until one of those lands, an unclamped `ink` crosses the taxonomy's own line: *a preset may change how a chart LOOKS; it may never change whether it can be READ.*

**Also on the edge: it is occlusion-aware.** A SEPARATE mark takes a full 2× rim. A TILED mark — `stacked-bar` segments, pie wedges, `map` regions, `matrix-grid` cells, `roadmap` cells, `gantt` bars, all of which share edges (the taxonomy already classifies `map` and `gantt` as *partial* for this reason) — takes an **outer contour only**, because two 2× rims on a shared boundary is a 4×-weight line, and on the pie it would draw internal spokes from hub to rim at every join. The axis is the one the taxonomy already measured with `isPointInFill`, so the rule stays member-blind. `ink`'s pie is therefore a contoured disc, not the ring the earlier draft described.

**Spends:** it pays for its type reach by giving up the mark's area. Peak chroma actually *rises* — the hue tier is 0.090 against the solid's 0.073 — over a far smaller painted area. This is the *Substrate × weight* interaction spent deliberately: a 2-unit stroke needs more saturation than a 200-unit band to read as equally coloured, and the family already knows it (`line.styles.css` paints `-hue` on the path and `-ink` on the label, for exactly these two reasons, in its own comments).

**For:** the dense analytical slide — eight categories, small multiples, a chart beside prose.

**Why this is not "less colour":** measurably more chroma, reaching more elements, in less area. The tint alone could never carry identity — 224/224 under 3:1 — which is exactly why F2 exists and why `ink` is safe on a colour palette: both of its carriers are contrast-solved everywhere and the fill is decoration by design.

**One honest consequence of constraint 1.** Because the strength does not reach BACKDROP, a BEARING mark (a card, a lane, a row band — the six HTML members) is *inert* under `ink`: its wash does not move. Its reach on those members shrinks to rungs 2–3, and that counts against `ink`'s distinguishability there. §8 reports it rather than hiding it. This also corrects the earlier draft's §5, which claimed a finish varies a bearing mark's ground and then dropped its fill "to a whisper" one sentence later — onto a level `--cat-on-fill` was never solved against.

### `ground` — colour is atmosphere.

**Reaches:** rung 5. Marks stay at full pigment. On top of `pigment`: the value takes the mark's ink; **tick and axis title mix 30% toward the lead ink** (5.72:1 at chroma 0.043, against `--text-muted`'s 5.58:1 at 0.028); **gridlines and rules mix 18% toward the lead hue** (4.71:1 against `--border`'s 4.66:1); and the figure declares a **ground at 4% of the lead hue** — measured chroma 0.016 mean, contrast **1.05:1** against the canvas. That is a temperature, not an identity, and saying so is load-bearing (see §6). The three furniture readings are 14-theme × 2-canvas means; **they have not been broken out per theme, and `onyx` and the a11y palettes need that break-out before this ships** (§10).

**The lead hue is scoped, not always cat-1.** On a CATEGORICAL member it is `--chart-cat-1-hue` / `-ink`. On a STATUS member — `waterfall`, `progress`, `gantt`, `state-chart`, `roadmap`, `journey`, all of which paint from `--state-*` — it resolves to the member's **dominant state hue**, because a categorical blue gridline on a chart with no blue category is a chromatic reference line a reader can plausibly read as a status. On `onyx`, whose whole identity is that categories differ by value rather than hue, the lead hue is the theme's own near-achromatic slot and the tints are correspondingly near-invisible; whether that leaves `ground` distinguishable at all on `onyx` is an open question §10 names, not one this design answers.

**Spends:** it pays for its reach by lowering figure/ground contrast. Extent is highest, peak is lowest. **The finish that reaches furthest is the quietest one** — every element it adds sits at the same *value* as the neutral it replaces. Note that "same value" is a rank claim, not an equality: the tick rises 5.58 → 5.72:1 and the rule 4.66 → 4.71:1, both slightly *up*, with chroma up 1.5×. Nothing changes rank; something does get marginally more contrast, and pretending otherwise would be the kind of round-number claim §10 exists to catch.

**And C1 must be tested as a relation, which it has not been.** *No chrome rung is louder than the mark it frames* compares furniture to the MARK tier on the same theme and canvas — not furniture to the canvas. Measured against the canvas, a tinted tick at 5.72:1 out-contrasts the 82% solid's worst case of 2.45:1, and the solid falls under 3:1 in 36 of 224 combinations. That is either a real C1 violation on those 36 or an artifact of comparing two different relations; it is on the §10 list and it is the single measurement most likely to change `ground`'s numbers.

**For:** a chart in a board pack among dense prose; a chart exported to an unknown surface. It is the finish whose ground the export bakes, which is the taxonomy's Rule F2 given a colour reason instead of a hairline-and-radius reason. **Not yet: the chart over a background image.** `color-mix` yields an opaque colour, so the 4% ground is a solid panel over the photograph rather than a temperature — and the export bakes that panel permanently. That was the taxonomy's own motivating case for a ground, and it is the one case where `ground`'s description does not hold; it needs either an alpha ground or an explicit "on an image slide the ground is off" clause, decided from a render (§10).

**Why one lead hue and not each chart's own.** The ground and the furniture encode nothing; their job is to say *this is a chart in this deck's palette*. One token, one value, every member of a kind, so ten `ground` charts in one deck read as one system. If it tracked each chart's own data it would be an encoding, and then it would owe an a11y substitution it cannot pay.

---

## 4 · The grouping rule, applied to all 21

> A group shares one hue. A singular may own one. **A singular takes a hue only when it is directly labelled** — that clause is what keeps a 40-point scatter from becoming confetti, and it is a rule, not a member exception.

| member | the group | singulars? |
|---|---|---|
| `bar` | the series — **one group, one hue, spent confidently** (grouped variant: one per series) | no |
| `stacked-bar` | one per PART; the part keeps its hue across every bar | no |
| `waterfall` | three semantic groups — up / down / total (`data-s`) | no |
| `funnel` | — | **six** — each stage appears once, so each may own a slot. The rule *ratifies* today's funnel |
| `bullet` | measure + qualitative bands; separation is by VALUE, per `a11y-base.css`'s own note | the target tick |
| `piechart` | — | **each slice**; past 8 the channel wraps and the member owes direct labels instead |
| `map` | **one** MAGNITUDE group — 175 regions are not 175 categories; a sequential ramp of one hue | no |
| `radar` | one per series (3) | no |
| `quadrant` | **the entities in each zone** — four groups. The zone itself is a reference region: it goes to a neutral value ramp and **its hue moves to the dots and the corner label that names them**. Colour relocated, not removed | no |
| `scatter` | unlabelled points: one group | **labelled entities** — each takes a slot (≤8) |
| `line` | one per series — already correct | no |
| `slope` | — | **each labelled entity**; its endpoint values take its own ink |
| `gantt` | semantic groups + the lane | no |
| `progress` | the status per row; the row label takes the state ink | no |
| `state-chart` | semantic groups | no |
| `timeline-list` | — | **each stage**; the dot is coloured today, the item title is not (1/5 keyed) |
| `kanban` | **the column** — cards in a column share the column's hue, carried by the head, the card's accent edge and the card's title. Measured 2 of 8 text elements keyed and 0 of 4 marks chromatic: the emptiest member, filled by the rule | no |
| `roadmap` | semantic groups | no |
| `matrix-grid` | **the marked cells — one group, one hue** (a path through the grid); rows take neutral chrome | no |
| `journey` | stage groups + a mood ramp (magnitude, one hue) | no |
| `word-cloud` | **the rank tier** — words in a tier share a hue, so hue is redundant with size rather than decorative | (words, grouped by tier) |

**The eight-slot assumption is not universal, and that is a cost, not a detail.** `funnel.styles.css` cycles `nth-of-type(6n + 1..6)` and its own comment cites a six-hue cap (Wong 2011); `piechart` documents an 11-slice ceiling; `map` keys off `--region-hue`. None uses `data-cat`. If the six-hue cap survives the move to slot rules — and this design says it should, because it is a legibility judgment the member earned — then the seam needs a **per-member cycle length**, which is a member name in an architecture §7 promises will carry none. The honest form is a single per-member custom property (`--chart-slot-cycle: 6`) set in the member's own stylesheet and read by the shared rules; that keeps the *slot rules* member-blind while admitting the family has two cycle lengths.

---

## 5 · The interactions, each closed by a rule

**Occlusion × hue — radar, and every tiled member.** *A LAYERED member's alpha ramp is a constant of the language, not of a finish.* All three finishes leave radar's 0.10 → 0.20 ramp exactly where it is and vary its **stroke weight** and its **web's hue source** instead. The same axis governs `ink`'s edge rule: separate marks take a rim, tiled marks take an outer contour (§3).

**Naming × ink — the key.** *A key entry and the mark it names take their colour from the same token: swatch `var(--chart-cat-N-mark)`, label `var(--chart-cat-N-ink)`.* Today `lib/components/chart/_chart-family/svg-legend.js` computes `catAttr` and stamps it on the swatch `<rect>` while `.chart-key-label` beside it is `fill: var(--text-body)` (`chart-family.css:1069`) for every keyed member — the reader is handed a colour and then made to match it back. The fix is **the same string appended to the sibling `<text>`, one line in the one shared key builder**, serving every member that calls it. The swatch side collapses a confirmed drift: `stacked-bar` mixes 82% into `--chart-cat-base`, while `funnel`, `piechart`, `map` and `quadrant` mix 82% into `--bg` — on the dark canvas those are black and navy, so the same "82% solid" renders two different colours in one key rail today.

**Text-bearing × saturation — R0.** *A BEARING mark's fill never carries identity, and no finish moves it.* `--chart-mark-strength` governs the MARK register only, so a card's wash is a constant. The identity lives on the accent edge and in the title: under `pigment` the accent stripe is full ink at `--chart-fill-accent`; under `ink` the outline goes to full hue at 2× and the wash stays put; under `ground` the wash stays put and the lane rules take the hue. `--cat-on-fill` / `--cat-on-mark` are what text on a mark uses in every finish, and **no finish may put text on a level those two inks were not solved against** — which is now true by construction rather than by promise.

**Substrate × weight.** *A finish declares one strength per SUBSTRATE, never one per member.* AREA takes `--chart-mark-strength`; STROKE and POINT take `--chart-cat-N-hue` outright, because a 0.7-unit stroke at the 82% mix is a grey line.

**Magnitude × strength — the clause the earlier draft was missing.** *A magnitude ramp declares a strength RANGE, and a finish scales the range rather than replacing it.* `map` is a sequential ramp of one hue, `journey` carries a mood ramp, `matrix-grid`'s cells are magnitude, and `progress`'s gradient is `20% + pct * 0.52`, written in `progress.styles.css` and coupled to `--pct` rather than to any family token. A single global strength would either flatten those ramps — destroying the magnitude encoding — or be ignored by them, leaving `ink` and `pigment` identical on four more members. So a ramp member declares `--chart-ramp-lo` / `--chart-ramp-hi`, a finish multiplies both endpoints by the same factor its AREA strength implies, and `progress` keeps the carve-out candidate 5's F1 clause 2 already granted it on exactly this ground.

---

## 6 · The a11y and print substitution, per finish

The ladder is unchanged — position → direct label → value → shape/line-style → texture, texture last — and the mark channels are identical in all three: texture on AREA, dash on STROKE, shape on POINT, all keyed on `data-cat`, all widened **6 → 8** to match the palette (the engine emits `latt-a11y-chart-tex-1..8`; `themes/a11y-base.css` wires six via `6n+…` and `data-cat="0..5"`, so categories 7–8 silently wear 1–2 today).

What differs per finish is what happens to the **ink** when hue is gone:

- **`pigment`** — the label's hue was redundant to the texture on the mark beside it. Nothing is owed; the label falls to `--text-body`.
- **`ink`** — the identity was *on* the edge and *in* the word, so both need a substitute: the edge takes the **dash cycle** (8 wide), and the word takes rung 4 of the ladder as **weight**, not texture — text cannot take a pattern, which `word-cloud` already proves. `ink` is therefore the finish that most needs the dash cycle widened. **And its wash is clamped to `pigment`'s strength under an a11y palette** (§3, constraint 3): the texture override covers six members, not all of them, so the strength cannot be allowed to move on the rest.
- **`ground`** — the ground and the furniture tint collapse to the theme's own neutrals and **nothing is lost**, because they encode nothing by construction (chroma 0.016, 1.05:1). That is the payoff for keeping the ground non-encoding: the a11y substitution is free.

**Stated plainly, because it would otherwise look like a dodge:** where the `!important` texture override does apply, it replaces the mark's fill outright, so the *mark axis* collapses and those members paint the same textured mark under all three finishes. The finishes stay distinguishable there on the *reach ladder* — which rung the type reaches, and whether there is a ground. Hue is gone for that audience by definition; the brief's own principle is that the substitution serves one audience and is never the design for everyone.

**Print** is identical, plus `ground` bakes its ground into the export, which is what makes it the export-safe finish — and which puts it under CLAUDE.md's export sign-off gate. `ink`'s pairing of a light wash with 2× hairlines is the classic combination that vanishes on a conference-room projector and on a grayscale laser print of a board pack; that is asserted nowhere in this design and sits on the §10 list.

---

## 7 · The architecture — a finish is token declarations, one member name

Three blocks, in `chart-family.css` beside the canonical-fill constants, plus `section[data-charts="…"]` rules in `base.tokens.css` following the exact shape `section[data-cards="center"] { --cards-align: center; }` already sets.

**The missing name.** The family has `--chart-cat-N-fill` (pale surface) and `--chart-cat-N-ink` (text on the slide). The saturated AREA between them is hand-written six times at two different bases. Give it the third name of the vocabulary it is already half-using (HARD RULE #11):

```css
--chart-cat-1-mark: color-mix(in oklab, var(--chart-cat-1-hue)
                    var(--chart-mark-strength), var(--chart-cat-base));   /* ×8 */
```

**The slot rules — eight for categories, ten for statuses, naming no member.** Custom properties substitute at *use* time in the consuming element's own cascade, the same mechanism `--fill-hue` / `--fill-ink` already ride:

```css
:is(section.chart-frame, figure.chart-frame) [data-cat="0"] {
  --mark-mark: var(--chart-cat-1-mark);
  --mark-hue:  var(--chart-cat-1-hue);
  --mark-ink:  var(--chart-cat-1-ink);
}
```

**The finish constants (defaults are `pigment`):**

```css
--chart-mark-strength:      82%;   /* AREA fill, MARK register only, light  */
--chart-mark-strength-dark: 82%;   /* the same, dark canvas                 */
--chart-edge-source: var(--mark-ink);      /* which tier the edge takes     */
--chart-edge-w: 1;                         /* × --chart-hairline            */
--chart-edge-shape: rim;                   /* rim | contour (occlusion)     */
--chart-ink-value: var(--text-heading);    /* rung 3                        */
--chart-ink-tick:  var(--text-muted);      /* rung 4                        */
--chart-ink-title: var(--text-muted);      /* rung 4                        */
--chart-rule-hue:  var(--border);          /* rung 4                        */
--chart-frame-bg:  var(--bg);              /* rung 5                        */
--chart-lead-hue:  var(--chart-cat-1-hue); /* status members re-point these */
--chart-lead-ink:  var(--chart-cat-1-ink);
```

```css
section[data-charts="pigment"] { }   /* deliberately empty — the default IS pigment */

section[data-charts="ink"] {
  --chart-mark-strength: 26%;
  --chart-mark-strength-dark: 58%;
  --chart-edge-source: var(--mark-hue);
  --chart-edge-w: 2;
  --chart-ink-value: var(--mark-ink);
}

section[data-charts="ground"] {
  --chart-ink-value:  var(--mark-ink);
  --chart-ink-tick:   color-mix(in oklab, var(--chart-lead-ink) 30%, var(--text-muted));
  --chart-ink-title:  color-mix(in oklab, var(--chart-lead-ink) 30%, var(--text-muted));
  --chart-rule-hue:   color-mix(in oklab, var(--chart-lead-hue) 18%, var(--border));
  --chart-frame-bg:   color-mix(in oklab, var(--chart-lead-hue)  4%, var(--bg));
  --chart-frame-edge: color-mix(in oklab, var(--chart-lead-hue) 22%, var(--border));
}
```

Two clamps ride alongside, and both are part of the architecture rather than footnotes: the a11y palettes reset `--chart-mark-strength` to its `pigment` value, and `funnel` sets `--chart-slot-cycle: 6` in its own stylesheet (§4). Roughly **30 declarations, 18 slot rules, three finish blocks, and one member name** — the funnel's cycle length, admitted rather than hidden. A percentage inside `color-mix` via a custom property is the family's own existing idiom (`--chart-fill-top-l: 20%`), so nothing new is being asked of the cascade.

The register itself is the fifteenth of a shipped kind: `charts:` in front matter, a ~70–140-line resolver beside `resolve-cards.js` / `resolve-finish.js`, a closed set of three names, a typo caught by name, a per-slide override, a Studio control.

---

## 8 · How the three stay distinguishable — walked, and where they converge

The mechanism, named: **(a)** whether the mark's hue lives in its area or on its edge, **(b)** whether the printed number is in the mark's hue or in heading ink, **(c)** whether the reference and the ground carry a trace. None is a gradient.

**The SVG members with furniture** — all three levers live:

`scatter` — `pigment`: solid ink dots with a canvas ring, each labelled entity its own slot, labels matching, grid/ticks/titles in theme chrome, no ground. `ink`: hollow dots — a wash inside a 2× full-hue rim — labels in ink, size-key values in ink, trend line off the lead hue. `ground`: solid dots, plus tinted gridlines, tinted ticks and axis titles, and a tinted plot ground.

`funnel` — `pigment`: six 82% bands, canvas hairline between, stage names in each band's ink, values in heading ink. `ink`: six washed bands under a single 2× outer contour (they tile — no per-band rim), names *and* values in band ink, conversion percentages in band ink. `ground`: six 82% bands on a tinted panel, values in band ink, conversion percentages and the caption rule tinted.

`piechart` — `pigment`: flat 82% wedges (dome dead), key swatch finally matching, key label in ink. `ink`: washed wedges under one 2× outer contour — a contoured disc, not a ring — key label and key value both in ink. `ground`: 82% wedges on a tinted disc ground, key values in ink, the key's spine tinted.

`bar`, `stacked-bar`, `line`, `slope`, `bullet`, `waterfall`, `radar`, `quadrant` behave as `scatter` does — each has ticks or a rule for `ground` to spend and an area or stroke for `ink` to move.

**The members the earlier draft asserted and did not walk.** These are the honest cases, and three of them converge:

| member | `pigment` → `ink` | `pigment` → `ground` | verdict |
|---|---|---|---|
| `kanban` | column head rule and card accent edge go to full hue at 2×; card wash unmoved (R0) | column head takes a tinted rule; the board takes a tinted ground; **no ticks, no printed value** | both differ, `ground` thinly — it needs the head rule to count as a rung-4 spend, which this design grants it |
| `timeline-list` | stage dot becomes a 2× hollow ring; item title takes the stage ink either way (F0) | the spine takes the tinted rule; a tinted lane ground | both differ |
| `roadmap` | cells tile → outer contour per lane, no per-cell rim | lane rules tinted, board ground tinted | `ink`'s difference is faint on a member that is all tiling; report it |
| `state-chart` | node outlines to 2× full hue, node wash unmoved | edges take the tinted rule, board ground tinted | both differ |
| `matrix-grid` | marked cells tile → contour around the marked path | row rules tinted, grid ground tinted | both differ |
| `journey` | mood ramp scaled, not replaced (§5); stage dots ringed | stage rule and ground tinted | `ink` differs only via the ramp factor — weak |
| `word-cloud` | **nothing** — the mark IS text and already takes ink; the mark axis is inert and there is no rung 3 or 4 | **nothing but the figure ground**, at 1.05:1 | **`pigment` ≡ `ink` here, and `ground` differs by a hair.** Reported, not papered over |
| `progress` | ramp scaled; row label takes state ink either way | row rules and ground tinted | `ink` weak |
| `map` | ramp scaled; region contours at 2× | graticule and ground tinted | both differ |

So the count is: **`ink` is inert on `word-cloud` and weak on `journey`, `progress` and `roadmap`; `ground` leans on the figure ground alone on `word-cloud`.** *"Only `plate` was distinguishable, and only because it had a ground"* is the failed spec's epitaph, and this is where the same risk lives here. Two responses, both concrete: give `word-cloud` a rung it can spend (the tier rule under the cloud, tinted under `ground`; the tier's weight step under `ink`), and accept the four weak cells as measured cost rather than asserting them away.

**And the distinguishability is gateable, with a tool that already exists.** `tools/chart-colour-reach.js`'s own docblock states the acceptance criterion: *"two finishes that produce the same reach on the same chart are two names for one finish."* Give it a `--finish` arm and require three distinct **keyed-reach** profiles across all 21 members — keyed, not chroma, since the chroma reading is the one the tool's author retired. That is a check inside an existing diagnostic — it changes what a gate *finds*, not what the pipeline *runs*.

---

## 9 · Cost

**Committed artifacts.** **47 of the 168 committed `examples/*.pdf`** contain at least one chart member (measured: 48 example decks declare a chart `_class`, 47 have a committed PDF). Plus `chart.gallery.{light,dark}.pdf` and the cross-bucket showcase decks. HARD RULE #8 graduates the six long-running galleries in a separate post-review commit; HARD RULE #9 owes `examples/<slug>.md` + PDF, 6–10 slides, showing all three finishes on a gradient-free member in both modes.

**Members changed, by rule.**

| rule | members | what they pay |
|---|---|---|
| F0 — naming ink | **the nine-member weak tail** (`progress` 1/6, `timeline-list` 1/5, `kanban` 2/8, `state-chart` 6/24, `quadrant` 9/19, `bar` 4/8, `gantt` 8/16, `map` 8/16, `piechart` 6/11), plus partial gains on `funnel`, `radar`, `slope`, `bullet`, `waterfall`. **Five members already at 100%** (`line`, `matrix-grid`, `roadmap`, `scatter`, `word-cloud`) pay nothing | one `fill:`/`color:` per naming role, pointed at `var(--mark-ink)` |
| F4 — emitter contract | **9** emit no slot hook at all; **19** need one on their naming TEXT | one attribute per emitted element |
| Key | **1 line** in `svg-legend.js` serves every keyed member's label; **8** members re-point `swatchFill` to `var(--chart-cat-N-mark)` | |
| Chrome ladder | **8 family rules** (`.cart-grid`, `.cart-zero`, `.cart-axis`, `.cart-tick`, `.cart-cat`, `.cart-value`, `.cart-series`, `.cart-axis-title`) read tokens instead of literals — folding in `bar`'s zero rule in `--text-body` and `gantt`'s ticks in `--accent` | zero member rules added |
| Relocations | `quadrant`, `matrix-grid`, `scatter`, `kanban`, `slope`, `timeline-list`, `word-cloud` | 7 members |
| Ramp clause | `map`, `journey`, `matrix-grid`, `progress` declare `--chart-ramp-lo/-hi` | 4 members |
| Non-colour width | dash + texture cycles 6 → 8; point-shape cycle 8-wide from day one, drawn not typed (HARD RULE #29) | |
| **`ink` precondition** | the a11y texture override covers 6 members; the other AREA members are clamped instead. **Widening the override to all of them is the better fix and is not in this cost** | flagged, not costed |

**What a NEW chart pays — three obligations and nothing else.** (1) Stamp `data-cat`/`data-s` on each mark *and each element that names one*. (2) Paint from `var(--mark-mark)` / `var(--chart-edge-source)` / `var(--mark-ink)` rather than a hand-written mix. (3) Route every text it prints through one of the eight chrome roles. Do those and it inherits all three finishes with zero new rules. A member that does none is not broken — it is simply ungoverned, which is the posture `resolve-cards.js` already takes.

**Gates and sign-offs.** `ink`'s 2× edge grows a mark's painted extent by half a unit each side — that is `npm run check:jank` and `check-chart-fit`, and the funnel's 0.75-unit canvas separator is the tightest case. `ground` bakes a ground into export bytes, so it goes through CLAUDE.md's **export sign-off** with dark and light renders. Everything else rides existing gates: `chart-contrast.test.js` gains an arm for `--chart-cat-N-mark` at each finish's strength on each canvas, and `check-ownership.js` gains "no `color-mix(… 82% …)` outside the token", the same shape as `checkHexLiterals`. No new CI job or step is proposed.

---

## 10 · What I have not verified

Per HARD RULE #23: **every number above is a resolved-token measurement, a tool run, or a repo count; nothing here has been rendered.** I did not build a deck, and I did not look at one. What needs a render before anyone believes it:

- That `pigment` and `ground` are tellable apart on `funnel`, `piechart` and `kanban` — the members with no furniture, where `ground` leans hardest on the value rung and the panel.
- That `ink`'s wash reads as a deliberate choice rather than a chart that failed to load, on the dark canvas especially.
- The conservation claim in §3 — that the three carry comparable colour *mass* — argued from per-element chroma and **not** measured, because mass needs painted area and area needs a render.
- **`ground` over a background-image slide.** `color-mix` is opaque, so the 4% ground is a panel, not a temperature — and the export bakes it. This is `ground`'s own motivating case and the one where its description fails.
- **`ink` at projection scale and in grayscale.** A light wash plus 2× hairlines is the classic disappearing combination; §6 currently says print is "identical" and measures no stroke weight. Render at 1280×720 and to grayscale before that claim goes in a PR.
- **C1 as a relation** — furniture contrast against the MARK tier, per theme and canvas, not against the canvas. The tinted tick at 5.72:1 against a solid whose worst case is 2.45:1 is either a violation on those 36 combinations or an artifact of the comparison.
- **The `ground` mixes across all 14 themes × 2 canvases**, reported per theme, with `onyx` and the a11y palettes broken out. Single unattributed means are not enough for a channel that touches every element on the slide, and the 5.72 / 5.58 and 4.71 / 4.66 pairs above name no theme.

**The three places I would expect to be wrong.** `ground`'s 4% is set from a chroma reading, not from a slide — it may need 5–6% on light canvases where 1.05:1 disappears into paper. `ink`'s 26% light / 58% dark is a first guess at "a wash with no contrast claim"; the honest brackets are 20–34% and 55–66%, and the deciding question is whether the wash still reads as belonging to its outline on `onyx`, where the tint tier's adjacent separation is only 0.014 (light) and 0.032 (dark). And the whole three-name shape may be one name too many — §2 puts the two-name alternative on the table with its costs, and the render is what should settle it.