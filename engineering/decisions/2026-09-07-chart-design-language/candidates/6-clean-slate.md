<!-- Design-competition candidate, 2026-09-07. Track 6 — clean-slate.
     Title: Two Laws and a Ladder (revision 2)
     This is a PROPOSAL, not a decision. The judged ranking and the
     verdict live in ../judgement.md; the brief it answers is in
     ../../2026-09-07-chart-design-language.md. Nothing here is
     implemented until a candidate is picked. -->

# Two Laws and a Ladder

**A chart design language for Lattice's 21-member family, designed from the boardroom goal and mapped back.**

---

## The answer, up front

Every rule in this language falls out of one question: **what job is this paint doing for the reader?** Paint that answers a question the reader is asking is a *channel*. Paint that answers none is *finish*. The language is two laws that separate them, one four-rung ladder that ranks them, and eight rules keyed on data shape that follow mechanically.

**The radial dome does not survive.** That is not a judgment call — I measured it, and on pie and quadrant the fill *is* the mark, so a fill measurement is the whole read. The dome is swamped on cuoio and indaco *with no color-vision simulation at all* (pie 0.232 self-range vs 0.080 separation on cuoio; quadrant 0.214 vs 0.071 on indaco).

**The vertical wash also goes — but not for the reason an earlier draft gave, and the correction matters.** A washed bar's category is carried on its *per-series ink edge* (`bar.styles.css` sets `stroke: var(--chart-cat-N-ink)` per series; `chart-family.css` states the recipe outright: "Color rides the edge; the wash only tints"). `chart-mark-separation.js`'s `paintOf` scores gradient stops and falls back to `stroke` only when fill is `none`, so on a washed bar it never reads the edge at all. Measured with a patched edge arm on a grouped bar, unsimulated: cuoio fill separation 0.086–0.090 against a 0.076–0.114 self-range (SWAMPED) — but **edge** separation 0.197–0.223; onyx fill 0.069–0.100 — edge 0.166–0.253. The edge clears the palette's own 0.15 distinctness floor by 30–70% on both themes. **Test A, as the tool applies it, does not condemn the wash.** Nor does the "tall bar's top reads differently from a short bar's top" argument: `buildFillDefs` emits `<linearGradient x1=0 y1=0 x2=0 y2=1>` at the default `gradientUnits="objectBoundingBox"`, so every bar's ramp spans its own box and every top stop is the identical color. That half of Test B is false and is struck.

**The wash dies on the surviving half of Test B plus coherence and reference practice — and I say so plainly rather than dressing it as a measurement.** Three options are scored in §Law 3; flat wins on members changed, decks rebuilt and export sign-off rounds, and on the fact that our reference set (FT, Economist, Datawrapper, Bloomberg) is flat. It does **not** win on a demonstrated reader defect, and nobody should authorize it believing otherwise.

**Radar keeps its radial gradient, and the instinct behind that is right: radar's is not a dome.** It was flattened to a near-uniform alpha wash (0.10 → 0.14 → 0.20) during the kanban-finish standardization, and its own source comment records the change from a 0.03 → 0.36 rim-dense ramp. **The 0.000 self-range the tool reports is an artifact, not evidence**: `paintOf` reads `stopColor` and ignores `stop-opacity`, and radar's three stops are one color, so 0.000 is arithmetically forced. The argument for keeping it is the source comment and the 10-point alpha span, composited over the canvas — not the tool's number.

So: **one finish survives, on four members, and only where the fill is not a channel.**

---

# Part I — Designed from nothing: the four things a chart language must fix

Start from the boardroom goal and forget the tree exists. A projected chart has one job: a reader with eight seconds and a bad viewing angle must extract the claim. Everything else is cost.

## Law 1 — The Channel Law: one question, one channel; paint that answers nothing is deleted

