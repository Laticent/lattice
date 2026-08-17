---
status: shipped
summary: The SECOND #1527 prerequisite — a palette's curated value being worse, on a surface a COMPONENT composes, than the base default it overrides. #1681 closed the flat-over-pair class and logged this one as unfixed; measuring it with a gate that models the composite found 102 such regressions across 32 palettes, not the 7 the ticket listed, and none was visible to any gate because `contrast-audit.js` scores an ink against `--bg` and never against the `-bg` mix a component paints it on. The dominant cause was not the curated hues but TWO `opacity` washes in `redline` — `del` at .85 and `.stacked`'s OLD card at .78. A CSS opacity composites the subtree buffer, ink AND band together, so it drags the ink toward the backdrop while the 12%-of-itself band under it barely moves; removing both took the sub-bar population from 313 to 231 before a single palette value changed, and roughly halved the moves the rest needed (carta's `--fail` wanted OKLab dL -0.090 with them, -0.048 without). Ten palette arms then move. The first solve took the smallest step along the OKLab lightness axis and adversarial review found it had broken something distant: pass^fail under PROTANOPIA went 0.158 -> 0.094 on ardesia and 0.152 -> 0.087 on laguna, straight through the 0.15 collapse floor — and laguna's shipped value is recorded in CHANGELOG.md as chosen for exactly that floor. Nothing gated it: cvd-audit exits 0, and cvd-palette.test.js covers only the four a11y palettes. The arms were re-solved as TRIOS, spending hue where lightness alone could not (magnolia's --fail needed +0.084 L and -14deg to clear its band without closing on --warn), and a new gate freezes the 219 status pairs that are CVD-distinct today. Zero trio pairs collapse; eight become distinct that were not. The composed-surface gate is `tools/composed-contrast.js`: 24 surfaces across five components, resolved through the engine's own resolveTokenExpr and the canonical themeChain, scored in BOTH cascade orders, with a budget-0 regression arm and a keyed frozen baseline (313 -> 166) that fails on a new failure, an existing one getting worse, and a stale entry alike. `check-slide-contrast.js` now reads element opacity too, validated against sampled pixels to within 0.01. Proven both ways on the real render across all 32 palettes x 6 slides: with the #1527 one-liner applied locally, 0 of 2496 runs regress and 261 newly clear their bar; without it the token changes are inert but the opacity removals are not — 204 runs newly clear on the export path today, and indaco's struck clause goes 3.21 -> 5.85:1 in sampled pixels. Logged, NOT fixed: the canvas-blind sequential ramp (#1697) and the status trios on their own-hue tints (#1698), both failing identically before and after the flip.
---

# The composed surface, and the gate that could see it

**2026-08-17 · branch `claude/palette-contrast-gate-fmjyfd` · #1640 items 1–2 follow-up**

**Area:** `tools/composed-contrast.js`, `tools/check-slide-contrast.js`,
`lib/components/comparison/redline/redline.styles.css`, `themes/*.css`,
`lib/base/base.tokens.css`

## Why this exists

