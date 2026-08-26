---
status: shipped
summary: >
  The design model the joint re-solve brief asked for, with the answer measured rather than
  assumed — and it refutes the brief's own framing. The work is NOT "re-curate the status trio
  across 18 palettes": 56 of the 66 frozen pairs have an ink that already clears AA on the bare
  canvas and fails only once something is composed on top of it, so the binding axis is the
  COMPOSITION, not the hue. Three composition moves, none of which touches a curated hue,
  take the frozen table from 66 to 22: giving the kpi pill an opaque shallow ground while it
  KEEPS its state-hue ink clears 30, the policy stance badge's 12% tint cut to its 9% knee
  clears 10, and a redline card trim clears 4. A more aggressive package reaching 17 was
  measured and then REJECTED by the adversarial pass (§8): inverting the kpi pill's ink the way
  `.chart-status` does would collapse the achromatopsia separation the trio carries from 0.1174
  to 0.034 with every gate still green, because that component has a `[data-s]` glyph channel
  the kpi pill structurally cannot have; and halving the redline band would buy 4 pairs on a
  surface no deck renders, at the price of an 18-file palette edit and carbone's band at
  1.02:1. The survivors are exactly TWO palettes, each a real curation defect the composition cannot
  reach: carbone's LIGHT arm, which is sub-AA on the bare canvas (`--pass` 3.90:1, `--fail`
  2.34:1) and is invisible to `theme-surface-aa` because that gate audits only the mode a
  palette PINS — carbone pins dark — and concrete's DARK `--fail`, whose §5 infeasibility is
  re-derived here on this tree to the same 0.0250 achromatopsia figure the prior note measured.
  The tint-depth lever the prior brief proposed as the escape is measured and found weak on its
  own: a uniform 2% wash — a wash barely visible at all — still leaves 35 pairs, because the
  surfaces that fail hardest do not read `--{state}-bg` in the first place.
builds-on: 2026-08-24-status-trio-joint-solve-brief.md, 2026-08-24-status-trio-single-root.md, 2026-08-24-palette-cascade-flip.md
---

# The joint solve is mostly not a hue problem

**2026-08-25 · design model — no values changed in this note**

**Status: shipped — the revised package in §8.5 is what landed.** `2026-08-24-status-trio-joint-solve-brief.md` scoped this item and told
its successor to do one thing first: *"Measure that before solving anything; the cheapest solve
is the one that turns out to be a component fix."* That measurement was made, it came back
positive, and it came back bigger than the brief's hypothesis. This note is the design model
CLAUDE.md §Design-before-code requires before any CSS is edited.

Every number below is from `tools/composed-contrast.js`'s own `evalSurface` /
`mergedVars` — the real gate as the objective function, per the brief §2 — over all 32 themes
in both modes. The harness reproduces the shipped table exactly (66 of 2624) before any
candidate is applied, which is the check that it is scoring the same thing the gate scores.
"Sub-AA" below is shorthand for *below its own bar*: 65 of the 66 are gated at 4.5:1 and one
(`carbone|light|checklist/fail-row`) at WCAG 1.4.11's 3:1, being a disc and a rail rather than
text. It reads 2.14, so it is under either bar.

Every number in this note was independently re-derived by a fact-checker agent working from its
own harness. Five claims confirmed exactly, three refuted; the refutations are folded in below
and flagged where they changed a figure a reader would act on.

---

## 1. The brief's hypothesis, and what it turned out to be

The brief's §6.4 lead was that a **kpi pill recipe fix** might clear most of the 38 `--warn`
pairs without moving a hue. Tested first, exactly as posed — sweep the pill's tint depth:

| kpi pill tint depth | 18% (today) | 12% | 8% | 4% | 2% |
|---|---|---|---|---|---|
| worst `kpi/warn-pill` | 3.68 | 3.98 | 4.20 | 4.40 | 4.52 |
| worst `kpi/hero-warn-pill` | 3.25 | 3.55 | 3.72 | 3.91 | 4.01 |