- **No variable gets two channels** unless the second is a redundancy the reader needs (a status fill *plus* its text label; a diverging bar's side *plus* its sign).
- **No channel is spent on a variable the reader isn't asking about.** A single-series bar chart whose bars are eight different hues encodes nothing with hue. Neither does a table whose row labels cycle the categorical palette.

This law already exists in the tree, twice, unnamed. `bar.transform.js`'s header states it as principle 3 ("ONE SERIES IS ONE HUE"), and `2026-06-22-kanban-chart-redesign.md` records fixing exactly this defect ("color was spent decoratively on CATEGORY, the card's least decision-relevant axis"). `matrix-grid` and `word-cloud` re-introduced it because the principle lived in one component's comment instead of the family's contract.

## Law 2 — The Rank Law: at every pixel, the datum is the loudest thing

Figure must out-rank ground, locally and measurably. That gives the **Ladder** — four tiers, each strictly quieter than the one above, each a token:

| Rung | What it is | Members' examples | Token |
|---|---|---|---|
| **1. Mark** | The datum | bar, wedge, dot, node, card | `--chart-cat-N-fill` / `-ink` (exists) |
| **2. Reference** | A line the datum is read *against* | zero rule, target, threshold, quadrant split | `--chart-ref-strength` |
| **3. Scale** | The measuring furniture | axis line, gridlines, polar web | `--chart-axis-strength`, `--chart-grid-strength` |
| **4. Field** | A backdrop region that *names* an area | quadrant zones, bullet bands, line bands, kanban column tint | `--chart-field-strength` |

**The rungs derive from one base, and the order is gated — otherwise it is four independently overridable numbers.** Today's literals use two bases: `.cart-zero` mixes toward `--text-body` at 42%, `.cart-axis` and `.cart-grid` toward `--border` at 88% and 62%. Those percentages do not order themselves, and a theme that re-tunes `--border` can silently push the axis above the zero rule the marks are read against. So all four strengths resolve against **one base** (`--text-body`, the ink the marks are read on) with a monotone ratio, and the `--rank` arm proposed below asserts **rung 1 > 2 > 3 > 4 in resolved OKLab contrast, per theme** — not just mark-vs-field. Day-one values are chosen to land within a hair of today's rendered weights; where a rebase against one base moves a pixel, the Ladder gate is what says so.

The fourth rung is where the quadrant breaks: its zones paint 42% → 82% of the vivid hue — the *field* rung painted at *mark* strength, the figure/ground inversion stated exactly.

Ladder placement is keyed on data shape, not member name: **anything a reader compares marks against is rung 2 or 3; anything that only labels a region is rung 4.**

## Law 3 — The two gradient tests, and the three options scored

A gradient is *within-mark variation*. It survives only if it passes **both** tests.

**Test A — the Channel test.** Does the variation ride the same perceptual channel (hue or value) as an encoding on this chart? **A mark's read is fill AND stroke**, so Test A must be measured on the composite. `chart-mark-separation.js` scores fill only; **an edge/composite arm is a prerequisite of any Test A verdict** and is slice-1 work. (The tool's docblock already flags that it scores neither position nor shape; the same caveat now applies to the edge.)

**Test B — the Axis test.** Does the gradient vary *along an axis the reader measures*? For a vertical bar the answer is yes: the ramp runs parallel to the value axis, and the bar's top — the point the reader reads — is the palest part of the fill on a light canvas (`--chart-fill-top-l: 20%` against `--chart-fill-bottom-l: 38%`), so the readable end is the weakest against the canvas. **That is the whole of Test B's case.** The stronger claim an earlier draft made — that a tall bar's top differs from a short bar's — is false under `objectBoundingBox` and is withdrawn.

Applied:

| Gradient | Test A (fill + edge) | Test B | Verdict |
|---|---|---|---|
| Radial dome — piechart, quadrant (42/58/82 into `--chart-cat-base`) | **fails** — fill is the entire mark; 0.21–0.29 self-range vs 0.07–0.14 separation, unsimulated, on cuoio + indaco | n/a | **Deleted** |
| Vertical wash on a vertical value axis — bar, waterfall, stacked-bar | **passes** — the edge carries category at 0.166–0.253, clearing the 0.15 floor | **fails** — the ramp runs along the measured axis, palest at the read end | **Deleted on Test B + coherence; see the option scoring below** |
| Vertical wash on a horizontal/no magnitude axis — gantt, timeline-list, state-chart | **passes** — the fill carries *status*, and every status surface here prints a text label | **passes** — orthogonal to the length axis | **Kept**, capped |
| `progress`'s horizontal `--pct` ramp | n/a (single hue) | **fails** — see below | **Flattened** |
| Radar's radial alpha (0.10/0.14/0.20) | **passes** — one color, ~10 points of alpha, composited flat over every curated canvas | n/a — no measured radial axis | **Kept**, re-specified as flat alpha |

### The three options, scored on the same axes

| Option | Reader defect fixed | Members changed | Decks rebuilt | Export sign-off rounds |
|---|---|---|---|---|
| **A. Keep both gradients** | none | 0 | 0 | 0 |
| **B. One wash + one edge, family-wide** (the variant `chart-family.style.md` already prototyped and held) | dome deleted; bar/stacked-bar edge mismatch fixed | ~8 | ~43 (pie/quadrant set) | 1–2 |
| **C. Flat categorical fill** (this design) | dome deleted; edge mismatch fixed; texture channel unblocked | 6 material, 21 touched | 76 | 5 |

**Option B is real and was never scored in the previous draft.** It fixes the bar/stacked-bar exhibit — which is an **edge** mismatch (stacked-bar has no ink edge, bar does), not a finish mismatch — while touching roughly half the marks.

**C wins, and here is the honest reason.** Not a measured reader defect on the wash: there isn't one, per Test A above. It wins because (1) a flat fill is a plain `var()`, which is the *only* thing that unblocks the universal texture channel (§7) — B leaves pie and quadrant emitting `style="fill:url(#…)"`, and an inline style outranks any non-`!important` rule, so B preserves the 87-rule `!important` arms race; (2) the reference set for this bar is flat, and depth there is carried by frame, type and palette, none of which Lattice is short of; (3) one finish rule beats two. **If the 5-round export cost is judged too high, B is a coherent fallback that keeps most of §1–§4 and loses §7.** That is a decision for the batched round in Part V, not one I should take alone.

