---
status: shipped
summary: >
  #1697 fixed the sequential ramp's DIRECTION for everyone (canvas-relative poles, in the base)
  and its HEADROOM for fourteen palettes (hand-solved anchors, in the palettes) — and logged the
  gap between those two sentences: a palette that declares NO anchor falls through to
  `base.tokens.css`'s `--seq-500: var(--accent)`, and the dark --accent is near-white on a
  near-black canvas by design, so the stops that climb toward the high pole start from a value
  already there. Nothing gated it: --seq-500 was in neither REQUIRED_TOKENS nor the token-parity
  contract, so the Studio's own generator shipped anchorless themes. Two exits were open. Deriving
  a mid-range anchor in the BASE needs relative colour syntax (`oklch(from var(--accent) …)`),
  which `lib/core/resolve-token-expr.js` cannot evaluate — and an unresolved token is a FAILURE by
  that module's contract, not a skip, so `composed-contrast` would go red on the shipped tree; it
  also changes the base's own default, which changes exported bytes for every theme while the
  export path still resolves the base's anchor (#1527), putting a small slice behind the QUALITY
  BAR's export gate. So the anchor becomes part of the theme CONTRACT instead: `deriveTheme` emits
  it (light arm restating --accent's own light arm, as ten of the fourteen committed palettes do;
  dark arm that hue at OKLab L 0.68 — the mid-range the thirteen curated dark arms were re-solved
  to, with chroma held only where the gamut allows, since oklchToHex gamut-maps by reducing it),
  `serializeTheme` writes it, and token-parity + the scorecard hold every committed palette to it.
  Measured on eight Studio-generated seeds spanning the hue wheel, in real Chromium under the
  engine's own cascade order: the tightest adjacent step on the dark arm goes 0.082-0.096 ->
  0.120-0.141 OKLab and the --seq-700 vs --seq-500 pair 1.36-1.42:1 -> 1.64-1.75:1, while the
  worst stop against the canvas falls 5.04-5.51:1 -> 3.56-4.02:1 and still clears its 3:1 bar on
  all sixteen theme-modes; 1.36 is the MEDIAN of the shipped corpus's 1.08-1.90 range, not its
  loose end. The light canvas is byte-identical (both orders resolve the same accent light arm) —
  verified by SHA per slide, not asserted. NOT closed, and stated rather than hidden: until
  #1527's concat flip EVERY committed palette still resolves this fallback on the export path
  (indaco 1.34:1 there against 1.65:1 on the engine path), so what this buys the PDF is that the
  flip will turn on a solved value rather than an absent one; and after the flip a palette
  hand-authored outside this repo still reaches it. Only the base can close that, and the base
  cannot yet.
---

# The ramp anchor joins the theme contract

**2026-08-17 · branch `claude/seq-base-anchor-headroom` · follows #1697 / #1724**

**Area:** `lib/theme/derive.js`, `lib/theme/serialize.js`,
`test/unit/palette/token-parity.test.js`, `tools/theme-scorecard.js`,
`tools/new-theme.js`, `lib/base/base.tokens.css`

## The defect

`2026-08-17-canvas-relative-sequential-ramp.md` closes with **§ Logged, not
fixed**, and this is its first paragraph:

> **The base's own default anchor still has the defect.** `--seq-500: var(--accent)`
> is the fallback for any palette that declares none — a Studio-generated theme, a
> `tools/new-theme.js` scaffold before its anchor is curated, a consumer palette.

The two halves of #1697's fix live in different files on purpose. The **poles**
(`--seq-pole-low` / `--seq-pole-high`) are in the base, so the ramp's *direction*
follows the canvas for everyone. The **anchors** are in the palettes, so the
ramp's *headroom* is a per-palette value — and headroom is exactly what the
fallback does not have. A dark `--accent` is near-white because it is an accent
on a near-black canvas; with the poles flipped, `--seq-600..900` climb toward
white *from a value already there*.

Nothing prevented that. `--seq-500` was in neither `REQUIRED_TOKENS`
(`lib/theme/derive.js`) nor the token-parity contract, so **the Studio's own
generator was the concrete case**: every theme it produced shipped anchorless and
resolved the fallback.

## The two exits, and why the mechanism is the contract one

**Derive a mid-range anchor in the base.** The natural spelling is relative
colour syntax:

```css
--seq-500: light-dark(oklch(from var(--accent) 0.50 c h),
                      oklch(from var(--accent) 0.68 c h));
```

Three things are wrong with it *today*, and only the first is a build problem:

