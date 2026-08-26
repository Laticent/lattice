---
status: shipped
summary: >
  Carbone had no light face. Resolved rather than assumed, 289 of its 303 tokens were
  IDENTICAL across the two color schemes, because the palette declared them flat and pinned
  `color-scheme: dark` at zero specificity; the header claimed the opposite. What moved were
  FOURTEEN strays — the status trio and its dependents — carrying light arms tuned for an
  off-white canvas the palette never presented, which is why `--fail` read 2.34:1 and twelve
  `carbone|light|*` entries sat in KNOWN_SUB_THRESHOLD. Carbone is curated a real light face
  and takes the house two-file shape, so `theme: carbone` now resolves LIGHT (breaking) and
  `carbone-dark` carries the byte-identical graphite values. The electric lime is 1.47:1 on
  an off-white canvas and cannot carry text, so `--accent`'s light arm holds the SAME hue at
  95% of the chroma and 60% of the lightness (#037829, 5.24:1); the bright value stays the
  brand axis and the spectrum, and `--surface-inverse` stays graphite on both faces so the
  code block keeps its terminal register. The trio had to be solved TOGETHER against AA on
  the self-tinted composed band, twelve frozen CVD ratchets and an absolute AA gate on the
  card — no solution exists with hues fixed; small rotation found one (tightest clearing margin +0.0126). The
  last KNOWN_BELOW_AA sanction (`errorTextColor`) retires as a side effect, without the CVD
  trade the recorded alternative required, because the light arms finally land on the canvas
  they were written for.
---

# Carbone's light face

## 1 · What was actually wrong

Carbone shipped as the one palette that did not use `light-dark()` switching. Its
manifest said `modes: ["dark"]`, it pinned `color-scheme: dark` at zero specificity,
and its header told authors that "an author needing a light carbone should pick a
different palette".

The header also claimed that a `color-mode: light` deck "renders fully styled: every
token this palette leaves to the engine resolves to the engine's LIGHT arm, so the
canvas, the text tiers and the status trio all come out legible."

Resolved rather than assumed, the opposite was true. Across base plus palette, **289
of 303 tokens are IDENTICAL in the two schemes** — carbone declared them flat, so the
canvas did not go light and the text tiers did not move. What moved were **fourteen
strays**: the status trio and its dependents, carrying light arms tuned for an
off-white canvas that did not exist.

That is why `--fail` read 2.34:1, why `--pass` read 3.90:1, and why twelve
`carbone|light|*` entries sat in `KNOWN_SUB_THRESHOLD`. They were not
light-mode bugs. They were light-tuned inks measured on a canvas that stayed dark.

The seam is real, not theoretical: `section.light` / `section.print` set
`color-scheme` on the ELEMENT and govern their own subtree past a `:where(:root)`
pin, so a `_class: light` slide flipped the status ink while the canvas held.

## 2 · The lime, which is the whole problem

Carbone's identity is `#7DE38A` on graphite — 10.95:1, and genuinely good.

The same lime is **1.47:1 on an off-white canvas**. There is no canvas lightness a
light mode would accept where it carries text. That is the real reason the palette
punted, and any light face has to answer it.

The answer is to move the lime along ONE axis. `--accent`'s light arm is `#037829`:

| | hue (OKLCH) | chroma | L | on canvas |
|---|---|---|---|---|
| dark arm | 146.8 | 0.156 | 0.832 | 10.95:1 |
| light arm | **146.8** | **0.148** | 0.500 | **5.24:1** |

Same hue, **95% of the chroma**, at 60% of the lightness. A darker *electric* green,
not a desaturated forest one — the distinction the curation turns on. An early
hand-picked candidate (`#2F6B39`) cleared AA at 5.96:1 with barely half the chroma
and read as a muddy pine; solving in OKLCH instead of by eye is what kept the hue.

Three things carry the identity across the split rather than the lime alone:

- `--brand-accent` stays `#7DE38A` on both faces — it is the axis, not a use;
- `--spectrum` keeps the same GESTURE rather than the same values — canvas, structural
  mid, accent — flipped per stop, because `light-dark()` is a color function and cannot
  wrap a gradient. Measured against each face's own canvas the two arms are the same
  shape (start 1.11/1.17, mid 1.54/2.66, end 10.95/5.24). Shipping shared stops, which
  is what the first cut did, put a near-black bar across every light slide; the lime tip
  survived, which is exactly what made it easy to miss;
- `--surface-inverse` is graphite on **both** faces, so the code block keeps its
  terminal register and all twelve `--hljs-*` values stay valid, unchanged.

## 3 · The trio, solved together

The status trio could not be moved one token at a time. Three constraints bind it at
once, and any two are easy:

1. **AA on the composed band**, not on the canvas — `--pass-bg` is an 18% tint of the
   ink itself over the card, and `.stacked` puts that over a 5% own-hue card. The
   ground moves with the ink, so only the ink can move.
2. **Twelve frozen CVD distances** (`cvd-trio-floor.test.js`), ratcheted: a pair frozen
   at or above 0.15 must still clear 0.15; one frozen below must not drop further.
3. **AA on `--bg-alt`** for warn, which `theme-surface-aa.test.js` gates absolutely —
   there is no exemption list.

Holding all three with hues fixed has **no solution**. The search found one only after
allowing small hue rotation, which the CVD gate's own guidance anticipates ("solve the
trio TOGETHER — magnolia needed `--warn` lifted with `--fail`"):

| token | light arm | rotation | on card |
|---|---|---|---|
| `--pass` | `#19531F` | −6° | 7.72:1 |
| `--warn` | `#A55400` | +8° | 4.59:1 |
| `--fail` | `#580006` | 0° | 7.84:1 |

CVD margin over the binding frozen pair: the tightest CLEARING margin is **+0.0126**, at
`pass^warn` under achromatopsia (0.1226 against the 0.11 floor).

An earlier revision of this note, three commit messages and a slide of the demo deck all
said **+0.0024**. An independent checker could not reproduce that number from any
pair/floor/frozen combination using the repo's own `simulate` and `oklabDistance`, and
neither can I. It is withdrawn rather than explained: a number nobody can re-derive is
worth less than no number, because it reads as evidence. The trio is still close to the
boundary of what the three constraints jointly permit — that part was true.

`--warn` sits at the 3:1 graphical floor on its own pill rather than AA. That is not a
new concession — carbone's warn pills were already sanctioned sub-AA on **both** faces
before this change.

## 4 · What retired on its own

`errorTextColor` was the last entry in `KNOWN_BELOW_AA`, and the previous PR
deliberately declined to force it: pinning the trio flat fixed the pair but dropped
`warn^fail` under deuteranopia through the 0.15 collapse floor. It was raised with the
measurement rather than taken.

Curating a real light face resolves it **from the other side**. The light arms now land
on the off-white canvas they were always written for, so the pair clears without the CVD
trade ever being made. `KNOWN_BELOW_AA` is empty, and the sanction's stale arm is what
reported it — the gate deleted its own last excuse.

Twelve `carbone|light|*` composed sanctions went to four — but that count, on its own,
describes attrition and hides an addition. **Three of the surviving keys are NEW**, created
by this change: `policy-recommendation/amend-badge` (4.27) and `default-badge` (4.43) did
not exist before, and `kanban/card-code-chip` did not either. Only the two `kpi` warn pills
carry over. Under HARD RULE #18 a newly sub-AA surface a change creates is a window that
change created, so it is named here rather than netted off against the twelve.

`kanban/card-code-chip` was then FIXED rather than sanctioned: `--code-inline-fg` inherited
`var(--accent)`, and because the chip is a 10% wash of that same value the ink was measured
against a ground made from itself — 4.55 on `--bg` and **4.17 on `--bg-alt`**, below AA. Its
light arm is pinned to `#006E24` (hue held, one step darker): 5.16 / 4.73. The sanction is
deleted, not re-frozen.

## 5 · One baseline taken down by hand

`carbone|light|kpi/warn-pill` moved 4.07 → 3.45, which `palette:bless` refuses to do on
its own and correctly held.

The 4.07 is not a comparable baseline: it measured a light-arm ink on a **dark** canvas.
The proof is in the same table — `carbone-dark|light|kpi/warn-pill` resolves through the
same import chain to the same CSS and, having no frozen entry to hold, recorded today's
measurement of 3.45. Two keys for one rendering cannot both be right, and the one that
was never rendered is the one that moves.

## 6 · What this cost elsewhere

- **`paired-token-parity`** exempted carbone wholesale as a single-canvas palette. That
  exemption is gone, and the test now finds real overrides in carbone for the first time.
  One is deliberate: `--panel-edge-mark` is pinned to the bright lime because the split
  panel it sits on is `--surface-inverse`, graphite on both faces. It is recorded in a
  new `SANCTIONED_FLAT_OVERRIDES` map that fails BOTH ways — an unlisted override, and a
  listed entry that stops being flat. Both arms were watched red before the entry landed.
- **`texture-ramp`** pinned "carbone's single ramp is dark and gets the dark arm".
  Carbone was the only shipped palette exercising that branch. The assertion is kept,
  driven by a synthetic ramp, rather than deleted with its last exerciser.
- **`portal-color-scheme`** used carbone as its always-dark example. It is a normal
  flipping palette now; the a11y set still covers the edge the test is named for.
- **`bless-palette-baselines`** pins the table sizes. `CVD_FROZEN` is 792, up from 768:
  33 themes × 2 modes × 3 pairs × 4 conditions.

## 6b · Three things the gates never caught

The gates were green at every step below, and none of these was found by them. All three
were found by rendering the deck and looking at it, which is what the QUALITY BAR is for.

**The washes were chalk.** `--pass-bg` and friends were `color-mix(… var(--pass) 18%, …)`,
and the light inks sit at OKLCH L 0.29-0.55 because AA-on-a-self-tinted-band and the CVD
ratchets pin them there. Pouring 18% of a near-black into a light card yields a GRAY:
`--pass-bg` measured chroma **0.0178**, `--fail-bg` **0.0156** — very nearly achromatic.
Curating the SOURCE decouples the two jobs; the ink keeps the contrast and the CVD
separation, the wash carries the color. Both improved (pass 0.0178 → 0.0661, ink-on-band
5.78 → 7.04). Not the house 10% (indaco, cuoio): their inks are dark too, so a smaller pour
of a dark ink is fainter mud rather than cleaner color. The percentage was never the lever.

**The ribbon was the dark one.** `--spectrum` shipped identical stops on both faces —
sampled across the slide, both measured `srgb(16,16,18) → (58,58,63) → (122,219,135)`. The
lime TIP was there, which is what made "the ribbon keeps the electric value on a light
slide" read as verified; the other 70% is near-black, and on off-white that is a foreign
stripe. The gesture carries, not the values: canvas → structural mid → accent, flipped per
stop because `light-dark()` is a color function and cannot wrap a gradient. Against each
face's own canvas the arms are now the same shape (1.11/1.54/10.95 dark, 1.17/2.66/5.24
light). The light arm ends on the deep lime: `#7DE38A` is 1.47:1 here and a 4px ribbon in it
washes out.