**Refuted as posed.** At a 2% tint — a tint that is not a tint — the hero arm is still 4.01.
The reason is worth stating because it generalizes: as the depth goes to zero the pill's ground
converges on the tile it sits on, so the *ceiling* of that lever is the raw ink-on-tile ratio,
and no depth reaches past it. Sweeping the depth was measuring the wrong axis.

## 2. The axes, named

Five, in the order a change reaches the reader:

1. **Ink source** — does the surface ink in the STATE HUE (so its ground, a tint of that same
   hue, moves with it) or in `--text-heading` (ground independent of ink)? This is the axis the
   brief did not have, and it is the one that pays.
2. **Ground independence** — is the wash an alpha tint over *whatever tile it lands on*, or an
   opaque mix against `--bg`? The kpi hero pill fails 0.4–0.5 harder than the same pill on
   `--bg-alt` purely because `--accent-soft` is a softer tile.
3. **Wash depth** — how deep the state-hued ground is. Trades ink contrast against the wash's
   own visibility, and the exchange rate is poor (§4).
4. **Curated hue lightness** — the trio values themselves. The axis the brief assumed was the
   work.
5. **Gate coverage** — which grounds and which MODES are audited at all. Not a design axis, but
   it is why one whole bucket exists and was never seen (§3, bucket A).

## 3. The population, re-cut by CAUSE rather than by surface

The brief cut the 66 by surface and by token. Cut instead by *whether the ink already fails on
the bare canvas in that mode*:

| bucket | pairs | what it is | reachable by |
|---|---|---|---|
| **A** | **10** | the ink is sub-AA on `--bg` itself — every one is `carbone` on its LIGHT arm | axis 4 only |
| **B** | **56** | the ink clears the bare canvas and fails only once composed | axes 1–3 |

Bucket A is a single palette, and the reason it shipped is a gate hole, not a curation
oversight: **`theme-surface-aa` audits one mode per theme — the one the palette pins via
`color-scheme`** (`tools/contrast-audit.js:68`, `:391`). carbone pins dark
(`themes/carbone.css:70`), so its light arm has never been audited at all, and it resolves
`--pass` `#428555` at **3.90:1** and `--fail` `#a22525` at **2.34:1**.

And carbone's light arm is a stranger surface than "light arm" suggests: **`--bg` is a flat
`#1A1A1C`, not a `light-dark()` pair**, so switching a carbone slide to light does not lighten
the canvas — it swaps the trio to light-arm inks and leaves them on the SAME dark ground they
were never drawn for. That is why the failure is so deep (2.34:1) rather than marginal. That arm is reachable: `class: light`,
`color-mode: light`, `color-mode: system` on a light OS, and a per-slide `_class: light` all pin
`color-scheme: light` on the section (`lib/base/base.modifiers.css:635`, `:645`). Print does
NOT reach it — `section.print` repoints the trio to `--print-pass/-warn/-fail` (`:525–527`).

Bucket B splits again by which axis reaches it:

| sub-bucket | pairs | surfaces |
|---|---|---|
| **B1** `--warn` on an own-hue tint over a soft tile (36 light arm, 2 dark — both `carbone`) | 38 | `kpi/warn-pill` 16, `kpi/hero-warn-pill` 14, `policy-recommendation/amend-badge` 8 |
| **B2** `--fail`, dark arm, on the redline own-hue card | 14 | `redline/del-on-old-card` 10, `redline/del` 2, `redline/old-label` 2 |
| **B3** everything else | 4 | `concrete` `oppose-badge` 2, `cuoio` `defer-badge` 2 (`--text-secondary`, not the trio) |

B1's mechanism, stated once: **on the palettes that fail, `--warn` is curated to sit just above
AA on the two grounds that are gated and nowhere else.** It is a TAIL, not the median — across
the 14 brand palettes the median headroom on `--bg-alt` is 0.85, and concrete has 5.75. The tail
is what ships the failures: atelier 4.77, mustard 4.64, burgundy 4.73, magnolia 4.84 — a median
of 0.25 over those four. A 12% own-hue wash costs 0.5–0.6, so for that tail the margin was
already spent before the wash arrived.

