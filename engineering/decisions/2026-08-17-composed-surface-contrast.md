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

## The arms that move — and the trap in the first solve

Ten palette×token arms, sixteen rows because six of them move one side of a
`light-dark()` pair. Each is a step in OKLab with hue and chroma held where that
was possible, sized so every surface reading the token clears its bar.

| palette | token · arm | from | to | move | what bound it |
|---|---|---|---|---|---|
| ardesia | `--pass` light | `#1C7A4A` | `#006639` | dL −0.066 | `<ins>` on its own 12% band |
| ardesia | `--fail` light | `#A81E38` | `#94002A` | dL −0.056 | the CVD floor (below) |
| brina | `--pass` light | `#1C7A4A` | `#006639` | dL −0.066 | `<ins>` on its own band |
| brina | `--fail` light | `#A81E38` | `#94002A` | dL −0.056 | the CVD floor |
| laguna | `--pass` light | `#197848` | `#006438` | dL −0.065 | `<ins>` on its own band |
| laguna | `--fail` light | `#A81E38` | `#8F0028` | dL −0.066 | the CVD floor |
| carta | `--pass` light | `#3C6B1E` | `#386618` | dL −0.017 | `<ins>` inside a `.stacked` NEW card |
| carta | `--fail` light | `#C0283A` | `#AF102D` | dL −0.048 | `<del>` on that band over a 5% card |
| carta | `--fail` dark | `#FF6B72` | `#FF7486` | dL +0.016, dh −6° | same, and `--warn` under protanopia |
| magnolia | `--fail` dark | `#D27087` | `#ED87B6` | dL +0.084, dh −14° | same |
| concrete | `--pass` dark | `#73C77C` | `#81D68A` | dL +0.046 | `<ins>` inside a `.stacked` NEW card |
| carbone | `--pass` dark | `#5BC772` | `#73DF88` | dL +0.073 | the `kpi` pass pill on the hero tile |
| a11y-tritanopia | `--pass` light | `#007131` | `#006D2F` | dL −0.012 | `<ins>` inside a `.stacked` NEW card |
| onyx | `--seq-500` dark | `#B8B8B8` | `#D3D3D3` | dL +0.084 | the DERIVED `--seq-700` word fill |
| concrete | `--seq-500` light | `#585855` | `#393937` | dL −0.116 | the DERIVED `--seq-400` word fill |
| concrete | `--seq-500` dark | `#B8B8B5` | `#EDEDE9` | dL +0.163 | the DERIVED `--seq-700` word fill |

`--chart-state-pass` / `-fail` move in lockstep where a palette declares them as the
same literal (a11y-tritanopia, carta, carbone).

Two honest caveats on "smallest". The steps are the smallest found on a 0.001–0.004
dL search grid that clears **every** surface reading the token with 0.15 of headroom
over the bar, then satisfies the CVD constraint below. A step 0.005–0.015 smaller
would clear the regression arm alone on several arms; the headroom is deliberate,
because the model and the render agree to about 1.5% and a value parked exactly on
4.50 is not a value that clears.

### The trap: a contrast solve that collapsed a CVD pair

The first version of this change moved `--pass` alone on ardesia, brina and laguna,
along the lightness axis, by the smallest step that cleared the band. Adversarial
review measured what that did to the palettes' own status separation, through the
repo's own `lib/theme/cvd.js`:

| palette | pass↔fail under protanopia |
|---|---|
| ardesia | 0.158 → **0.094** |
| brina | 0.158 → **0.094** |
| laguna | 0.152 → **0.087** |

The 0.15 floor is `tools/cvd-audit.js`'s own collapse threshold, and laguna's value
was not an accident — `CHANGELOG.md` records `#197848` as *"chosen so it still holds
the ≥0.15 protanopia pass↔fail CVD floor — 0.152 — after the AA darkening"*. Nothing
caught it: `cvd-audit` is a report that exits 0, and `cvd-palette.test.js` covers
only the four a11y palettes. **This is the #1181 shape exactly** — a re-tune that
satisfies its own surface and breaks a distant one through a shared channel — and it
would have shipped.

Two things came out of it. The arms are now solved as **trios**: `--fail` moves with
`--pass` on the three brand greens (darkening both preserves the luminance gap
protanopia reads), and where lightness alone could not do it the solve spends
**hue** — magnolia's `--fail` needed +0.084 L *and* −14° toward magenta, staying in
the rose family the theme's own comment names, to clear its band without closing on
`--warn`. And there is now a gate:
`test/unit/palette/cvd-trio-floor.test.js` freezes the **219** status pairs that are
CVD-distinct today and fails if any collapses.

After the re-solve, across all 32 palettes × both modes × three deficiencies:
**0 trio pairs newly collapsed, 8 newly distinct** (ardesia / brina / laguna
`warn↔fail` under protanopia 0.130–0.136 → 0.181–0.189; concrete `pass↔fail`
0.130 → 0.170).

### The `--seq-500` anchors are not the failing value

onyx and concrete are the only two palettes that curate a real gray ramp rather than
restating base's `var(--accent)`, and both of their anchors were correct
`light-dark()` pairs — the class #1681 fixed. What fails is `--seq-700`, which base
derives as 45% of the way from the anchor toward **black, on either canvas**. On a
near-black canvas that stop lands at 2.60:1 (onyx) and 2.16:1 (concrete). So the
dark arm has to start *lighter than the ramp's own aesthetic wants*, and concrete's
light arm has to start *darker*, because concrete's light canvas is a mid gray
(`#B8B8B5`) that the `--seq-400` tint was washing into at 2.17:1. A pair is not
enough; the arm has to be solved against the STOP.

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

| | probe: runs below their bar | pixels: ins/del below AA |
|---|---|---|
| `origin/main` | 388 / 2496 | 130 / 256 |
| this PR, export path today | **184** | **61** |
| this PR + the #1527 flip | **127** | **27** |

**0 runs regress in any comparison.** main → this PR: 384 runs move, **204 newly
clear their bar** (69 of them `<ins>`/`<del>` in the pixel sampler). main → this PR +
the flip: 838 move, **261 newly clear** (103 in pixels). The worst struck run on
`main` is concrete-dark's `.stacked` `<del>` at **2.31:1**; it is 3.32 after, 3.54
with the flip. indaco's `.stacked` clause: **3.21 → 5.85** on the export path today,
5.14 with the flip.

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
