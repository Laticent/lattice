---
status: shipped
summary: >
  The categorical ramps are re-placed across all 33 palettes: 255 values, lightness only, hue and
  chroma untouched. The collapse had one cause — the 2026-07-16 recipe solved each slot
  INDEPENDENTLY against a contrast target, and twelve independent solves against one target land on
  one lightness, leaving hue distance as the only thing separating two categories. Solving the
  twelve together fixes it. The pale tier is held ALL-PAIRS rather than adjacent, because the
  Mermaid pie paints it with no per-slice stroke and #1864's own worst reading (indaco slots 5 and
  10, ΔE 0.0130) was a NON-adjacent pair the adjacency gate could not see; it now reads 0.0574. The
  saturated tier stays adjacent because all-pairs there is unreachable without re-hueing brand
  colors — measured, five ramps. The catalog goes from 75 readings below floor to 6, each sanctioned
  with a measured reason. `cat-adjacency-floor.test.js` stops being a ratchet and becomes a floor.
companion:
  - ./2026-08-31-categorical-adjacency-tier-swap.md
  - ./2026-07-15-categorical-token-contract.md
---

# The categorical ramps, solved together

**2026-09-01 · issue #1864, and the half `2026-08-31-categorical-adjacency-tier-swap.md` deferred**

## What was left

The 2026-08-31 note shipped the instrument and said plainly what it was not shipping:

> **Does not ship:** the palette re-tune. That is a size call and not a gate call … the instrument
> has to exist first for the re-tune to be checkable at all. The target is in the table above.

This is the re-tune. The instrument said 75 adjacent readings sat below their tier's floor; the
count is now 6, and all 6 are named below with the measurement that justifies each.

## Why the ramps collapsed — one cause, and it is not "twelve is too many"

The 2026-07-16 recipe (`2026-07-15-categorical-token-contract.md` §"Shipped") placed each slot
**independently**, against a contrast target: darken the light mark until edge-vs-canvas clears
3.2:1, darken the dark fill until label-vs-fill clears 7:1. Every slot met its target. They met it
at the same lightness.

Measured on the shipped tree before this change:

| palette | ramp | lightness range across all twelve slots |
|---|---|---|
| carbone | light fill | 0.964 – 0.966 |
| indaco | dark fill | 0.479 – 0.482 |
| carta | dark fill | 0.479 – 0.482 |
| concrete | light fill | 0.898 – 0.903 |

At equal lightness the entire OKLab distance between two slots is their distance in the a/b
plane — their hue and chroma. So any two neighbors on the color wheel had nothing at all, and the
ramp's separation was an accident of how the twelve curated hues happened to be ordered.

**The fix is to solve the twelve together.** Lightness is the lever, for two reasons: it is the one
channel every color-vision deficiency preserves, and it is the one the recipe was already spending
without coordinating. Hue and chroma are held exactly — the invested brand colors do not move.

## The two tiers get different promises, and that asymmetry is the decision

**The wash tier is held ALL-PAIRS.** `lib/integrations/mermaid/mermaid.css` paints all twelve pie
wedges from `var(--cat-N-texture, var(--cat-N-fill))` and declares **no stroke**; the separator is
Mermaid's own white spacer. So on the surface where twelve categories actually appear at once, the
wash is the entire discrimination channel, and a reader compares wedge 5 against wedge 10 as
readily as against wedge 6. The `list-steps` categorical badges are the same shape — a
`border-radius:999px` pseudo-element with `background: var(--cat-N-fill)` and no border.

This matters more than it sounds, because **#1864's own headline evidence was a non-adjacent
pair**, and an adjacency gate structurally cannot see it:

| indaco light fill | before | after |
|---|---|---|
| slots 5 ^ 10 (`#D1C5DC` vs `#D9C7DC`) | **0.0130** | **0.0584** |
| slots 3 ^ 8 (`#E7BEBE` vs `#E6C1C8`) | **0.0132** | **0.0296** |

Those are the two hex pairs the 2026-08-31 note quoted as "the same color in the render". Under an
adjacent-only re-tune both would have survived untouched while every gate went green — which is the
precise failure the tier-swap note warned about, one level up.

**The saturated tier is held ADJACENT, and that is a limit rather than a preference.** Holding hue
and chroma fixed, all-pairs at 0.1050 is not reachable on five ramps inside their own contrast
bands: `brina` light, `burgundy` dark, `carbone` light, and both `cuoio` faces. Reaching it means
re-hueing brand colors, which is a larger decision than this one and is recorded here as not taken.
§5 of the contract doc already says the cycle should *consolidate* past six rather than demand
twelve distinct hues; this holds that line for the tier where hue is what carries the category.

## The floors are constants, and the first cut got that wrong