## 4. Why the brief's proposed escape — cut the tint — is a weak lever on its own

Measured directly: hold everything else and set ONE uniform depth for
`--{pass,warn,fail}-bg` across all 32 palettes.

| uniform wash depth | 12% | 10% | 8% | 6% | 4% | 3% | 2% |
|---|---|---|---|---|---|---|---|
| sub-AA pairs (from 66) | 74 | 62 | 56 | 54 | 47 | 38 | 35 |

At **2%** — visually no wash at all — 35 pairs survive. Two reasons, both structural: the
hardest-failing surfaces (`policy-recommendation/*-badge`, `redline/old-label`,
`redline/new-label`) never read `--{state}-bg`, they carry their own component-local tint; and
bucket A is untouched by any depth.

And the lever is not free. The wash's own visibility against its host, median across the trio ×
32 themes × both modes: **12% → 1.22:1, 8% → 1.14:1, 5% → 1.08:1**. The status wash is a faint
band by design; cutting it a third to buy 0.15:1 of ink contrast is spending the signal to save
the signal. Depth is a fine-tuning axis, not the solve.

## 5. The move that does pay: invert the ink (axis 1)

`.chart-status` already solved this exact problem in #1807, and the solution was not a hue and
not a depth — it was inking in **`--text-heading` on a state-hued ground** instead of the state
hue on a tint of itself. `tools/composed-contrast.js`'s `pillStop()` models it. The kpi pill is
the sibling component and still carries the old shape: `--pill-fg: var(--warn)` on
`--pill-bg: var(--warn-bg)` (`lib/components/evidence/kpi/kpi.styles.css:305–307`, `:343–345`,
`:409–411`).

`.chart-status` is a GRADIENT, and its two stops are `18% light / 42% dark` at 0% and
`30% light / 54% dark` at 100% (`chart-family.css:986-987`). Both are scored, over every
palette × mode × state × both tiles (`--bg-alt` and `--accent-soft`), n = 384:

| kpi pill recipe | worst ratio | below-bar pairs |
|---|---|---|
| today — state hue on its own tint | 1.53 | 39 |
| today, restricted to the two states kpi actually paints (`pass`, `warn`) | 2.19 | 32 |
| **inverted — `--text-heading`, at the SHALLOW stop 18/42** | **6.38** | **0** |
| **inverted — `--text-heading`, at the DEEP stop 30/54** | **4.62** | **0** |

Read the deep stop as the binding one: a gradient ships both, so the pill's real worst is
**4.62 — a margin of 0.12, not a comfortable one.** It is nonetheless the margin
`.chart-status` itself ships today, and it clears every palette where the current recipe
fails 32. If the kpi pill is given a FLAT ground rather than a gradient there is a better
option available: the shallow stop alone reads 6.38, and nothing about a small status chip
requires a gradient.

*(An earlier draft of this table set a warn-only "today" figure of 3.24/30 against an
all-states inverted figure, and described the ground as "18%/30%" — which are
`.chart-status`'s two LIGHT-arm stops, not a light/dark pair. Both were caught in
fact-check. The direction survives either way — the inverted recipe is 0 below-bar at
both real stops — but "1.9 of margin, robust" was an artifact of the mismatch and is
withdrawn.)*

The move also collapses two recipes into one: the two status pills in the engine would
finally paint the same way.

## 6. The three moves, projected cumulatively against the real table

| step | move | sub-AA | Δ |
|---|---|---|---|
| — | as shipped | 66 | — |
| **K** | invert the kpi pill ink (§5) | 35 | **−31** |
| **P** | policy stance badge tint 12% → 8% | 25 | **−10** |
| **R** | redline card 5% → 4%, band 12% → 6% | **17** | **−8** |

**No curated hue is touched by any of the three.** The 17 survivors are two palettes:

> **Superseded by §8.** This is what the analysis ALONE recommended. The adversarial pass
> rejected two of the three moves; §8.5 carries the revised package (66 → 22). This table stays
> because the rejected moves' numbers are the reason the revised one is smaller.


- **carbone, light arm — 9.** Bucket A. Nothing composed can reach an ink that is 2.34:1 on the
  bare canvas.
- **concrete — 8.** Its dark `--fail` and its light `--fail` on the stance badge.

## 7. The one arm that is genuinely a hue problem, re-derived on this tree

The brief §7 asked its successor to re-derive §5's infeasibility rather than inherit it. Done —
sweeping concrete's dark `--fail` in lightness with hue and chroma held:

| L | hex | band | band+card | card | binding CVD constraint |
|---|---|---|---|---|---|
| 0.7346 | `#ee8787` (shipped) | 3.91 | 3.61 | 4.35 | — (holds; `warn^fail` achromatopsia 0.1203) |
| 0.7446 | `#f18a8a` | 4.00 | 3.74 | 4.50 | `warn^fail` deuteranopia 0.1210 < 0.1268 |
| 0.7846 | `#ff9796` | 4.54 | 4.13 | 5.13 | `warn^fail` achromatopsia 0.0691 < 0.11 |
| 0.8246 | `#ffacab` | 5.08 | 4.63 | 5.89 | `warn^fail` achromatopsia **0.0250** < 0.11 |

(The sweep steps from the shipped L in hundredths, so the rows sit at shipped + 0.01 / 0.05 /
0.09 rather than on round numbers. At exactly L = 0.82 the figure is 0.0312.)

**Confirmed, and it reproduces the prior note's figure exactly** — 0.1203 → 0.0250 at the lift
that first clears the composed stack. The single-token lift breaks CVD before it clears AA.

What the re-derivation ADDS is where the real bind sits. Cutting the BAND barely moves concrete,
because its worst surface is `redline/del-on-old-card` — a band on TOP of a 5% own-hue card — and
the card half is untouched by a band cut: at band 2% / card 3% it is still **4.35**. (Its sibling
`redline/old-label`, the label on the bare card with no band, does clear at card 3%, reading
4.52 — so the card cut alone rescues one of the two and not the other.) The cause underneath both
is that concrete's dark `--fail` clears `--bg-alt` by only 0.21 (4.71:1), so any own-hue layer at
all sinks it, and `theme-surface-aa` passes it because 4.71 ≥ 4.5.

The joint version is *arithmetically* open but expensive. At card 5% / band 6% each token's AA
floor drops to L ≈ 0.756–0.776, leaving 0.244 of range under the gamut ceiling against the 0.22
that three signals at the 0.11 achromatopsia floor need. It fits — with `--pass` pushed to
L ≈ 0.996, which is very near white and strips the chroma the DICHROMACY floors (0.15) depend
on. So the honest statement is: **not infeasible, but the only lightness-only solution
sacrifices concrete's dark status identity to clear it**, and that is a visible design call
rather than a solve.

## 8. The adversarial pass, and what it changed

A red-team agent was pointed at §5–§6 with the brief *"find what a contrast number cannot
see."* It found two, and both are real. **The recommendation in §6 does not survive them
intact**, so what follows is the revised one.

### 8.1 K moves the state signal onto a channel that no palette clears — and no gate can see it

Today the kpi pill carries its state as **ink at full saturation**. Inverted, it carries the
state only as a *ground*. Measured over all 64 theme-modes with `lib/theme/cvd.js`, the minimum
pairwise separation the signal carries:

| condition | floor | as INK (today) | as GROUND (after K), shallow stop | deep stop |
|---|---|---|---|---|
| protanopia | 0.15 | 0.0638 | 0.0130 | 0.0221 |
| deuteranopia | 0.15 | 0.0870 | 0.0137 | 0.0263 |
| tritanopia | 0.15 | 0.1053 | 0.0213 | 0.0341 |
| **achromatopsia** | **0.11** | **0.1174** | **0.0184** | **0.0337** |