**What I am giving up, honestly.** The dome buys a dimensional read on the pie — `chart-family.style.md` says so, and it is true. The flat pie will look plainer.

**Why kept-but-capped, not kept-as-is.** A finish that is allowed to grow becomes a channel by accident — that is how the dome got to 40 percentage points of travel. So the surviving wash gets a ceiling token, `--chart-fill-range`. **The cap is keyed to measurement, not to a borrowed design target.** An earlier draft set it at "under 40% of the 0.15 adjacent-slot distinctness floor" — but 0.15 is what the palette *aims* for, not what occurs: measured separation among the members keeping the wash runs 0.069–0.100 on onyx unsimulated, and 0.000–0.030 under achromatopsia. A 0.06 self-range swamps a 0.069 separation by Test A's own inequality. Two consequences: **the cap is 0.03 OKLab**, half the measured worst case among wash-keeping members; and **Test A is explicitly not the governing test for status members** — their hue is redundant to a printed text label by construction, which is why `chart-mark-separation.js` skips them. The cap exists to stop finish drifting into channel, not to satisfy an inequality that does not apply. Today's wash is 18 percentage points of hue-mix; the cap lands it near 6.

## Law 4 — Declared, not inferred

Every property this language assigns is **declared per member in its manifest and gated**, never inferred from substrate. The family already does this once, correctly: `render: svg | html | hybrid` with a `renderNote`, checked against the real export by `npm run check:render-nature`. Motion today does the opposite — `chartToScene` infers a scene from "is there an `<svg>`", so five HTML members are silently skipped and journey is skipped by accident because its *first* `<svg>` happens to carry nothing.

---

# Part II — The eight answers

## 1. Mark and fill

| The fill carries… | Finish | Members |
|---|---|---|
| **Category** | **Flat**, always | bar (grouped), stacked-bar, piechart, funnel, quadrant dots, scatter, line areas/bands, slope, map, radar strokes, matrix-grid (§7), word-cloud (§7) |
| **Status, with an adjacent text label** | Flat or a **capped orthogonal wash** | gantt, timeline-list, state-chart, kanban, waterfall's up/down/total, bar (single-series) |
| **Overlap** (series must read through each other) | **Flat alpha**, no stops | radar areas |
| **Nothing** (a named region) | Ladder rung 4, flat | quadrant zones, bullet bands, line bands, kanban column tint |

`bar` single-series carries status-like semantics but goes **flat** anyway, because Test B disqualifies it — and because a member that washes in one variant and not another is the incoherence this language exists to remove.

**`progress` is not exempt, and the previous draft exempted it without argument.** `chart-family.css` records that progress replaces the vertical wash with a *horizontal* gradient whose leading-edge intensity scales with `--pct`, explicitly "double-encoding value as length AND intensity". That is a ramp running along the measured axis, encoding the variable the length already encodes — Test B's exact prohibition, and a Law 1 second-channel besides. **Progress flattens with the rest.** Keeping it would re-open the bar wash on the same reasoning, and the language cannot hold both positions.

**The 42/58/82 dome recipe is spelled out as literal percentages in two transform files** (`piechart.transform.js`, `quadrant.transform.js`) — a HARD RULE #1 violation hiding in plain sight. Deleting it removes the duplication rather than moving it.

**How a mark stays louder than its backdrop — the Rank test, made mechanical.** The `--rank` arm of `chart-mark-separation.js` asserts the full ladder order per theme (Law 2), and for every mark, its OKLab distance from the canvas must exceed the distance of the region *beneath* it by a stated factor. Quadrant fails this today by construction. At rung 4 (~10% hue into canvas) it passes with room.

**Corner radius joins the fill system, with a stated remit.** Eight distinct hand-written radii live in the bucket (`0.46875cqi`, `0.825cqi`, `0.85cqi`, `0.859375cqi`, `0.9375cqi`, `2.25cqi`, `1px`, `2px`) plus `var(--radius-sm)`, `var(--radius-md)`, `var(--pill-radius)`. One token does **not** cover everything there: eleven `50%` values are circular marks, several are one-sided forms (`var(--radius-sm) var(--radius-sm) 0 0`), and one already carries a sanctioned justification comment. So the bucket gets the small set it actually needs — **`--chart-corner-mark`** (rectangular data marks), **`--chart-corner-chip`** (status pills; may resolve to `--pill-radius`), **`--chart-corner-card`** (kanban/roadmap cards) — and **circles and one-sided radii are explicitly out of the token's remit** and stay as authored.

## 2. Type — five roles, not seven

| Role | The question it answers | Face | Size (viewBox units) |
|---|---|---|---|
| `value` | How much? | `--font-display`, 700, tabular | 8 |
| `value-2nd` | How much, secondarily? | `--font-label`, tabular | 6.5 |
| `name` | What is this? | `--font-body` | 7.5 |
| `tick` | Where on the scale? | `--font-label`, tabular | 7 |
| `axis-title` | What does this scale measure? | `--font-label`, 600, uppercase, 0.12em | 6.5 |