**The ground was achromatic, and that is the one that mattered.** The first light face was
built by INVERTING carbone's dark ramp — and bone-on-graphite is achromatic by construction,
which is exactly why the dark face works (value contrast plus one electric accent). Inverted,
it is neutral gray ink on neutral gray paper, with no lime doing the work because the accent
had to darken to carry text. Measured against the palettes that set the bar:

|                | `--text-body` chroma | card chroma |
|---|---|---|
| carbone (was)  | 0.0067 | 0.0073 |
| cuoio          | 0.0283 | 0.0136 |
| indaco         | 0.0736 | 0.0074 |

Both references share what carbone lacked: tinted paper, chromatic ink, tinted NEUTRAL rows.
Their monochrome is a monochrome with color in it. Carbone's is now a cool graphite at
OKLCH h=252 — paper C 0.0068, body ink C 0.0455, between the two.

**A green ground was tried first and rejected, and the reason generalizes.** At h=165 the
paper tied beautifully to the lime, and swallowed the semantic pass state: canvas, neutral
rows and pass rows were all green together. **A palette's monochrome must differ in hue from
its semantics, or the signal stops reading as a signal.** That is why indaco is navy and
cuoio is warm brown while both keep a green pass. Nothing fails a gate when you get this
wrong; the deck simply stops communicating state.