The achromatopsia row is the one that stops it. The trio clears that floor on **64 of 64**
theme-modes today at a minimum of 0.1174 — and that is not luck, it is what #1801 respaced every
palette's trio to buy. K would hand the reader grounds separated by ≤0.034, a 3.5–6× collapse,
and `cvd-trio-floor.test.js` would stay byte-identical green because it scores **raw token
hexes** and K moves no token. That is the #1181 shape precisely, and HARD RULE #18 names it.

**Why `.chart-status` gets away with what kpi cannot.** It ships a second, non-color channel:
`themes/a11y-base.css:266-276` and `lib/base/base.print-textures.css:33-42` hang a `::before`
glyph (✓ ! ✗ ◆ –) off `[data-s]`. The kpi pill has no `data-s` **and cannot have one** — its
content is arbitrary author text and the color is assigned by row position
(`kpi.docs.md:47`: "the engine never reads the pill text"). So K ports the color half of #1807's
solution into a component that structurally cannot carry the shape half. The two pills only look
alike.

### 8.2 An opaque `--bg`-based ground can vanish against a tile that is not `--bg`

Axis 2 was written as pure upside. It is not. Today's alpha tint is *always* N% of the state hue
laid over whatever tile it lands on, so the chip's fill never falls below **1.141:1** against
that tile. An opaque mix into `--bg` ignores the tile, and kpi pills sit on `--bg-alt`,
`--accent-soft` and bare `--bg`. Worst case measured: **1.000:1** — the chip's fill exactly
matching its tile — while `evalSurface` reports the stack as a comfortable pass.

**What survives it:** the pill's edge is not its fill. `--pill-border` is the state hue at full
saturation, and against the tile it measures **2.60:1 at worst on every option, identically** —
the number is invariant to the fill choice, and its floor is `carbone|light|pass` (bucket A
again). That clears the repo's own justified non-text floor (`PANEL_EDGE_MIN` 1.5) though not
WCAG 1.4.11's 3:1. So the chip stays a shape; it is the *fill* that stops carrying the tile
separation, and the border that takes over. That is a design judgment, not a measurement — which
is why it belonged in the ask rather than in a decision made here.

**It was put to the human and accepted**, in the same round as the package pick: *"accept the
border as the edge, modelling it as a new surface family with a justified sub-3:1 floor — the
`PANEL_EDGE_MIN` precedent"*, chosen over holding a tile-visible fill floor or rendering first.
The shipped floor is **per-tile** rather than the single number that ask implied — 3 on the card,
2.5 on the hero — because the population is bimodal and one flat floor low enough for the hero
would permit a 60% collapse on the other 63 pairs. The measured worst chip was then rendered and
reads.

### 8.3 The redline BAND half of R is not worth what it costs

- All 8 pairs R buys are on **one** surface, and it is flagged **`proactive: true`** — the
  catalog's own marker for "the CSS produces this pairing but no deck in the repo writes the
  markup that reaches it", carrying the rule **"a surface nobody renders does not get to move a
  palette"** (`tools/composed-contrast.js:114-122`).
- The band half *would* move a palette: `--{pass,warn,fail}-bg` are **palette-declared**, at
  three curated depths across 18 theme files (18% carbone, 10% carta/cuoio/indaco, 12% the
  rest). There is no engine default.
- **The last 2pp is free.** With the rest held, the band sweep reads 12% → 25, 10% → 19,
  8% → 17, 6% → 17. Below 8% it buys nothing.
- At 6% it **erases** the band where it was curated deepest: carbone's redline band falls to
  **1.021:1** against its tile. §5 of the superseding brief calls the engine's own bar "that a
  REDLINE reads". It would not.
- Blast radius the projection cannot see: `checklist` reads the same three tokens for its row
  bands, they are **documented public theme tokens** (`design/theming.md:145`), and the
  Playground's generator derives them independently at 10% — so shipped palettes at 6% would
  diverge permanently from every Playground-authored theme.

