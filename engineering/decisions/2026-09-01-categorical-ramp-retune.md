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
plane — their hue and chroma. So any two neighbours on the color wheel had nothing at all, and the
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
| slots 5 ^ 10 (`#D1C5DC` vs `#D9C7DC`) | **0.0130** | **0.0574** |
| slots 3 ^ 8 (`#E7BEBE` vs `#E6C1C8`) | **0.0132** | **0.0321** |

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

## What ships

**255 values across 15 palette files** (the 18 `-dark` faces `@import` and flip scheme; they
declare no cycle of their own). Every value is a lightness move on a held hue.

**The catalog: 75 readings below floor -> 6.** All six are sanctioned in both
`tools/derive-cat-ramp.js` and the gate, each with the conflict that causes it:

| ramp | reaches | floor | why it cannot get there |
|---|---|---|---|
| `a11y-*` wash (5 palettes) | 0.0285 | 0.0295 | Flat hex: ONE mark ramp serves both canvases and owes a legible `--cat-N-ink` arm on both. Clearing the floor needs L 0.200–0.562, and `derive-cat-ink` cannot lift twelve inks clear of the `#000000` canvas over that span and keep them apart. 0.0285 is the widest ramp whose ink arm still solves — against a shipped 0.0180, so the family improved 58% and stopped one thousandth short. |
| `concrete-dark` wash | 0.0013 | 0.0295 | Lost the same veto at every rung; its `--bg` and `--bg-alt` sit close enough that widening the marks at all costs the ink arm. Shipped untouched rather than shipping a ramp we know breaks legibility. Its LIGHT fills did take the spread: 0.0013 -> 0.0316. |

`concrete` and `onyx` now carry §6's luminance-spread ramp — the half of *"give them the
`a11y-achromatopsia` treatment (luminance-spread ramp + textures)"* that `concrete` never got. The
2026-08-31 note called that out by name: *"`concrete` is exempt … because it really does carry a
texture channel, not because 0.0013 is a design."* Its light chips were twelve grays differing by
±2 in one channel; they are now a ramp.

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
0.0295–0.0318, so the headroom that note identified is still there and still unspent. Raising the
floor is a separate decision with its own visual cost, and it would move the references.

**The rendered change is real but subtle on a light canvas.** A before/after of the same twelve-wedge
Mermaid pie on `indaco` differs in 62,356 pixels — the collapsed pairs genuinely separate — but the
pale band is pale, and nobody will call it dramatic. That is what a 0.0295 floor buys. The honest
claim is that categories which previously rendered as one color no longer do, not that the pie got
prettier.

## Verification

Rendered and looked at, real export path, both canvases (HARD RULE #23): `examples/categorical-separation.md`
— a twelve-wedge Mermaid pie, a six-wedge pie, `list-steps capsule` badges, and a mindmap — on
`indaco` and `indaco-dark`. **Dark-mode Mermaid was the gap the 2026-08-31 note marked UNVERIFIED**,
on the reasoning that the tier swap is where the failure mode could invert; it is now rendered and
correct, twelve distinguishable jewel tones with legible labels.

Gates: `npm run lint`, `npm test` (7757 pass), `npm run build:check`. The solver is idempotent —
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