## 7 · What the independent checker found

One tier-1 checker reviewed the diff (HARD RULE #25 — a whole-palette rewrite plus changes
to gates shared by all 33 themes is squarely maker-checker). It confirmed the load-bearing
claims and found real defects. Worth recording both halves.

**Confirmed:** the dark face is byte-identical (all 304 tokens resolved and diffed; the only
moves are the three `--scheme-dark-*` values, which nothing outside carbone's own pairs
reads); the three-layer contract holds on the current canvas; `--warn` clears AA on the card
at 4.60; both arms of `SANCTIONED_FLAT_OVERRIDES` work for a correctly-keyed entry; the
texture-ramp synthetic ramp is byte-identical to carbone's real dark fills; the per-stop
spectrum survives the real export flattener AND the committed PDF's pixels; no missed light
arm anywhere in `--c1..12`, `--diagram-*`, hljs or the chart family.

**Found, and fixed here:**

- **A sub-AA surface I created and did not notice.** `--code-inline-fg` inherited
  `var(--accent)`; the chip is a 10% wash of that value, so the ink was measured against a
  ground made from itself — 4.17 on `--bg-alt`. Fixed at the value (§4), not the comment.
- **The demo deck shipped a truncated sentence** on its title slide, in the committed PDF.
- **Numbers that were true when measured and stale after a later commit** — the cat-cycle
  figures were taken on the neutral canvas and never retaken after `535d7c5`; the spectrum
  table cited a canvas that commit deleted; the chroma table had the card figure sitting in
  the body column. All re-derived against the tree.