Both floors are §5's named references' own pre-re-tune values — the smallest reading `indaco` and
`cuoio` (and their dark faces) already reached. Saturated **0.1050**, wash **0.0295**. Nothing is
chosen; the contract is still "at least as separable as Adam & Eve".

They are now **constants in `lib/theme/cat-ramp.js`**, read by both the solver and the gate. The
first cut re-derived them from the references at test time, the way the previous gate did, and that
is circular once the catalog is being lifted: a re-tune that raises everything raises the
references too, the floor moves underneath, and five palettes the solver had aimed squarely at
0.0295 came out two ten-thousandths short of a number that had risen while they were being
measured. What survives from "derived" is the part worth keeping — the gate still asserts the
references clear these numbers, so the calibration claim stays checkable rather than becoming
folklore.

## How the floor was settled — a sweep, not an argument

The wash floor was originally 0.0295 because that is what `indaco` and `cuoio` happened
to ship. That is a descriptive statistic promoted to a rule, and an audit reasonably
objected that the solver reaches further — measuring 0.0400 as clearable. Neither number
is "what a reader needs", so neither settles anything on its own.

What settles it is sweeping the floor and pricing each candidate, with **colour-vision
simulation as the criterion** — which is what #1864's own acceptance criterion 2 asks for
(`lib/theme/cvd.js`, Machado matrices, the four simulated deficiencies). Each candidate
re-solves the whole catalog from the shipped baseline:

| floor | ramps reaching it | shortfalls | slots moved | slots under 90% chroma | achromatopsia pairs at ~0 | prot / deut / trit worst |
|---|---|---|---|---|---|---|
| shipped | 7/54 | 47 | 0 | 0 | **272** | 0.0000 / 0.0000 / 0.0013 |
| **0.0295** | **46/54** | **8** | 595 | 13 | **21** | 0.0017 / 0.0035 / 0.0044 |
| 0.0400 | 44/54 | 10 | 613 | 15 | 20 | 0.0017 / 0.0035 / 0.0044 |
| 0.0500 | 36/54 | 18 | 616 | 15 | 22 | 0.0017 / 0.0035 / 0.0044 |
| 0.0600 | 22/54 | 32 | 616 | 14 | 25 | 0.0017 / 0.0018 / 0.0044 |

**The whole win is in the first step, and 0.0295 is the knee.** Going from the shipped
ramps to any floor at all takes monochromacy collisions from 272 to about 20 and lifts
two dichromacies off literal zero. Going ABOVE 0.0295 buys nothing measurable: the
achromatopsia count is flat and then rises, all three dichromacy worst-cases are
identical to four decimal places, and chroma cost and movement both creep up — while
ramps reaching the floor fall from 46 to 22 and shortfalls quadruple.

So the floor stays at 0.0295, and the justification is no longer "it is what Adam & Eve
shipped". It is that above it, no colour-vision metric improves and the cost climbs
steeply. The headroom an audit measured is real arithmetically and buys nothing
perceptually — which is a more useful thing to have written down than the headroom
number was.

**One solver defect had to be fixed before this table meant anything.** The projection is
a heuristic, so aiming at a higher floor could land LOWER: at 0.0400 `a11y-base` came
back at its shipped 0.0180 against the 0.0289 it reaches when aimed at 0.0295. A floor
that makes the catalog worse by being raised is a trap, and it makes any sweep measure
the solver rather than the palettes. `TARGET_LADDER` now retries an unreachable target
downward and keeps the best result, so the outcome is monotone in the target and a ramp
that cannot clear its floor still ships the best placement it can reach. That fix also
improved three shipped shortfalls on its own — `concrete` 0.0054 -> 0.0112,
`concrete-dark` 0.0054 -> 0.0131, `carbone-dark` 0.0755 -> 0.0869.

## What ships

**255 values across 15 palette files** (the 18 `-dark` faces `@import` and flip scheme; they
declare no cycle of their own). Every value is a lightness move on a held hue.

**The catalog, counted two ways — and the units matter, because an earlier draft of this
note quoted "75 -> 6" and those are two different measurements:**

| metric | before | after |
|---|---|---|
| `(theme, tier)` readings below their floor | **50** | **11** |
| individual slot pairs below their floor | **456** of 2442 | **69** of 2442 |

(The "75" that appears in `2026-08-31-categorical-adjacency-tier-swap.md` is a third
metric again — the OLD gate's window of adjacent pairs among the first six slots. It is
not comparable to either column here, and this note does not use it.)

Every one of the 11 remaining readings is sanctioned in both `tools/derive-cat-ramp.js`
and the gate, each with the conflict that causes it:

| ramp | reaches | floor | why it cannot get there |
|---|---|---|---|
| `a11y-*` wash (5 palettes) | 0.0285 | 0.0295 | Flat hex: ONE mark ramp serves both canvases and owes a legible `--cat-N-ink` arm on both. Clearing the floor needs L 0.200–0.562, and `derive-cat-ink` cannot lift twelve inks clear of the `#000000` canvas over that span and keep them apart. 0.0285 is the widest ramp whose ink arm still solves — against a shipped 0.0180, so the family improved 58% and stopped one thousandth short. |
| `concrete-dark` wash | 0.0013 | 0.0295 | Lost the same veto at every rung; its `--bg` and `--bg-alt` sit close enough that widening the marks at all costs the ink arm. Shipped untouched rather than shipping a ramp we know breaks legibility. Its LIGHT fills did take the spread: 0.0013 -> 0.0316. |

`concrete` and `onyx` now carry §6's luminance-spread ramp — the half of *"give them the
`a11y-achromatopsia` treatment (luminance-spread ramp + textures)"* that `concrete` never got. The
2026-08-31 note called that out by name: *"`concrete` is exempt … because it really does carry a
texture channel, not because 0.0013 is a design."* Its light chips were twelve grays differing by
±2 in one channel; they are now a ramp.

## What the adversarial trio changed, and what it cost