The **card** half (5% → 4%) survives on its own terms and is not a wash cut at all: `redline`
already ships four sites at 4% against four at 5%, so it is a consistency fix.

### 8.4 P cuts past its own knee

`--stance-bg` is one declaration serving five stances **and** the ask bar — "the closing
legislative call to action, a filled stance bar", whose docblock justifies the opaque tint with
*"the 'filled stance bar' reads as filled."* And 12% → **9%** already reaches the same 25 pairs
that 8% does. The last point buys nothing and spends the fill that sentence exists to protect.

### 8.5 The revised package

| step | move | below-bar | Δ |
|---|---|---|---|
| — | as shipped | 66 | — |
| **B** | kpi pill keeps its **state-hue ink**; its ground becomes an opaque 8% mix into `--bg` | 36 | −30 |
| **P** | policy stance badge tint 12% → **9%** (its knee) | 26 | −10 |
| **C** | redline own-hue card 5% → 4% — **band untouched** | **22** | −4 |

**B replaces K.** It buys 30 of K's 31 pairs, and it keeps the ink at full saturation — so the
achromatopsia channel stays at 0.1174 rather than collapsing, and 8.1 does not apply. It shares
8.2's fill-vs-tile cost, and it *improves* the border against its own fill from 2.19 to 3.59.
Its 3 residual kpi pairs are all `carbone|light|pass` — bucket A, which no recipe reaches.

The aggressive package reaches 17 instead of 22. The 5 extra pairs cost: the CVD channel (1
pair), and 4 pairs on a surface nobody renders, bought with an 18-file palette edit.

### 8.6 The carbone option, and why it was withdrawn

A fourth move was measured and looked almost free: carbone's `--bg` is a flat `#1A1A1C` that
does not flip, so its light-arm trio is light-arm inks on a dark canvas. Mirroring the light
arm onto the dark one takes carbone from **14 below-bar pairs to 4**, and the package from 22
to **12**. Three lines.

**It is withdrawn, and the reason matters more than the measurement: #1302 already owns this,
and the mirror would have made its job harder.** That issue is "curated light-mode tokens —
the one palette with no light face". carbone has no light canvas *yet*; #1302 is the ticket
that authors one, and its plan explicitly re-checks "the `light-dark()` pairs that already
exist (`--pass` / `--fail` / `--warn`) … against the new canvas rather than assumed". It also
says the file's header comment "stays accurate and should not be edited" until then.

So carbone's light trio is not miscurated — it is **orphaned**. `#428555` / `#a22525` /
`#ec7d40` are sensible inks for a light canvas; they measure 2.34:1 because they are being
scored against a dark one. Mirroring them to the dark arm's light-on-dark values would delete
the only half of carbone's light face that is already built, and #1302 would have to undo it.

Bucket A is therefore **#1302's**, not this swimlane's. Its 9 residual pairs stay frozen with
that pointer, which is HARD RULE #18's found-not-caused arm: a defect this change neither
caused nor worsens, recorded rather than absorbed.

*(This was caught because a human asked whether another session already had a ticket for
carbone's light mode. It did. The analysis had no way to see that from the tree, and a
three-line change that looked free would have collided with a designed feature.)*

## 9. What this note does NOT claim

- **Nothing is rendered yet.** Every number is analytic, from `evalSurface`. Per HARD RULE #23
  none of it is a verification claim about a page; the rendered contact sheets are owed before
  any of this ships.
- **The 17-survivor projection is a projection.** It models the three moves as surface
  definitions, not as landed CSS; the landed diff has to re-run the real gate.
- **The carbone light-arm re-curation is not solved here** — bucket A is identified and its
  cause named, but no candidate trio is proposed for it.
- **The `theme-surface-aa` mode hole is reported, not fixed.** Widening that gate to both modes
  is a CI-contract change (CLAUDE.md's second filter, row 2 is narrow — this is a test's scope,
  not a job — but it would red-gate two shipped palettes on contact, which is a decision, not a
  cleanup).