`2026-08-16-flat-palette-dark-companions.md` (#1681) closed the first #1527
blocker — palettes overriding a base `light-dark()` pair with a flat value — and
ended with **§ Logged, not fixed**: two more blockers of a different shape, which
it correctly said were *not* structurally detectable the way the first one was.

> a palette's own CURATED value is simply worse than base's default on a surface
> a COMPONENT composes — and no gate looks at composed surfaces.

That is this note. `tools/contrast-audit.js` checks each ink against `--bg` and
`--bg-alt`, the two opaque canvases a palette declares. It cannot see:

- **an ink on a tint of ITSELF.** `redline` paints `<ins>` / `<del>` on
  `--pass-bg` / `--fail-bg`, which are `color-mix(in srgb, var(--pass) 12%,
  transparent)`; `checklist` washes its state rows the same way; `kpi`'s status
  pill and `policy-recommendation`'s stance badge likewise. The background moves
  with the ink.
- **that band on a SECOND own-hue tint.** `.stacked` / `.split` / `.three-col` /
  the block-split `rl-old` / `rl-new` cards are a 4–5% own-hue wash over
  `--bg-alt`, so the band lands two own-hue layers deep.
- **an ink the BASE derives.** `word-cloud spectrum` paints `--seq-700/500/400`;
  base derives those from the palette's `--seq-500` anchor in OKLab.
  `contrast-audit` skips the `lattice` @import entirely, so it has never scored a
  base-derived ink at all.
- **element `opacity`.** Neither audit read it, and neither did
  `tools/check-slide-contrast.js` — see § The wash.

## The scope was an order of magnitude bigger than the ticket's

Measured with the new gate on `origin/main`, over 32 palettes × 2 modes × 24
surfaces = **1536 pairs**, scored in both cascade orders, with `redline`'s two
washes modelled as the `groups[].opacity` they are:

| | main (base wins) → palette wins |
|---|---|
| surfaces that regress across the flip | **102** |
| surfaces below their bar at all | **313** |

#1640 listed seven regressions (five brand palettes' redline runs, and the
word-cloud spectrum on onyx / concrete / the four a11y palettes). The seven are in
the 102, at the numbers it quoted. It missed the rest for three reasons, all
reusable:

1. **It measured two components' default variants.** The `.stacked` / `.split`
   cards put the same ink two own-hue layers deep, which is a different number on
   the same token; `checklist`, `kpi` and `policy-recommendation` build the same
   shape out of the same tokens on three more components.
2. **Its numbers for `<del>` came from `check-slide-contrast.js`, which could not
   see `opacity`.** #1681 knew and said so; what it could not know without
   sampling pixels is how much that hid. The tool's ranking of *which* palettes
   regress was wrong, not just its magnitudes — `magnolia`'s `--fail` reads as a
   LIGHT-mode regression through the optimistic number, and is in fact an
   improvement there and a regression in DARK.