- **`+0.0024` is not derivable at all** and is withdrawn (§3).
- **24 `carbone-dark` CVD rows recorded distances the tree never measured**, leaving two
  keys with different high-water marks for the same rendering. Reset so they take today's
  measurement; 11 of 12 dark rows now agree with `carbone`'s. The twelfth is pre-existing
  drift on `main`, off-path under #18.
- **`SANCTIONED_FLAT_OVERRIDES` could rot on the THEME half of its key** — a key naming an
  untested, renamed or typo'd theme sanctioned nothing and was never reported. A third
  assertion closes it, mutation-proved with the checker's own defeating input.
- **`--spectrum` leaked unresolved `light-dark()` into a generated artifact.**
  `build-docs-portal.js` matched `light-dark()` whole-value-only, so a per-stop gradient
  fell through. It was the only `light-dark(` in the repo's generated output and
  `build:check` was green. The resolver now collapses embedded occurrences.
- **Four comments in `carbone.css`, and three live docs, still said carbone was dark-only** —
  including shipped website copy.

**Not fixed, disclosed:** `palette:bless` destroys hand-written prose inside the map it
rewrites (it regex-replaces the whole block), which cost the `chart/status-pill` #1807 note
in this diff. Pre-existing tool behavior, off-path here, worth its own change.

## 8 · What is NOT verified here

The gates are green (7364/7364, `build:check` OK), but a palette is a visual artifact and
the gates measure numbers, not taste. The rendered gallery in both faces is the evidence
that matters for the QUALITY BAR.

That render has now been done, and it is what §9 is about. All 117 gallery slides were
rendered and reviewed on the light face. The dark face was rendered and compared
PAGE BY PAGE against the same deck built from `origin/main`'s carbone: **115 of 117 pages
are byte-identical rasters**, which is what turns "the dark values did not change" from a
token diff into a measurement. The two that differ are the deck's two
`<!-- _class: divider light -->` slides, and they differ because the modifier now WORKS --
see the changelog fragment, which called this out before the render confirmed it.