**`name` absorbs `category`, `series`, `legend` and `heading`** — one job (naming a mark) differing in *placement*, which is the key model's business (§4). That collapse **is** the fix for the legend split: `gantt`, `journey`, `roadmap`, `state-chart` are already right; `map`, `piechart`, `radar`, `word-cloud` change from `--font-label` to `--font-body`.

**`name` carries a direct-label contract, so the collapse does not discard a rule the CSS states deliberately.** `.cart-series` is 600-weight and colored from the series' own ink so the label and its line read as one hue. That is not placement, it is legibility against a plotted line. **When `name` is used as a direct label it keeps both**: 600 weight and `fill: var(--chart-cat-N-ink)`. The one thing genuinely lost is the separate face, and that loss ships with a before/after in the slice-3 demo deck.

**The sketch objection, checked and dismissed.** `svg-legend.js` routes through `--font-label` so `section.sketch`'s label-voice re-point reskins the key. But `base.sketch.css` re-points **both** `--font-label` and `--font-body` to `--sketch-font-body`, so the sketch finish survives the move intact.

**`axis-title` resolves in favour of the three-member form** — `--font-label`, uppercase, tracked — because an axis caption is chrome *about a scale*. `quadrant`'s `.quadrant-axis-name` changes.

**`value-2nd` is ratified as a role**, not flattened; three members reached it independently. It has **no `.cart-*` selector today**, so it is new surface: one class plus its size entry in the `FS` table (counted in §8).

**What each member owes** — gated by extending `tools/chart-language-census.js` into an assertion:

- Every member prints `name` for every mark whose identity is not otherwise given.
- **Reading task 3 (compare across a scale)** obliges `tick` and `axis-title`.
- **Reading task 2 (read a level)** obliges `value` at the mark and *forbids* `tick`.
- `value-2nd` is optional.
- `--chart-text-min: 11px` stays a floor, never a role (HARD RULE #4).

## 3. Furniture — keyed on the reading task, of which there are three

| Reading task | The reader must… | Owes |
|---|---|---|
| **Rank** | know the order, nothing more | **nothing** |
| **Read a level** | take one number per mark | the **number at the mark**; no grid, no axis, no ticks |
| **Compare across a scale** | compare marks to each other and to a scale | **value axis line + gridlines at nice steps + tick labels** |

Independent of all three: **a reference the marks are read against always draws** (rung 2). `buildGrid` already emits `.cart-zero` distinctly from `.cart-grid` for exactly this reason.

This resolves the census's headline oddity honestly: **`bar` draws neither a gridline nor an axis because it is correct to.** `wantsValueAxis` already implements the rule and `bar.docs.md` documents it as intended. It is a rule, not an accident, and it is the *only* member that has it.

**The move: lift `wantsValueAxis` from `bar.transform.js` into `cartesian.js` as the family rule** (HARD RULE #1), and have every Cartesian member call it.

The `bar`/`stacked-bar` exhibit resolves as: same kernel, same fill recipe, same edge, furniture differing *only* because a stacked bar's segments cannot each print a legible value while a bar's can.

## 4. Key — five rules, checked in order, **at the member's documented ceiling**

1. **The category axis already names the marks** → **nothing**. (bar, funnel, waterfall, bullet, progress, timeline-list, kanban, word-cloud, matrix-grid)
2. **≤ 3 addressable series with room at their terminus** → **direct labels**. (line, slope, scatter)
3. **> 3 series, or marks too small / overlapping / irregular to label in place** → **one rail**. (piechart, radar, map, quadrant-cohort, gantt, journey, roadmap, state-chart, **stacked-bar**)
4. **A rail is always the same rail.**
5. **Never both a rail and direct labels.**

**Rules 2 and 3 evaluate at the ceiling, not at the gallery sample, and that corrects stacked-bar.** Its documented ceiling is six parts across thirty-six segments — rule 3, one rail. An earlier draft gave it direct labels from its gallery slide, which is the same mistake as scoring the wash on a single-series bar. The rule is stated as **"direct labels while every terminus fits, rail past that"** — deliberately the same shape as `wantsValueAxis`, and evaluated on the same input.

**Rail geometry, and the coordinate problem stated rather than asserted.** `svg-legend.js`'s proportions are viewBox-relative (`FS = 0.045 × diagram height`, swatch 1.04·FS, row gap 0.72·FS); an HTML rail has no access to that scale, so "tokens make them match" is not free. The mapping is explicit: a shared **`--chart-rail-scale`** resolves the diagram's rendered height in `cqi` at the frame, the SVG builder consumes it in place of its hard-coded `9/200`, and the HTML rails consume the same token through `calc()`. If that conversion does not hold to within a pixel across the four HTML members, **the fallback is two rail geometries with their resolved sizes gated** — matching numbers, not shared math. Either way rail drift is checked, not assumed.

## 5. Motion — one vocabulary, declared per member

| Archetype | Build | Because |
|---|---|---|
| `whole` | synchronized | a staggered wedge leaves a hole |
| `sequence` | stagger along the reading order | the order is the story |
| `path` | draw along the path, then reveal endpoints | a line's meaning is its travel |
| `field` | synchronized fade | a staggered scatter is animation for its own sake |
| `label` | follows its mark | a name without its mark is noise |

`chartToScene` already implements the first two correctly. Two changes:

- **`isRole` is missing two roles the tree already emits.** `line.transform.js` emits `data-anima-role="line"` and `"area"` on four sites; `isRole` accepts only `bar | sector | point | region | label`, so `roleForNode` returns null and the fallback `?? 'bar'` makes a line chart's paths **reveal as staggered bars**. A live defect. Add `line` and `area`, map both to `path`.
- **The five non-SVG members get a declared CSS build, not a rewrite to SVG** — and it has a named owner and a stated parity boundary. The manifest's `motion:` declaration is read by **`chart-anima.ts` itself**, which keeps one entry point (HARD RULE #1): it selects the SVG scene builder or the CSS build from the declaration instead of sniffing for `<svg>`. **The CSS build is entrance-only.** The five HTML members get the staggered opacity/transform reveal on the same two timing tokens; they do **not** get `highlightMarks`, per-mark stepping, or the `roles` array consumers read — Present mode treats them as one figure. That is the cost, stated, in exchange for not restructuring five HTML layouts to SVG. **journey's bug disappears for free**: once the animated root is declared rather than found by "first `<svg>`", its eight decorative SVGs stop deciding.

**Print is untouched.** Print renders the final frame.

## 6. Detail reveal — one grammar, with a per-member disambiguation test

The grammar exists and is right: `mark-detail.js` turns one nested sublist under a mark's item into two surfaces from one source — an inert `<template class="chart-detail" data-mark="i">` for Present/Practice/Preview, and the same text folded into the slide's speaker note for the static PDF. The comment is stripped before render, so a chart with detail is pixel-identical to one without.

**The rule cannot be "any nested sublist is detail", because on some members the nested level is already data.** `kanban.docs.md` makes a card's nested bullet its lane label plus status pill; `timeline-list.docs.md` makes each event's nested bullets rendered body content. A blanket rule would silently move rendered content off the slide into a popover and the note, changing existing decks — so "no new mechanism, byte-neutral" would not hold.

**The rule, stated with its test:** a member owes the popover when its marks come from authored top-level list items **and its nested level is not already consumed by the member's own slot grammar.** Each member declares which, exactly as `bar` already disambiguates a nested numeric pill (data) from prose (detail). Applied:

- **Gain a popover (5):** journey, matrix-grid, progress, roadmap, word-cloud — their nested level is unconsumed today.
- **Excluded (2):** kanban and timeline-list, whose nested level is rendered content. If they are ever to carry detail it needs a *second* marker, which is new mechanism and out of scope here.

So the honest count is **five members gain detail, not seven.**

One member-shaped exception stays: a mark too small to hit is not addressable — a hit-target rule, a Present-layer concern.

## 7. The non-color channel — one channel, a width rule, and a re-diagnosis

**The channel:** `--chart-cat-{1..N}-texture`, consumed by the shared fill recipe as `fill: var(--chart-cat-N-texture, var(--chart-cat-N-fill))`. This mirrors what `--cat-N-texture` already does for categorical Mermaid and what `base.print-textures.css` already does for print. The chart family never adopted it, which is why its coverage is **45 hand-written `!important` rules in `themes/a11y-base.css` and 42 more in `base.print-textures.css`**.

**Killing the dome is what makes the channel possible — the load-bearing dependency between §1 and §7.** SVG `fill` cannot take a CSS gradient, so pie and quadrant emit `style="fill:url(#grad)"`, an inline style that outranks any non-`!important` rule. A *flat* fill is a plain `var()`, so the channel resolves in the normal cascade. The `!important` arms race is a symptom of the gradient, not of accessibility.

**Width at the ceiling — the brief asked for this and the previous draft did not answer it.** The rule is **channel width ≥ palette width**, gated: a test resolves the categorical cycle's declared width per theme and fails if the texture channel carries fewer slots. The pie's documented ceiling is **11 slices**, so the channel ships **11 slots, not 8**, and the gate is what stops slots 9–11 from silently having no channel again the next time the palette widens. Past the channel's width a member **consolidates** (an "other" slot) rather than recycling a texture — recycling would make two categories identical in exactly the condition the channel exists for.

**The six "uncovered categorical" members, re-measured. Four of the six are not what the census called them:**

| Member | Actual diagnosis | Answer |
|---|---|---|
| `bullet` | **Already correct.** Its three layers separate by *value* — light band, solid measure, dark target tick — which survives grayscale. `a11y-base.css` says so and gives the reason. | Ratify. No change. |
| `kanban` | **Already correct.** Cards colored by *status* with a text label; categorical hue appears only in the opt-in `.tinted` column background at **4–6%** — a rung-4 field tint. | Ratify. No change. |
| `word-cloud` | **Law 1 violation, not a texture gap.** It colors *text* with the categorical cycle while size already carries frequency. | **Delete the cycle.** One ink, or a status cycle if the author encodes one. |
| `matrix-grid` | **Law 1 violation.** Eight categorical hues on ROW LABELS and cell outlines — the axis a reader decides least from. The kanban defect, re-introduced. | **Delete the cycle.** |
| `quadrant` | **Real gap, and the sharpest one.** Category lives in the *dots*, which have no non-color channel while the zones have all the ink. | Zones to rung 4; **dots take the texture channel.** |
| `map` | **Real gap, wrong remedy.** A choropleth is a *sequential ramp*, not a categorical cycle. | **Out of this language's remit** — see below. |

**The quadrant shape channel is dropped, and the reason is mechanism.** An earlier draft proposed "a shape cycle via `--shape-*` masks". Those tokens are chrome mask-images (arrow, chevron, triangle) with a `--shape-paint` tail — there is no circle/square/diamond set, CSS `mask` on SVG data marks is not this family's idiom (marker geometry is), and it is not what HARD RULE #29 asks for. A real shape cycle is **new marker geometry in the shared kernel with its own tokens** — a defensible piece of work, but it is a second channel on top of a first, and quadrant's gap closes with texture alone. **Quadrant relies on texture; the shape cycle is not part of this language.** If it is ever wanted, it enters as marker geometry in `cartesian.js` with its own token set and its own cost line.

**`map` is scoped out, explicitly.** A binned sequential ramp (4–6 steps, monotone in lightness) is a **new sequential palette that all 13 curated themes must supply** — that is a palette redesign, which the brief rules out of scope, and it belongs in its own decision with its own 13-theme curation cost. This language's answer for map is therefore: **the categorical cycle is wrong for it, the fix is a sequential ramp, and that fix is deferred.** Map keeps today's paint and is recorded as a known, unremedied gap rather than costed at zero.

**Themes stay in control.** `--chart-cat-N-texture` is unset by default, so cuoio and indaco are untouched; a11y palettes, onyx and `section.print` point it at the pattern set they already ship.

## 8. Tokens — recounted from what §1–§7 actually oblige

Everything above is expressible in `var(--token)` (HARD RULE #3). The previous draft's "nine primitives" understated the surface a human would be authorizing.

**Pure tokenizations of existing literals (3):**
- `--chart-ref-strength` (today `42%` of `--text-body`), `--chart-axis-strength` (`88%` of `--border`), `--chart-grid-strength` (`62%` of `--border`) — rebased onto one base per Law 2, which is why these are "pure" in count but not necessarily pixel-identical; the Ladder gate reports any movement.

**Genuinely new (13 named + 1 channel):**
- `--chart-field-strength` — rung 4, the quadrant fix (~10%)
- `--chart-fill-range` — the finish ceiling (≤ 0.03 OKLab)
- `--chart-overlay-alpha` — radar's flat translucency; today three literals in `areaGradient`
- `--chart-corner-mark`, `--chart-corner-chip`, `--chart-corner-card` — the radius set (§1); circles and one-sided radii out of remit
- `--chart-mark-stroke` — the mark edge in viewBox units; today `0.7` in `bar.styles.css`, absent in `stacked-bar`
- `--chart-rail-fs`, `--chart-rail-swatch`, `--chart-rail-gap`, `--chart-rail-scale` — the rail geometry §4 rule 4 requires, including the cqi↔viewBox scale
- `--chart-motion-span`, `--chart-motion-stagger` — build window and per-mark offset, shared by the SVG scene and the CSS build
- **`--chart-cat-{1..11}-texture`** — one channel, **11 slots** (§7's width rule), unset by default

**New non-token surface, named so it is not discovered later:** the `value-2nd` class and its `FS` entry (§2); the `--rank` and edge/composite arms of `chart-mark-separation.js` (Law 2, Law 3); the channel-width gate (§7); the census assertion arm (§2).

**Deleted:** the 42/58/82 dome stops in `piechart.transform.js` and `quadrant.transform.js`; progress's `--pct` intensity ramp.

That is **16 named primitives + 1 eleven-slot channel**, of which 3 are tokenizations of existing literals.

---

# Part III — Survival checks

**onyx (value, not hue).** The dome spans 0.286 OKLab against a 0.097 step between categories — 2.9× — on the one theme whose identity is that categories differ by *value*. Flat fills return the whole value budget to the palette. The Ladder helps onyx most: a theme with no chroma to spare needs its furniture ranked by value, and today those weights are literals it cannot touch.

**a11y-achromatopsia (no hue at all).** Only `quadrant` is SWAMPED there today; texture already rescues pie, funnel and stacked-bar, line-styling rescues line, radar and slope. Rung 4 plus dot texture fixes quadrant. The two remaining COLLAPSED members, `kanban` and `matrix-grid`, are Law 1 deletions.

**Dark canvases.** Every rule spends `light-dark()` pairs that already exist.

**Print.** Motion never reaches it. Detail folds into the note channel with chart pixels byte-identical. Texture arrives through the channel `base.print-textures.css` already uses, so the 42 print rules collapse into one recipe. Flat fills print better than gradients on a monochrome office printer, which bands them.

**Themes can still curate.** Every rule resolves through an overridable token; all primitives carry defaults, and the texture channel is unset by default.

---

# Part IV — Where each of the 21 members lands

Reading task: **R** = rank · **L** = read a level · **C** = compare across a scale.
Benefit column: **D** = fixes a reading defect · **U** = uniformity only.

| Member | Task | Fill after | Furniture | Key | Motion | Changes | Benefit |
|---|---|---|---|---|---|---|---|
| piechart | L | **flat** | none | rail | whole | **dome deleted**; legend face → body | **D** |
| quadrant | R | **flat dots; zones → rung 4** | plot box + split (rung 2) | none (dots direct-labeled) | field | **dome deleted; zones quieted; dots textured; axis-title face** | **D** |
| matrix-grid | R | **flat; cycle deleted** | grid (rung 3) | none | field | **Law 1 deletion**; gains detail + motion | **D** |
| word-cloud | R | **flat ink; cycle deleted** | none | none | whole | **Law 1 deletion**; gains detail; legend face → body | **D** |
| line | C | flat areas, alpha bands | grid + zero when zero in domain | direct labels | **path** | **`line`/`area` roles recognized** — live bug | **D** |
| journey | R | flat | none | rail → shared geometry | sequence | **motion root declared, not found** — live bug; gains detail | **D** |
| progress | L | **flat** | none | none | sequence | **`--pct` ramp deleted (Test B)**; gains detail + declared motion | **D** |
| bar | L (C when grouped) | **flat** | value labels; axis only when a label won't fit | none | sequence | **fill flattens** | U/D |
| waterfall | C | **flat** | grid + axis + zero | none | sequence | **fill flattens** | U/D |
| radar | C | **flat alpha** | polar web (rung 3) | rail | whole | stops → one alpha; legend face → body | U |
| bullet | C | flat; band → rung 4 | grid + axis + zero + target ref | none | sequence | band drops to rung 4 | U/D |
| stacked-bar | C | flat, joins canonical fill | grid + axis + zero | **rail** (ceiling rule) | sequence | fill mix aligns with bar; mark stroke; key corrected | U |
| kanban | R | flat status; tint rung 4 | none | none | sequence | declared motion (no detail — nested level is data) | U |
| roadmap | R | flat | none | rail → shared geometry | sequence | gains detail + declared motion; rail geometry | U |
| timeline-list | R | wash kept, capped | none | none | sequence | declared motion (no detail — nested level is data) | U |
| state-chart | R | wash kept, capped | none | rail → shared geometry | field | rail geometry | U |
| gantt | C (time) | wash kept, capped | time axis + rule | rail → shared geometry | sequence | wash retuned; rail geometry | U |
| scatter | C | flat | grid + axis | direct labels | field | corner/stroke tokens | U |
| funnel | L | flat | none | none | sequence | — | U |
| slope | C | none (stroked) | none | direct labels | path | — | U |
| map | L | **unchanged — deferred** | none | rail | field | legend face → body; sequential ramp deferred (§7) | — |

**Rows are ordered by reader benefit per unit of churn.** The seven **D** rows fix something a reader is losing today — two of them (`line`, `journey`) are live bugs that cost almost nothing to fix. The **U** tail buys coherence, and **the tail is optional**: it can be approved, deferred or dropped without unmaking the head. "All 21 change something" was rhetoric standing where this ranking was needed.

---

# Part V — What it costs

**Members whose painted pixels move: 20** (map defers). Seven fix a reading defect; thirteen buy uniformity.

**Committed PDFs: 76 decks carry a chart class and a committed sibling PDF and must be rebuilt** — recount with `grep -rlE '_class: (bar|stacked-bar|waterfall|line|scatter|slope|bullet|funnel|piechart|quadrant|radar|map|gantt|progress|kanban|timeline-list|roadmap|state-chart|journey|matrix-grid|word-cloud)' --include='*.md' .` intersected with sibling `.pdf` existence. **43 decks use `piechart` or `quadrant`** — the earlier draft's 25 undercounted the rebuild set. The 21-slide chart gallery re-renders entirely, and the six long-running galleries stay isolated per HARD RULE #8.

**Measurements in this document are reproducible only with their fixture, so the fixture ships.** The grouped-bar numbers come from a committed deck (2 categories × 4 series, values 100/86/54/31 and 90/96/64/41) checked in under `test/fixtures/chart-language/grouped-bar.md`; a different grouped-bar deck gives a different magnitude (0.114/0.090 on cuoio, 0.099/0.069 on onyx — same verdict), which is exactly why the deck must travel with the number. Every figure above names its deck, theme and `--type`.

**The export gate fires.** This changes exported bytes, so the QUALITY BAR's export exception applies: a representative deck rendered in **both dark and light**, sent for sign-off, before any byte-moving slice merges. A hard stop per slice.

**HARD RULE #9 is owed on most slices** — each fill, furniture, key and type change is visible on a slide, so each owes a per-feature demo deck plus committed PDF.

**What breaks, named:**

- `test/unit/components/cartesian.test.js` reads `chart-family.css` and fails when the `FS` table drifts. Any type change moves both.
- `test/unit/palette/chart-contrast.test.js` and `design/theming.md`'s procedure both score "each chart's deep gradient stop". That stop stops existing for pie and quadrant. Both need rewriting, and `chart-family.style.md` § Fill finish — which records the flat variant as *held* — needs replacing with the decision (and with Option B recorded as the scored runner-up).
- `themes/a11y-base.css` (45 rules) and `base.print-textures.css` (42 rules) collapse into one recipe. **Highest-risk slice**, because `texture-polarity.test.js` gates a specificity lockstep between onyx's polarity pins and the a11y re-assertion, and that pairing has broken once.
- `docs/src/lib/chart-anima.ts`'s `ChartRole` union widens; the `roles` array shape is read by tests, and the CSS build does not populate it for the five HTML members (§5).
- Pixel baselines, `check-chart-fit`, `check-chart-responsiveness`, `npm run scorecard`.
- `chart-family.docs.md` § "Motion + mark-detail support, by member" is already stale (it lists none of the eight Cartesian members) and is replaced by the manifest declaration plus a `check-render-nature` sibling gate.

**Sequenced by what it unblocks, five slices, each independently shippable:**

0. **The two live bugs, first and nearly free** — `line`/`area` roles in `isRole`, journey's declared motion root. No token, no export byte change beyond motion (which print ignores). Ship before anything else.
1. **The Ladder + flat categorical fill.** Four strength tokens on one base with the ordering gate, the edge/composite arm on `chart-mark-separation.js`, dome deleted, bar/waterfall/progress flattened, quadrant zones to rung 4. **Unblocks slice 2** — a flat fill is a `var()`, an inline gradient url is not.
2. **The universal texture channel.** Deletes 87 `!important` rules, adds one recipe, eleven slots and the width gate; covers quadrant and every future member.
3. **Type + key.** Five roles, the direct-label contract, four legend faces, one axis-title, the rail geometry tokens and their conversion check.
4. **Furniture.** Lift `wantsValueAxis` into `cartesian.js`; wire the three reading tasks; correct stacked-bar's key at the ceiling.
5. **Motion + detail.** Manifest declaration read by `chart-anima.ts`, entrance-only CSS builds for the five HTML members, `detailPayload` for the five that qualify. Byte-neutral for print, so no export sign-off round.

**Three decisions are not mine to make alone**, batched into one round before slice 1: (a) **Option B vs Option C** — the wash dies on coherence and reference practice, not on a measured reader defect, and B costs roughly half the churn while forfeiting the texture channel; (b) deleting the categorical cycle from `word-cloud` and `matrix-grid` removes a visual feature authors may use deliberately; (c) the churn on 76 committed PDFs and five export sign-off rounds should be authorized as a programme. The **U** tail in Part IV can be deferred within any of those answers.

---

# Part VI — The claims I would correct before building

**In the census:**

1. **The vertical wash was never measured — and when measured properly it does not fail Test A.** The brief said the wash "has not been shown to" break a channel; scoring it on fill alone shows it swamped, but `paintOf` never reads the ink edge that actually carries category, and the edge clears the 0.15 floor by 30–70%. The wash escaped scoring because the gallery's `bar` slide is single-series; it survives Test A because the instrument was fill-only.
2. **`bullet` and `kanban` are not undefended categorical members.** Bullet separates by value and says so; kanban colors by status with a text label and spends categorical hue only on a 4–6% opt-in column tint. The uncovered set is two, not six — and one of those two (`map`) needs a remedy outside this language.
3. **`radar`'s radial gradient is not a dome** — it was compressed to a 0.10 → 0.20 alpha wash during the kanban-finish standardization, per its own source comment. Keeping it is the correct reading of an already-flat mark.

**In my own previous draft, corrected above:**

4. **Test B's "tall bar's top vs short bar's top" was false.** `buildFillDefs` uses `objectBoundingBox`, so every bar's stops are identical. Only the parallel-to-the-measured-axis half survives.
5. **Radar's 0.000 self-range is a measurement artifact** — `paintOf` ignores `stop-opacity` — and was cited as proof it could not carry.
6. **`--chart-fill-range ≤ 0.06` was derived from a design target, not a measurement**, and swamped the separation it was meant to respect. It is 0.03, and Test A is stated as inapplicable to status members.
7. **The rebuild set was undercounted** (76 decks, 43 pie/quadrant, not 99/25), the token count understated (16 + 11 slots, not 9 + 8), stacked-bar's key was read off its gallery slide instead of its ceiling, `progress` was exempted from the test that killed `bar`, and the detail rule would have moved rendered content off two members' slides.