1. `lib/core/resolve-token-expr.js` understands `var()`, `light-dark()` and
   `color-mix()` and returns anything else verbatim. `oklch(from …)` would come
   back as its own text, and `tools/composed-contrast.js` treats an unresolved
   token as a **failure, not a skip** — deliberately, because a skipped pair
   reads as a pass (#1207). So the shipped tree would go red until the evaluator
   is extended, which is a `lib/core` change serving all three render paths
   (HARD RULE #1) — a slice, not a rider.
2. The HTML player's WebKit floor is unmeasured for that syntax.
3. **It changes the base's own default**, and the export bundle still resolves
   the base's anchor for *every* theme until #1527 flips. So a change scoped to
   anchorless palettes would in fact move exported bytes on all 32 selectable
   themes — the QUALITY BAR's export sign-off gate, for a slice whose whole point
   is that it is small.

**Make the anchor part of the contract.** Smaller, unblocked, and it moves no
shipped rendering at all: the fourteen committed palettes already declare an
anchor, so adding `--seq-500` to the contract is a *gate* over values that are
already there. What changes is what the generator emits, and what a new palette
is told to do.

## What landed

- **`deriveTheme` emits it.** `t['seq-500'] = ld(accent, withLightness(accent, 0.68))`.
  The light arm restates `--accent`'s own light arm — what ten of the fourteen
  committed palettes do (nine by `var(--brand-accent)`, atelier by
  `var(--brand-canvas)`, which is atelier's accent light arm) — and it is a value
  authored to clear AA on a light canvas, so it sits well below the white pole
  with room in both directions. The dark arm is that hue at **OKLab L 0.68**: the
  mid-range #1697 re-solved all thirteen curated dark arms to, where the weaker of
  the two adjacent perceptual steps is largest subject to every painted stop
  clearing 3:1 on its own canvas. It is not a coincidence that this reproduces
  `onyx`'s hand-solved `#989898` exactly from an achromatic seed.

  **Chroma is held only where the gamut allows**, and the shorthand "hue and
  chroma untouched" would have been wrong. `oklchToHex` gamut-maps by reducing
  chroma, so a high-chroma accent arrives with less of it: `#6D28D9`, one of the
  eight seeds measured below, goes C 0.241 -> 0.186 (-23%) with its hue held to
  within 0.1 degree. Clipping chroma to preserve hue is the right map — a brand is
  recognized by its hue — but it is a reduction, and this note is not going to
  describe it as a preservation.
- **`serializeTheme` writes it.** `REQUIRED_TOKENS` groups are emitted by an
  explicitly enumerated list of `rootBlock` calls, so a new group is silently
  dropped unless it is added there too. `theme-serialize.test.js` catches that,
  and did.
- **Two contracts hold it.** `test/unit/palette/token-parity.test.js` (95 → 96
  tokens; this is the one `npm test` runs) and `tools/theme-scorecard.js` (91 →
  92; `scorecard:check` is on-demand). *The two lists have drifted by four
  containment tokens and this change does not fix that* — it is pre-existing,
  off this path, and already tracked as #1459.
- **`tools/new-theme.js` tells the author.** The scaffolder copies `indaco.css`
  verbatim, so a new palette inherits
  `--seq-500: light-dark(var(--brand-accent), #5DA3BF)`: the light arm tracks the
  new brand correctly *by reference*, and the dark arm is indaco's blue. That is
  consistent with the template's design — it is one of well over a hundred literal
  hexes the author is expected to replace, and no counting rule reproduces a clean
  figure for them worth quoting — but it was on none of the eight checklist
  items. It is item 9 now, with the L 0.68 rule and
  `node tools/composed-contrast.js <name>` as the check. A drift assertion in
  `transformPalette` fails loudly if indaco ever stops pairing the anchor that
  way, because the checklist makes a claim about the template's shape.

## Measured

Eight Studio-generated seeds spanning the hue wheel plus an achromatic brand
(`#2A5DB0`, `#3A3A3A`, `#8C6A18`, `#0F766E`, `#B3261E`, `#6D28D9`, `#4D7C0F`,
`#BE185D`), serialized to `themes/`, resolved in real Chromium under **the
engine's own cascade order** — the surface a Studio-generated theme actually
lives on. Before is the same generator with the anchor line removed, i.e. the
base fallback. The four stops are the ones `word-cloud spectrum` paints:
`--seq-900 / -700 / -500 / -400`.

**Dark canvas** (the light arm is unchanged — see below):

| | before (fallback) | after (derived anchor) |
|---|---|---|
| tightest adjacent step, OKLab | 0.082 – 0.096 | **0.120 – 0.141** |
| `--seq-700` vs `--seq-500` | 1.36 – 1.42:1 | **1.64 – 1.75:1** |
| worst stop vs canvas | 5.04 – 5.51:1 | **3.56 – 4.02:1** |
| stops below their 3:1 bar | 0 / 64 | **0 / 64** |
| strictly monotonic encodings | 16 / 16 | **16 / 16** |

Two of those rows are worth reading carefully rather than skimming.

**The canvas column gets *worse*, and that is the trade being made.** An anchor
pulled down out of the near-white band sits closer to the dark canvas, so every
stop loses contrast against it. The floor for these tiers is 3:1 (large text),
and the worst case lands at 3.56:1 — margin, not a squeak. Separation is bought
with contrast that was surplus.

**Monotonicity does not move, and the "before" here sits in the MIDDLE of the
shipped corpus rather than at its worst.** #1697 measured 1.08–1.90:1 across the
committed palettes; sorted, those thirteen are 1.08 · 1.14 · 1.20 · 1.21 · 1.24 ·
1.34 · 1.36 · 1.38 · 1.40 · 1.46 · 1.54 · 1.54 · 1.90, so the median is 1.36 and
the generator's anchorless 1.36–1.42:1 straddles it. The improvement is real and
it is moderate. Claiming the generator was shipping `concrete`'s 1.08:1 would be
false; so would calling 1.36 the loose end of the range.

*A first draft of this paragraph explained the milder before-state by saying the
generator's `withLightness(accent, 0.78)` is "milder than the curated dark accents
that sat at L 0.85+". That was invented. Measured, the committed dark `--accent`
arms run L 0.63–1.00, only three are ≥ 0.85, and six sit BELOW 0.78. The
empirical numbers were right and the story attached to them was not:
`--seq-700`'s headroom depends on where the anchor sits relative to the pole AND
on the canvas underneath it, not on one lightness threshold.*

**The light canvas is byte-identical**, because both cascade orders resolve to
the same brand accent. Verified rather than argued: the `word-cloud spectrum`
light slide renders to the same SHA-256 before and after, and only the dark slide
changes. Rendered through `lib/engine` (the engine path — the emulator CLI is the
export path, where the base still wins until #1527, and would have shown the
fallback in both runs; that is the §7d trap from the concat sign-off, and it is
easy to walk into twice).

## Not closed

**Every committed palette still resolves the base's fallback on the EXPORT path,
and declaring the token does not change that.** Until #1527's concat flip the
export bundle loads the base AFTER the theme, so `--seq-500: var(--accent)` beats
each palette's hand-solved anchor on every PDF, PPTX and exported player rendered
today — indaco's `--seq-700` sits 1.34:1 from `--seq-500` there against 1.65:1 on
the engine path. What this change buys on that path is that the value the flip
turns on is a solved one rather than an absent one. An earlier draft of this
section — and of the comment that shipped into `base.tokens.css` — scoped the
fallback to out-of-repo consumers only, while § "The two exits" three screens up
said the opposite; the wrong half was the one in the shipped bundle. An
independent checker caught it.

**After the flip, a consumer palette written from scratch outside this repo is
what is left.** No gate here can see a file that is not in the repo, and the only
fix that reaches it is the one in the base — which needs the evaluator work above.
`base.tokens.css` now states both cases at the declaration, rather than describing
the fallback as merely something "every theme should set deliberately."

**`themes/burgundy.css` carried the same stale duplicated comment as indaco**, and
it is fixed here rather than logged: the diff's own cleanup is the deletion of that
construction, so a second copy of it is on this path (HARD RULE #18). Those two were
the only occurrences in the corpus.

**The generator has unrelated composed-surface defects, found in passing and not
fixed here.** Scoring the eight generated palettes with `composed-contrast`
reports `kpi/hero-pass-pill` as a cascade regression on the dark canvas of all
eight (6.1–6.8 → 3.4–3.7:1), plus `policy-recommendation`'s stance badges and one
`redline` run. They are `--pass` / `--warn` / `--accent-soft` values, they are
identical with and without this change, and they are the generated-theme face of
#1698 (the status trios on their own-hue tints). Off this path, and logged here
because a null result is only as strong as the scope of the search.

## Not verified

- **The real Theme Studio was not driven.** The claim "a generated theme carries a
  solved anchor" is verified against `deriveTheme`, `serializeTheme` and the
  bundled `docs/src/playground/theme-core.generated.js` — which does carry both the
  `sequential` group and `t["seq-500"]` — plus renders through `lib/engine`. Nobody
  clicked through the React Studio and watched it emit one. Under HARD RULE #23
  that claim rests on the module, not on the surface, and it is stated that way.
- **`engineering/mermaid.md`'s contract count is a fifth hand-maintained copy with
  no gate behind it.** It was corrected here (91 → 96), but `checkSkillFreshness`
  only reads `design/skills/*.md`, so nothing stops it drifting again. #1459 already
  tracks the multiplication of these lists; this is one more instance of it, not a
  new problem, and it is not fixed here.
- **`design/skills/theme.md:209` was missed on the first pass and the gate could not
  see it.** The freshness check matches `/(\d+)-token contract/`, and that line read
  "95-token **per-theme** contract" — the intervening words defeat the marker. Both
  the number and the phrasing are fixed; the marker's fragility is not.
- **No `examples/<slug>.md` demo deck** (HARD RULE #9). Nothing in this change
  renders differently for any committed palette, and the artifact that would show
  the effect is a *generated* theme, which is not a committed file. #1724's
  `examples/seq-ramp-canvas-aware.md` is still the deck for this ramp.