Goldens and example PDFs that resolve `theme: carbone` will re-render LIGHT after this
change. They are re-blessed as part of the same change; any that are not are a defect.

## 9 · The mark-vs-ink trap, and the over-scoped fix that made it worse

Two mistakes, and the second is the more instructive one.

### 9.1 · The defect the sweep caught

The five `--chart-state-*` light arms shipped in this branch at **~3.24:1 on the canvas,
all five**, and the integration palette sweep failed on one: a kanban "Done" column header
at 3.24:1, over carbone's ceiling of 0.

It is not a typo. `--chart-state-N` is a **hue**, and `chart-family.css` spends it two ways:

- `--state-N-fill` mixes it 24% into the canvas — a **mark**, floor **3:1** (WCAG 1.4.11);
- `--state-N-ink` uses it **undiluted**, and in one place that ink is **text** — floor **4.5:1**.

Tuned to the mark floor, the ink half was sub-AA.

### 9.2 · The over-scope, which introduced a CVD regression

The first fix took **all five** arms to the text floor, on the stated reasoning that "the
other four were one gallery slide away from the same defect." **That reasoning was false,
and an independent checker refuted it.** Grepping every text-color declaration in
`lib/**/*.css`, exactly one engine rule paints a `--chart-state-*` ink as text — the kanban
"Done" column header (`kanban.styles.css:88`, plus its `.tinted` variant at `:436`) — and
both are `pass`. (`state-chart`'s `--state-node-ink` / `--state-index-ink` are that
component's own tokens, resolving to `--bg-alt` / `--text-heading` / `--text-muted`; the
name collides, the token does not.) The other four inks are only ever a border, an SVG
stroke, a disc ring or a shape fill — 3:1 surfaces the mark values already cleared.

Moving all five cost something real. Lightness was carrying the group's separation under a
red-blind simulation, and pushing every arm down by a similar amount removed it. Measured
with `lib/theme/cvd.js`:

| protanopia | `pass` | `warn` | ΔEok |
|---|---|---|---|
| mark values | `#2A9D4A` → `#9f8f43` | `#E26400` → `#897800` | **0.0800** |
| all-five "fix" | `#006827` → `#695e20` | `#AE4B00` → `#685b00` | **0.0183** |

0.0183 is **3.3× under** the `SLOT_DISTINCT = 0.06` floor in
`test/unit/palette/chart-contrast.test.js`. On-track green and at-risk amber become one
olive on a gantt legend, a kanban lane edge, a status-pill border.

**No gate would have caught it.** `tools/cvd-audit.js` `tokenGroups()` measures categorical
fills, categorical marks, the chart spectrum and the `pass`/`warn`/`fail` **status trio** —
`--chart-state-*` is in none of them, and `cvd-trio-floor.test.js` is the trio only. Nothing
in the tree scores these five under a simulation. It was found by a checker, not a gate.

### 9.3 · What actually shipped

**Only `pass` moves.** `#2A9D4A` → **`#005B22`**: 7.06:1 on the card, 7.74:1 on the canvas,
hue held (148.36 → 148.47, drift **0.105°**) with lightness carrying the change. The other
four revert to their mark-tuned values, which were right for what they are.

Solved against every CVD axis as well as AA, against the mark-value baseline:

| axis | baseline (mark values) | shipped | |
|---|---|---|---|
| protanopia | 0.0705 (`fail^mute`) | **0.0705** | held |
| deuteranopia | 0.0439 (`pass^fail`) | **0.0696** | improved |
| tritanopia | 0.0259 (`warn^fail`) | **0.0259** | held |
| achromatopsia | 0.0000 (`pass^info`) | **0.0000** | held (pre-existing, see below) |
| normal vision | 0.0768 (`warn^fail`) | **0.0768** | held — no `pass` pair binds |