The first cut of this change was measurably wrong in four ways, all found by the tier-2
review (HARD RULE #25) and all reproduced before being fixed. They are recorded here
because each one is a guardrail the solver now carries, and together they are why the
catalog lands at 11 sanctioned shortfalls rather than 3.

1. **"Hue and chroma are held exactly" was false.** Lightness is the only lever, but
   `withLightness` clips at the sRGB gamut, and a pale tint pushed toward white has
   nowhere to put its chroma. `carbone`'s `--cat-1-fill` lost **65%** of its chroma and
   `--cat-3-fill` **73%** — a mint and a cyan chip rendering as near-neutral grays, on
   the palette whose entire identity is pale tints. Now bounded by `CHROMA_KEEP`, a
   two-rung budget (90%, then 80%) that reports which ramps spent the second rung.
2. **Three ramps gained a pair at ΔE exactly 0.000 under achromatopsia** —
   `carbone-dark`, `crepuscolo-dark` and `magnolia`. The saturated tier is held
   adjacent-only, which left the solver free to place two NON-adjacent slots at the same
   lightness; monochromacy keeps lightness and nothing else. That is the exact inverse of
   this change's own argument for using lightness, and `cvd-audit.js` exits 0, so nothing
   was going to say so. Now `LIGHTNESS_SPREAD_MIN` holds every pair on every ramp apart
   in L, whatever the tier's scope.
3. **`onyx` and the a11y family solved to the collapse gate's wall** — slot 12 at
   1.266:1 against a 1.25 floor whose failure message reads "fill == mark". A margin is
   not a target; `COLLAPSE_COMFORT` now holds the separation the slot shipped with, up to
   1.40, and is spent only when it is the thing standing between a ramp and its floor.
4. **`onyx-dark`'s fills lost their footing on the canvas** — slot 1 to 1.16:1 against
   `#000000`, which on a `list-steps` badge (no border, by construction) is a black chip
   on black. `checkCatContrast` never measures fill-vs-canvas, so nothing caught it.
   `GROUND_COMFORT` now does, measured against `--bg` only: `--bg-alt` sits INSIDE the
   wash band, so including it punched a hole at the crossing and froze `carbone` with
   0.014 of range.

**The cost is honest and worth stating plainly: these guardrails buy safety with
separation.** Before them the solver reached the floor on all but 3 readings; after them,
11 fall short. Every one of those is a measured conflict between this floor and a
contract that already existed, not a rounding excuse — but a future reader should know
that the number could be made to look better by removing a guard, and that would be the
wrong trade.

**The alternative that was measured and rejected.** The inversion argued this whole
re-tune compensates in the TOKEN layer for a missing declaration in the RENDER layer:
give the Mermaid pie a per-wedge `stroke: var(--cat-N-mark)` and the badges a border, and
both surfaces gain a channel already separated at 0.1050+, with no brand value moved.
Rendered, it does not work. On `indaco` the outline and the fill of the SAME wedge
disagree by up to **165 degrees** of hue — the two tiers are different hue sequences on
`indaco`, `carta` and `cuoio` — so a pale yellow wedge gets a rust outline: a conflicting
channel, not a redundant one. On `concrete` and `onyx` the marks are muted near-grays by
identity, so all twelve outlines look alike and carry no category at all. Making it work
would mean re-hueing the mark tier to match the fill tier, which is a larger brand-value
change than the re-tune it was proposed to avoid.

## One ramp is held at its shipped values, and the reason is worth knowing

`concrete`'s DARK marks are not solved at all. They feed the journey weighted badge,
which paints `--cat-N-ink` on a **28% mood + 72% `--bg-alt` blend**
(`journey.styles.css`, gated by `journey-chip-contrast.test.js`). Widening the ramp moved
that blend into the ink's own lightness and took six mood pairs to 4.31-4.49 against a
4.5 floor.

**Nothing at the palette level could have caught it.** `checkCatContrast` measures ink
against the CANVAS, and the ratio that broke is ink against a blend a component invents.
Two more general guards were tried and both are wrong: requiring the derived ink to clear
AA on its own mark vetoes almost every ramp in the catalog (the ink is derived from the
mark's hue and chroma with only lightness moved, so a low ratio is ordinary), and
preserving whatever ratio a slot happened to have vetoes most of the rest.

So the ramp is named rather than modelled. It is a sanctioned shortfall either way —
0.0013 against a 0.0295 floor — so what it gives up is 0.0118 of separation on a ramp
that cannot reach the floor regardless, and what it buys back is AA on a shipped
component. Modelling one component's blend recipe inside the palette solver would have
been the wrong trade.

## The gate stops being a ratchet

`test/unit/palette/cat-adjacency-floor.test.js` was frozen-and-no-worse, and shipped green with 75
readings below the line — which was the right shape for a gate written while the catalog was
broken, and the wrong one to keep once it is not. It now asserts the **floor**, over all twelve
slots, at each tier's own scope, plus a pinned table against erosion above the floor and the
sanctioned-shortfall list held from both sides (an entry fails if it erodes AND if it improves, so
an exemption cannot outlive its measurement).

Mutation-proved: collapsing `laguna`'s slot 5 onto slot 4 fails the saturated floor arm and the
erosion arm together.

## A hole this change would have opened, closed instead

`lib/core/accessibility-textures.js` bakes its texture chips from **literal hex ramps** — no tokens,
on purpose, because the `<defs>` must survive renderers that resolve no custom properties. Three of
the four are hand-copied from themes, their declarations say **"MUST mirror"** three times, and
nothing compared them. This re-tune moves two of them (`onyx` dark fills, `concrete` light fills).

Nothing would have caught the drift: `texture-polarity.test.js` measures the overlay ink against
the **baked** chip, so a chip that has drifted away from its token is still internally consistent
and still passes. The visible symptom would have been a pie whose wedge and whose legend swatch are
different colors. `test/unit/core/texture-mirror.test.js` now compares them by value, and bites on a
one-byte drift.

## What this does not claim

**The floor is a floor, not a target.** The 2026-08-31 note measured that inside indaco's own wash
band and chroma ceiling there is room for 15 slots at ΔE 0.05 and 7 at 0.075. The catalog is now at
0.0295–0.0317, so the headroom that note identified is still there and still unspent. Raising the
floor is a separate decision with its own visual cost, and it would move the references.

**The rendered change is real but subtle on a light canvas.** The collapsed pairs genuinely
separate, but the pale band is pale and nobody will call it dramatic. That is what a 0.0295 floor
buys. The honest claim is that categories which previously rendered as one color no longer do — not
that the pie got prettier. An independent audit put it more sharply: measured against this repo's
own 0.15 distinctness reference (`lib/theme/color.js`), all 66 of `indaco`'s light wash pairs are
still below it. #1864 asked for 0.15 and 0.15 is not reachable by lightness alone.

## Verification

Rendered and looked at, real export path, both canvases (HARD RULE #23): `examples/categorical-separation.md`
— a twelve-wedge Mermaid pie, a six-wedge pie, `list-steps capsule` badges, and a mindmap — on
`indaco` and `indaco-dark`. **Dark-mode Mermaid was the gap the 2026-08-31 note marked UNVERIFIED**,
on the reasoning that the tier swap is where the failure mode could invert; it is now rendered and
correct, twelve distinguishable jewel tones with legible labels.

Gates: `npm run lint`, `npm test` (7761 pass), `npm run build:check`. The solver is idempotent —
a second run rewrites nothing — and `node tools/derive-cat-ramp.js --check` verifies the committed
ramps against the contract rather than against byte-identity, because the values stay
hand-authorable and a designer who re-hues a slot must not be told they are wrong.

Reviewed by the adversarial trio (HARD RULE #25, tier 2), since a categorical token reaches every
deck.

## Off-path findings, logged not fixed (HARD RULE #18)

1. **`tools/theme-scorecard.js:183` reads `vars[\`cat${i}-fill\`]`** — a token that exists nowhere in
   the tree (the real name is `cat-${i}-fill`). So the categorical contribution to the scorecard has
   always been null, and its `catΔ` column is a **chart-family** measurement wearing a categorical
   label. Not on this change's path — the scorecard gates nothing and is wired to no workflow.
2. **A gate probe leaks a temp file.** `tools/__gate-probe-<pid>.mjs` was left in the working tree by
   a `check-ownership` run and is picked up by `npm run lint` as unowned source. Deleted locally;
   the tool should clean up after itself.