3. **A straddle-only regression test is not the invariant.** Firing only when the
   base clears the bar and the palette does not misses a regression where the base
   itself lands a hair under (carta's `redline/ins-on-new-card`, 4.49 → 4.41), and
   lets an already-failing pair degrade without limit. The arm here is *below its
   bar AND worse than the base default*.

## The wash — where the damage actually came from

The prior attempt to gate this class was reverted, and `contrast-audit.js` records
why: *"it can't be met without damaging the curated hues."* Measured, that is half
right. The dominant cost was not the hues. It was two `opacity` declarations:

```css
section.redline del, section.redline s { … opacity:0.85; }                 /* removed */
section.redline.stacked.stacked > … > blockquote:nth-of-type(1) { … opacity:0.78; }  /* removed */
```

CSS `opacity` renders the subtree to a buffer and composites the **whole buffer —
the ink AND the `--fail-bg` band under it — at that alpha.** Because the band is
only 12% covering to begin with, the wash moves the ink a long way and the band
almost not at all. The two nest: a struck clause inside a `.stacked` OLD card
renders at an effective 0.663.

Measured on `origin/main`'s own palettes, changing nothing but the model:

| | regressions | below their bar |
|---|---|---|
| `origin/main`, both washes | 102 | 313 |
| same palettes, washes removed | **65** | **231** |
| washes removed + the ten arms re-solved (**this change**) | **0** | **166** |

That is 82 composed pairs cleared by deleting two declarations, before a single
curated hue moved. And what the washes cost the palettes that *did* need
re-tuning — the same solve, run with and without them:

| palette · token | with the washes | without them |
|---|---|---|
| carta `--fail` (light) | dL −0.090 → `#9D0024` | dL −0.048 → `#AF102D` |
| magnolia `--fail` (dark) | dL +0.151 | dL +0.084 |

The middle row of that table understates the `.78` card, and the reason is worth
recording: with the wash present, the `.stacked` OLD **label** (`--fail` on the 5%
card, through the 0.78) is a distinct surface; once the wash is gone it is
arithmetically identical to `redline/old-label`, so the shipped catalog carries one
surface where `main` needs two. The label's real cost shows up in the render
instead — indaco's `.stacked` struck clause at **3.21:1**, sampled off pixels.

`base.tokens.css` already states the rule this follows, one tier up: **"If you need
a quieter label here, spend size or weight, not alpha."** A struck clause in a legal
diff is carried by the line-through, the `--fail` hue, the tinted band, the colored
left border and an "OLD — prior text" label; the fifth channel was costing
legibility for nothing. This is the one component change here, and it is on the path
rather than beside it: the wash is a *term in the equation* every value below was
solved through.

## The arms that move — and the two traps on the way

Thirteen arms across eight palettes. Getting here took two wrong turns, and both
are more instructive than the values.

| palette | arm | from | to |
|---|---|---|---|
| ardesia | `--pass` · `--fail` light | `#1C7A4A` · `#A81E38` | `#006540` · `#8D0027` |
| brina | `--pass` · `--fail` light | `#1C7A4A` · `#A81E38` | `#00654A` · `#8D0027` |
| laguna | `--pass` · `--fail` light | `#197848` · `#A81E38` | `#006647` · `#920029` |
| carta | `--fail` light | `#C0283A` | `#8B001F` |
| magnolia | `--fail` · `--warn` dark | `#D27087` · `#F0A848` | `#E784B9` · `#FFC782` |
| carbone | `--pass` · `--fail` dark | `#5BC772` · `#F87171` | `#73DF88` · `#FF8482` |
| onyx | `--seq-500` dark | `#B8B8B8` | `#D3D3D3` |
| concrete | `--seq-500` both | `#585855` / `#B8B8B5` | `#393937` / `#EDEDE9` |

`--chart-state-pass` / `--chart-state-fail` move with the trio wherever a palette
declares them as the same literal (carta, carbone).

### Trap 1: a contrast solve that eroded a CVD pair

The first cut moved each arm alone, along the OKLab lightness axis, by the
smallest step that cleared its band. Measured afterwards through the repo's own
`lib/theme/cvd.js` against an `origin/main` worktree, that broke something
distant: **48 pairs lost deficiency separation and 21 ended below the 0.15
collapse floor.** The worst was magnolia's, caused by a −14° hue rotation added to
clear the band without closing on `--warn` in normal vision:

```
magnolia|dark|warn^fail|tritanopia   0.1209 -> 0.0473   (-61%)
```

laguna's shipped `--pass` is recorded in `CHANGELOG.md` as *"chosen so it still
holds the ≥0.15 protanopia pass↔fail CVD floor"* — the first solve took it to
0.087. That is the #1181 shape: a re-tune satisfying its own surface and breaking
a distant one through a shared channel (HARD RULE #18).

**Nothing gated it, including the gate this change added for it.** `cvd-audit`
exits 0; `cvd-palette.test.js` covers only the four a11y palettes; and the new
`cvd-trio-floor` gate froze the **set** of pairs above the floor, so a pair
already below it could decay without limit and a pair at 0.1584 could sit at
0.1483. That is precisely the hole this same change keyed the contrast baseline to
close — *"a count says nothing about an existing failure getting worse"* — applied
to one arm and not the other. The gate now freezes distances (§ The gates).

The physical reason the naive solve fails is worth keeping: **lightness is the only
channel a deficiency preserves.** Under tritanopia a light amber and a light pink
are the same colour, so on a dark canvas — where the own-hue band forces `--fail`
lighter — `--warn` has to be lifted with it or the pair closes. A `--fail`-only
search over lightness, hue *and* chroma has **no solution** on magnolia; the joint
search finds one immediately. Solving a trio means solving it jointly, not moving
one token and checking the others afterwards.

### Trap 2: letting surfaces nothing renders drive brand colour

The deeper error, found by re-scoring every arm against its binding surface: two
catalog entries — `redline/ins-on-new-card` and `redline/del-on-old-card`, an
`<ins>`/`<del>` inside a `.stacked`/`.split` card — are **proactive**. The CSS
produces them, but a scan of every deck in the repo finds **no markup that reaches
them**. They were nonetheless forcing real, visible palette hues: `del-on-old-card`
is what demanded magnolia's hue rotation, and `ins-on-new-card` bound most of the
`--pass` arms.

Re-scored against real surfaces only, with each value reverted to `main`, **seven of
the original thirteen arms were needed by nothing that ships** and are reverted
here: ardesia / brina / laguna `--fail`, carta `--pass` and `--fail` dark, concrete
`--pass`, a11y-tritanopia `--pass` (which is back to `main` entirely). A surface
nobody renders does not get to move a palette, and the catalog now carries a
`proactive` flag that keeps such a surface scored and frozen while excluding it
from the regression arm.

The check that stopped this becoming a third error: `kpi/hero-pass-pill` binds most
of what remains, and a first pass mistook it for proactive too — no deck marks a
tile `pass`. It is not. `kpi.styles.css:295` sets `--pill-fg: var(--pass)` on
*every* tile of the default variant, so the plain `kpi` gallery slide renders it on
the `--accent-soft` hero. **A component can set state in CSS rather than markup**,
so "no deck writes it" has to be checked against the stylesheet, not just the
decks.

### The `--seq-500` anchors are not the failing value

onyx and concrete are the only palettes curating a real gray ramp rather than
restating `var(--accent)`, and both anchors were already correct `light-dark()`
pairs. What fails is `--seq-700`, which the base derives 45% of the way toward
**black on either canvas**: on a near-black canvas it lands at 2.60:1 (onyx) and
2.16:1 (concrete). The dark arm therefore has to start lighter than the ramp's own
aesthetic wants, and concrete's light arm darker, because concrete's light canvas
is a mid gray the `--seq-400` tint was washing into. A pair is not enough; the arm
has to be solved against the STOP. Neither anchor touches the status trio, so
neither carries CVD risk.

## The gates

### `tools/composed-contrast.js` (+ `test/unit/palette/composed-surface-contrast.test.js`)

A sibling of `contrast-audit.js`, not an extension of it (HARD RULE #15 — one gate
per invariant): that tool owns the pairs a PALETTE declares, this one owns the
surfaces a COMPONENT composes.

**What it models.** 24 surfaces across `redline`, `word-cloud`, `checklist`, `kpi`
and `policy-recommendation`, each an ink inside a stack of nested element groups
over one opaque base. A group carries its own background paint (which may be
translucent) and its own `opacity`, composited the way the browser does it — buffer
first, then the group alpha, ink and background together.

**What it resolves.** `dist/lattice.css`'s `:root` defaults with the palette chain's
`:root` on top, evaluated by `lib/core/resolve-token-expr` and chained by
`lib/theme/chain.mjs` + the generated manifest edges — the canonical theme graph,
not a fourth `@import` regex (`2026-08-16-manifest-is-the-theme-contract.md` is
explicit that no stylesheet is parsed to discover it). `:root` blocks are matched by
whole compound, so `dist/lattice.css`'s `:root[data-lattice-view="fluid"] body { … }`
— a DESCENDANT rule — is not mistaken for a token block.

**Two arms.**

1. **REGRESSION — budget 0.** A pair that is below its bar and worse than the base
   default it overrides. Both #1640 findings are exactly this shape, and it survives
   the flip as a palette-curation rule: `base.tokens.css` is the reference standard
   an override is meant to improve on.
2. **A FROZEN BASELINE — 166 keys, target zero.** Not a count. A count says "no more
   failures" and says nothing about an existing failure getting worse — a palette
   could take a 1.66:1 word fill to 1.03:1 with the gate green. Keyed with its
   ratio, the gate fails on a below-bar pair that is not listed, a listed pair that
   scores worse than frozen, and a listed pair that now passes or no longer exists.

**Anti-rot.** Every surface names its declaration site and carries `requires`
regexes. The no-group-alpha assumption is pinned **file-scoped**, not per rule: an
adversarial pass got three separate re-additions past a per-block "this rule
contains no `opacity`" pattern — a decoy selector, an ancestor, a sibling rule — so
the check is now "no fractional `opacity` in `redline.styles.css` at all". All four
attack shapes are caught. An unresolvable token is a failure, not a skip.

**Validated by reverting the fix.** With `themes/` and `redline.styles.css` reset to
`origin/main` and the gate left in place, it reports the measured set — the cascade
regressions, the sub-bar pairs, **and** a catalog-evidence error naming the re-added
opacity, i.e. it flags both the values and the fact that its own model no longer
describes the CSS.

### `test/unit/palette/cvd-trio-floor.test.js`

219 frozen keys: every `theme|mode|pair|deficiency` where the status trio is
distinct (OKLab ΔE ≥ 0.15) today. It asserts only *what is distinct stays distinct* —
the brand palettes are not CVD-curated and many pairs have always sat below the
floor; demanding they all clear it is a different change, and the a11y palettes
exist for that. A pair that becomes distinct must be added, so the protected set
only grows.

### `tools/check-slide-contrast.js` reads `opacity`

The blind spot #1681 documented is closed. `resolveStack` walks the ink and the
backdrop through the same group stack, which is the only way the two composite
consistently. Validated against pixels sampled from the rendered deck: **3.20 vs
3.21** and **2.74 vs 2.75** on the two nested-wash runs, and 4.98 / 5.15 / 3.85 /
6.99 against 4.95 / 5.13 / 3.90 / 6.92 on the un-washed ones.

## Proven both ways, on the real render

32 palettes × a 6-slide probe deck (`redline`, `redline dark`, `redline stacked`,
`redline stacked dark`, `word-cloud spectrum`, `word-cloud spectrum dark`), rendered
through `lattice-emulator.js` and measured with `check-slide-contrast.js`'s own
probe (HARD RULE #15) — **2496 text runs per pass** — plus an independent pixel
sampler over the 256 `<ins>` / `<del>` runs.

| | probe: runs below their bar |
|---|---|
| `origin/main` | 388 / 2496 |
| this change, export path today | **184** |
| this change + the #1527 flip | **139** |

**main → this change: 384 runs move, 0 regress, 204 newly clear their bar.** The
struck clause on the default `redline` variant — the one every deck renders — goes
**4.95 → 6.34** in sampled pixels on indaco, and a11y-achromatopsia's `.stacked`
`<del>` goes 3.13 → 5.71.

**Under the #1527 flip: 820 runs move, 53 newly clear, and 8 regress — all of them
the same proactive pairing**, `<ins>` inside a `.stacked` card on a11y-tritanopia
(4.70 → 4.45) and concrete (4.79 → 4.17). That pairing is in the frozen baseline
and needs markup no deck in the repo writes; the probe deck writes it deliberately
in order to reach the surface. **On every surface a shipped deck renders, nothing
regresses in either direction.**

Every blocker #1640 named clears under the flip, on the rendered slide: ardesia
`<ins>` **5.02**, brina **5.04**, laguna **5.04**, carta `<del>` **5.08**, magnolia
`<del>` (dark) **5.09**, the word-cloud spectrum on onyx and the four a11y palettes
**3.19**, on concrete **3.17** in both modes.

**Read the arrow in that sentence carefully.** The pre-fix figures #1640 quotes —
3.88, 3.89, 3.88, 4.24, 3.90, 2.60, 2.16 — are what the *unfixed palette* scores
under the flip. They are gate figures for a state that never shipped, not something
`origin/main` renders: on `main` those runs take the base default's value (ardesia's
`<ins>` renders 4.65 today), which is exactly why the flip is blocked rather than
merely different. The "0 regress / 204 newly clear" figures above are render-to-render
and carry no such counterfactual.

The `#1527` one-liner was applied locally and reverted before committing. The line
moves (722, then 766, then 768), so it was re-grepped rather than addressed by
number.

**The engine surface, driven** (HARD RULE #23). The measurements above are the
export path. The docs site was built and the real Playground opened on `ardesia` —
the palette-wins path, where these token values are live *today* — with a `redline`
+ `redline stacked` deck typed into its actual CodeMirror editor. Both struck
clauses and both insertions read, in the new `--pass` and `--fail`.

**What was NOT verified:** iOS / mobile PDF viewers, the Tauri desktop wrapper, and
the aesthetic judgment on every re-tuned arm across all 32 palettes — the `redline`
and `word-cloud` galleries were looked at; the rest were verified by value.

## Logged, not fixed

Both fail **identically in both cascade orders**, so neither is caused or worsened
by the flip and neither blocks #1527 (HARD RULE #18's on-path / off-path boundary,
keeping #17 intact). Both are inside the frozen baseline, so they are counted and
can neither grow nor degrade.

1. **The base sequential ramp is canvas-blind** — `--seq-600…900` shade toward black
   on either canvas, so on the eleven palettes whose anchor is `var(--accent)`,
   `--seq-700` sits at **1.66:1 (burgundy) to 3.19:1 (ardesia)** on their dark
   canvases. It cannot be fixed per palette: lifting the stop needs a near-white
   anchor, which collapses the three tiers the variant exists to separate.
   **#1697.**
2. **The status trios are sub-AA on their own-hue tints** on 166 composed pairs —
   the largest single block being `--warn` on a 12% amber wash (33 in `kpi`'s pill,
   23 in `policy-recommendation`'s `.amend` badge, 21 in `checklist`'s warn row).
   Amber is the hardest hue on an own-hue wash; this is a status-trio re-curation,
   not a cascade question. **#1698**, which carries the per-surface breakdown and
   one measured lead worth trying first: dropping the band recipe from 12% to 8%
   cuts the population by roughly half without touching a single hue.

Three de-emphasis `opacity` washes on other components are the same shape as the two
removed here and are **not** touched: `agenda`'s dimmed rows (0.45, 2.8–3.4:1),
`kanban`'s done cards (0.52, ~2.8:1) and `compare-prose`'s rejected card (0.72).
Recorded on **#1698** rather than pulled into this diff.

## Verification

- `npm run lint` clean · `npm test` **6411 pass, 0 fail** · `npm run build:check`
  clean. The branch adds 10 tests: 7 composed-surface, 3 CVD floor.
- `node tools/composed-contrast.js` — 0 cascade regressions · 0 unlisted · 0
  degraded · 0 stale · 0 unresolved · 166 of 1536 pairs below their bar
- `node tools/contrast-audit.js` — 0 failures, 736 pairs across 32 themes
- `node --test test/unit/palette/*.test.js` — 612 pass
- CVD: 0 trio pairs newly collapsed, 8 newly distinct, across every palette, both
  modes, three deficiencies
- 32 probe decks × 6 slides × 3 states = 7488 measured text runs, plus 768
  pixel-sampled `<ins>`/`<del>` runs
- The rendered `.stacked` slide was looked at before and after: on `main` the OLD
  card's struck clause is washed out to the point of being hard to read; after, it
  is legible and still unmistakably struck.
- 150 gallery PDFs rebuilt. All of them byte-differ from `origin/main`, because
  #1686 (deterministic PDF timestamps) landed after they were last built — that
  churn is inherited, not caused here. The PIXEL blast radius, rasterized at 50 dpi
  and diffed page by page, is exactly the redline-bearing decks: `redline` light
  (70,049 px) and dark (71,181), `comparison` light (3,126) and `legal` dark
  (67,684). `word-cloud`, `kpi`, `checklist`, `gantt`, `statement`, `title` and
  `logo` are **0 px** — the galleries render on `indaco`, whose `--seq-500` and
  status trio did not move. Rebuilding the same gallery twice now produces
  byte-identical output, so the next change's churn will be honest.

**Where the evidence lives.** The probe decks, the three rendered corpora, the
samplers and the solvers are under `.scratch/pcg/`, which is gitignored and will not
survive `npm run clean:scratch`. What reproduces without them: every gate figure
(`tools/composed-contrast.js`, `tools/cvd-audit.js`, the two unit tests), and the
render sweep — a deck generator, a four-line render loop, and
`check-slide-contrast.js`'s own probe. The pixel sampler is ~40 lines of puppeteer
screenshot plus a histogram; it exists to cross-check the probe, and the probe now
agrees with it to 0.01, so nothing here rests on it alone.