`pass` sits **0.0932** off `--accent`'s light arm (`#037829`), so the brand green and the
pass green stay two colors. The dark arms are untouched, re-proved by the page-by-page
raster comparison in §8.

The achromatopsia 0.0000 at `pass^info` is inherited from the mark values and is not made
worse here; under total color blindness these two are separated by the texture channel
(`engineering/textures.md`), not by hue.

### 9.4 · The rules worth keeping

1. **A token used as both a mark and an ink takes the ink floor — for the arms that are
   actually spent as ink.** The 3:1 floor is right for what the token is *named* after and
   wrong for what it is also *spent* on, and nothing in the name says so. But "spent as
   ink" is a fact to **grep for**, not to assume from the token family.
2. **Consistency is not free.** Taking the other four along "for consistency" read as
   tidiness and was actually a change with a measured cost on an axis nobody was watching.
3. **A palette change is not verified until it is simulated.** AA is one axis. This group
   has no CVD gate at all, which is a hole worth closing — see §9.5.

## 9.5 · Two gaps found on the way, both PRE-EXISTING and both off-path

Logged, not fixed here — HARD RULE #18's rule for a defect you find rather than cause.
Neither is a live defect today; both are traps for the next change.

**(a) The status family has no ink gate.** `--chart-state-*` is scored as a *ground* by
`tools/composed-contrast.js` (pill stops, kanban wash, with `--text-heading` as the ink) and
never as ink itself — `grep "ink: '--state"` returns nothing. Compare the categorical family,
which has a derived `--chart-catN-ink` tier with an AA gate in `build:check` ("all 240 inks
clear AA on --bg and --bg-alt"). The status family has no equivalent. Measured today, on each
theme's own light `--bg`, if these arms *were* spent as text:

| palette | sub-AA as ink |
|---|---|
| `onyx` | warn 3.56, mute 2.18 |
| `concrete` | warn 3.67, info 3.83, mute 2.87 |
| `laguna` · `carta` · `brina` · `indaco` | mute 3.26 / 3.81 / 3.93 / 4.10 |

**None of these is a live defect**, because per §9.2 only `pass` is ever painted as text, and
every shipped palette's `pass` clears AA on its own light `--bg` (checked, all of them). They
are latent: the first `color: var(--state-warn-ink)` rule anyone writes breaks six palettes
silently. `mute` is arguably by design (`MARK_MUTE_MIN = 2.0`); `onyx`'s warn and `concrete`'s
warn/info are not.

**(b) `--chart-state-*` is in no CVD token group.** `tools/cvd-audit.js` `tokenGroups()` covers
categorical fills, categorical marks, the chart spectrum and the `pass`/`warn`/`fail` status
trio; `cvd-trio-floor.test.js` is the trio only. Nothing simulates these five as a group —
which is why the §9.2 regression got all the way to a green PR. `cvd-audit.js` is also a
report that exits 0, not a gate.

Both are a change to what CI runs, so neither is taken here.

## 10 · A gate floor this change was holding down

`tools/composed-contrast.js` scored the kpi pill's border on two tiles with two different
floors: **3 on the card, 2.5 on the hero.** The 2.5 was not a design position. Its own
comment said so:

> Both hero exceptions are carbone's light arm, whose trio is inks for a light canvas the
> palette does not have yet (#1302); when that lands, the hero floor rises to 3 and this
> note goes.

The population was bimodal and carbone|light owned the whole bottom — 2.60 on the hero,
3.39 on the card — while every other palette-mode read 4.10 or better. Those inks were
being measured against a ground that did not exist, which is the same root cause as §1.

This change is the "when that lands." The two pairs that forced the exception now read
**7.91** (`pass`) and **4.70** (`warn`) on the hero, so the floor is raised to **3** on both
tiles and the exception is deleted. The full run is unchanged at **14 of 4290 frozen, 0
degraded, 0 stale, 0 unresolved** — no other palette-mode was relying on 2.5.

Worth noting for its own sake: a gate threshold lowered for one broken palette outlives the
breakage unless the fix goes looking for it. This one left instructions; most do not.
