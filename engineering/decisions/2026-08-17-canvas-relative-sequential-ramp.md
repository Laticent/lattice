---
status: shipped
summary: The sequential ramp derived 600-900 toward BLACK on every canvas, so on a dark one --seq-700 walked toward the background — 1.66-3.19:1 word fills on eleven palettes, the 24 `word-cloud/seq-*` rows `composed-contrast` froze when it landed. The fix is a pole pair, `--seq-pole-low` / `--seq-pole-high`, defaulting to `light-dark(white,black)` / `light-dark(black,white)`: the ramp's MEANING stays fixed (a higher stop is the louder one) and its lightness follows the canvas. Poles alone are not enough, and neither is a light-dark() anchor — solve the arm against the STOP. Every palette's dark arm restated the near-white dark --accent, which has no headroom above it, so flipping the poles alone would have traded an illegible --seq-700 for one 1.08:1 from --seq-500. All thirteen dark arms are re-anchored at OKLab L 0.68 (14 palettes declare an anchor; carbone's is a single flat value, not a pair), hue and chroma untouched, the mid-range that maximizes the weaker perceptual step subject to every painted stop clearing 3:1; mustard's LIGHT arm moves too (0.544 -> 0.49), the one sub-3:1 stop on a light canvas, caused by a cream canvas and a pure-white pole. TWO THINGS THE RENDER CAUGHT THAT THE NUMBERS DID NOT. First, curated anchors are DEAD on the export path and stay that way: the bundle concatenates the base AFTER the theme, so base's `--seq-500: var(--accent)` beats every palette's anchor there, which is why concrete and onyx have carried hand-solved values no PDF has ever rendered. Moving the base default to `:where(:root)` looked like the fix, rendered correctly in the emulator, and is WRONG — Marpit's root-replacement fires only for a bare `:root`, so a `:where()`-wrapped block is scoped as a section inside a section and every token in it goes undefined on the engine path; base.tokens.css already documents that trap two hundred lines down, and `:root:root` fails the same way. So the poles ship in the base, which wins on BOTH paths, and the anchors ship in the palettes — live on the engine path now, live on the export path when #1527 flips, the same posture `--hljs-*` and `--cat-N-ink` already hold, with the export-path arm measured here rather than assumed. Second, `word-cloud spectrum` spliced `var(--accent)` — a brand hue of arbitrary lightness — onto the top of the ramp, so weight 4 out-shouted weight 5 on 11 of 38 palette-canvas combinations before this change and 20 after: a latent inversion this change tipped into failure, so HARD RULE #18 owns it. The top tier reads `--seq-900` now; tier 1 stays `--text-muted`, the off-ramp quiet floor. Result across all 38 palette-canvas combinations: on the engine path — and on the export path once #1527 lands — sub-3:1 tiers 13 -> 0, worst tier-vs-canvas 1.66 -> 3.17, tightest adjacent step 0.012 -> 0.096 OKLab, monotonic 7/38 -> 38/38. On the export path today the poles alone carry most of it: sub-3:1 tiers 13 -> 3 across 2 of 38 combinations, strict monotonicity 0/38 -> 25/38 (37/38 if ties count, and 12 combinations DO still tie — onyx and the five a11y palettes fall back to a pure black/white base anchor, so weights 5, 4 and 3 paint the same color), and NO palette's worst adjacent step gets worse anywhere in either order. Of the 2 remaining sub-3:1 combinations one is the carbone model artifact and the other is REAL: mustard's light canvas still paints its weight-2 word at 2.86:1 on the PDF path, because the arm that fixes it is a palette value. Both are #1527. One modeled row reads worse — carbone|light base-wins, 2.51 -> 1.13 — and it is an artifact of a combination no render produces, since carbone pins color-scheme:dark so the light arm never resolves; check-slide-contrast on the real carbone render reports 0 runs below AA.
---

# The sequential ramp learns which canvas it is on

**2026-08-17 · branch `claude/seq-ramp-canvas-aware-ei9n55` · #1697**

**Area:** `lib/base/base.tokens.css`, `lib/base/base.modifiers.css`, `themes/*.css`,
`lib/components/chart/word-cloud/word-cloud.transform.js`, `tools/composed-contrast.js`
(and `engineering/gotchas/css.md`)

## The defect

`base.tokens.css` derived nine of the ramp's ten stops from the palette's
`--seq-500` anchor, and it derived them the same way on every canvas:

```css
--seq-400: color-mix(in oklab, var(--seq-500) 78%, white);
--seq-700: color-mix(in oklab, var(--seq-500) 55%, black);
```

Tints toward white, shades toward black. On a light canvas that is a ramp: the
high stops darken away from the page. On a **dark** canvas the high stops darken
*toward the page* — `--seq-700` walks into the background.

`word-cloud spectrum` paints `--seq-700 / -500 / -400` as its weight-4/-3/-2 word
fills, and it was the only engine consumer, so that is where it showed:
**1.66–3.19:1 on eleven palettes' dark canvases**, against a 3:1 bar for large
text. `tools/composed-contrast.js` had measured all 24 of those rows when it
landed the day before and froze them rather than fix them, naming this issue.

## The fix has three parts, and only the first one is the issue's title

### 1. The poles

The ramp now interpolates toward a declared pair rather than toward literal
white and black:

```css
--seq-pole-low:  light-dark(white, black);   /* 50-400 recede toward this */
--seq-pole-high: light-dark(black, white);   /* 600-900 advance toward this */
```

What this preserves is the ramp's **meaning** — a higher stop is always the
louder one — by letting its **lightness** follow the canvas. Those are the two
things that cannot both hold on two canvases with one fixed direction, which is
the whole of the defect.

The poles read `color-scheme`, exactly like every other dual-canvas token, so a
`_class: dark` slide inside a light deck gets the dark ramp for free. Two
surfaces whose canvas does *not* follow `color-scheme` pin them:

- **carbone** — one dark canvas in both schemes. Its own
  `:where(:root){color-scheme:dark}` already makes the default resolve dark, but
  only until something below `:root` flips the scheme, and `section.light` /
  `.color-light` do exactly that on a slide whose canvas stays graphite. (The pin
  is a palette `:root` declaration, so like the anchors it reaches the engine path
  now and the export path at the flip; on the export path today carbone's
  `color-scheme: dark` already resolves the base default the right way.)
- **the `section.print` band** — always light paper, whatever scheme the deck is
  in. Without the pin, printing a dark-mode deck derives `--seq-600..900` toward
  **white on white paper**.

#### Rejected: poles of `var(--bg)` / `var(--text-heading)`

Measured, and it is the tempting one: no `light-dark()`, no pins, correct for
carbone and the print band for free, and it fixes mustard's light arm
structurally (its low stops overshoot *past* a cream canvas on their way to pure
white). It loses on three counts. It changes every light-mode value in the set,
where the literal poles leave the light arm byte-identical. It reaches exactly
3.00:1 at its worst point — no margin at all. And it is wrong on the bookend
slides, which paint `--surface-inverse` while `--bg` keeps reporting the deck
canvas; the literal poles follow the `color-scheme: dark` those sections pin, and
so land right.

### 2. The anchors — solve the arm against the STOP

A pole pair fixes the ramp's **direction**. It does nothing for its **headroom**,
and headroom is a property of the anchor.

Every palette's dark arm restated `--accent`'s dark arm, which is near-white by
design — it is an accent on a near-black canvas. With the poles flipped,
`--seq-700` climbs toward white *from a value already there*, so it arrives
0.025–0.173 away in OKLab — 1.08:1 to 1.90:1, tightest on `concrete` and widest
on `burgundy`, whose arm is in fact the one that moves *up*. That
is the failure mode the poles alone would have shipped, and it is the same shape
`onyx` and `concrete` hit in #1704 — a correctly-paired anchor that still lands
its derived stop in the wrong place.

All thirteen dark arms are re-anchored at **OKLab L 0.68, hue and chroma
untouched** — 14 palettes declare a `--seq-500` (the five `a11y-*` inherit onyx's),
and carbone's is a single flat value rather than a pair. That number is not taste: scanning L over every palette, it is where
the *weaker* of the two adjacent perceptual steps is largest, subject to every
painted stop clearing 3:1 on its own canvas. `mustard`'s **light** arm moves too
(L 0.544 → 0.49, `#8C6A18` → `#7B5A00`): it was the one sub-3:1 stop on any light
canvas in the set, at 2.86:1, because mustard's canvas is cream and the low stops
recede toward pure white — lighter than the canvas they are supposed to fade
into.

### 3. `word-cloud spectrum`'s top tier

The heat ramp read `5→var(--accent), 4→--seq-700, 3→--seq-500, 2→--seq-400,
1→--text-muted`. `--accent` is a brand hue whose lightness is whatever the
palette needed for an accent — it is not a stop on this scale, and splicing it
onto the end of one does not make it one. Two consequences, both pre-existing:
weight 4 out-shouted weight 5 on **11 of 38** palette×canvas combinations, and
wherever a palette anchored `--seq-500` on `--accent` (eleven of them did),
weights 5 and 3 were **the same color**.

Re-anchoring pushed that from 11 to **20** — a latent fragility this change
tipped into failure, which HARD RULE #18 makes ours to fix rather than to file.
The top tier reads `--seq-900` now, so tiers 5–2 are all ramp stops and the
encoding is ordered by construction. Tier 1 stays `--text-muted` deliberately: it
is the quiet floor and has to stay legible at the smallest word size, which a
stop far enough down the ramp to read as "least" cannot promise.

## The curated anchors do not reach the export path, and cannot yet

The export bundle concatenates the base *after* the theme, so
`base.tokens.css`'s `:root{--seq-500: var(--accent)}` — documented in its own
comment as a *fallback* — beats every palette's `:root` anchor on equal
specificity and later source order. Concrete and onyx have shipped hand-solved
anchors that no PDF has ever rendered. The engine path composes the other way (a
theme `@import 'lattice'` first, so the base is inlined *above* the palette), and
there the palette wins; that asymmetry is #1527, and `--hljs-*` and `--cat-N-ink`
sit in it too.

**A wrong turn worth recording**, because it renders correctly and is still
wrong. Moving the three overridable defaults to `:where(:root)` — (0,0,0), so a
palette's `:root` wins in *either* order — passed every gate, and the emulator
rendered the curated anchors for the first time. It is unusable. Marpit's
root-replacement only fires for a **bare** `:root`; wrapped in `:where()` the
block is scoped as `… > section :where(:where(section):not([root]))`, a section
nested inside a section, which never exists — so on the **engine** path every
token in that block goes undefined, and a Studio-generated theme (which declares
no `--seq-500`) loses its ramp entirely. `base.tokens.css` documents exactly this
trap 200 lines further down, where the `--on-dark-*` block was moved back out of
`:where(:root)` for the same reason. `:root:root` in the palette fails
symmetrically: Marpit appends the extra `:root` to the section selector, so it
asks for a `<section>` that is also the document root.

There is no selector that wins in both orders, which is what makes #1527 a concat
change rather than a specificity one. So the split is:

- **the poles** live in the base, which wins on both paths — the contrast fix
  lands everywhere today;
- **the anchors** live in the palettes — live on the engine path (Studio, the
  docs Playground) now, and on the export path when #1527 flips.

That is the posture the repo already takes for `--hljs-*`: curate and gate the
value *before* the flip, because a value nobody has rendered is a value nobody
has checked. What is new here is that the export-path arm is measured rather than
assumed (below).

## Result

Across all 38 palette × canvas combinations, measuring the four ramp tiers
`spectrum` paints.

**Engine path** — Studio, the docs Playground, and the export path after #1527:

| | before | after |
|---|---|---|
| tiers below their 3:1 bar | 13 | **0** |
| worst tier vs. canvas | 1.66:1 | **3.17:1** |
| tightest adjacent step (OKLab) | 0.012 | **0.096** |
| combinations with a monotonic encoding | 7 / 38 | **38 / 38** |

**Export path today** — poles only, base's `var(--accent)` still the anchor:

| | before | after |
|---|---|---|
| tiers below their 3:1 bar | 13 | **3** |
| combinations carrying one | 13 / 38 | **2 / 38** |
| monotonic encodings, **strict** | 0 / 38 | **25 / 38** |
| monotonic encodings, ties allowed | 6 / 38 | **37 / 38** |
| combinations whose worst adjacent step got worse | — | **0** |

Two rows are given for monotonicity because the difference is the point.
*Strict* asks that each tier be louder than the next; *ties allowed* passes a
combination where two tiers are the **same colour**. Twelve export-path
combinations tie — onyx and the five `a11y-*` palettes fall back to a base anchor
of pure black/white, so weights 5, 4 and 3 collapse onto one value. That is the
same "weights 5 and 3 were the same colour" defect this change removes on the
engine path, surviving on the export path for want of the palette's anchor. The
count is 12 before and 12 after: nothing here creates it.

No palette's tightest adjacent step regresses in either order — the collapse
moves from the *bottom* of the ramp (weights 2 and 3 were 1.00–1.39 apart, on the
wrong side of the anchor) to the *top*, and gets no worse doing it.

Of the two combinations still carrying a sub-3:1 tier, one is a **model
artifact** and one is **real**:

- `carbone|light`, 2.51 → 1.13 under the base-wins model. Carbone pins
  `color-scheme: dark` at zero specificity, so its light arm never resolves in a
  render; `tools/check-slide-contrast.js` on the rendered carbone deck reports
  **0 of 19 runs below AA**.
- `mustard|light`, 2.86 → 2.86 — **unchanged, and it ships**. The weight-2 word
  is `--seq-400`, derived on the export path from the *base's* anchor, so
  mustard's curated `#7B5A00` light arm — the one that lifts it to 3.41:1 — is
  the value the concat order discards. Rendered and confirmed through
  `lattice-emulator.js`: `#a58a52` on `#F5EFD8`. It is the single deck-visible
  contrast defect this change does not close, and #1527 closes it.

`node tools/composed-contrast.js` goes from 147 frozen sub-threshold pairs to
123: all 24 `word-cloud/seq-*` rows are deleted, not re-frozen, and the surface
catalog gained `word-cloud/seq-900` (1536 → 1600 pairs scored). No other row
moves, and there are 0 cascade regressions.

## Logged, not fixed

**The base's own default anchor still has the defect.** `--seq-500: var(--accent)`
is the fallback for any palette that declares none — a Studio-generated theme, a
`tools/new-theme.js` scaffold before its anchor is curated, a consumer palette.
That reproduces exactly the collapse this note argues against (contrast is fine,
since the poles live in the base; separation is the 1.08–1.90:1 span above), and
nothing gates it: `--seq-500` is not in `lib/theme/derive.js`'s `REQUIRED_TOKENS`
nor in the scorecard's 91-token contract. Deriving a mid-range anchor in the base
would need relative colour syntax (`oklch(from …)`), which `resolve-token-expr`
cannot evaluate and the player's WebKit floor may not support — so it is a slice
with its own kernel work, not a rider here.

`--seq-500`'s **light** arms still restate `--accent` on ten palettes. That is
harmless for the ramp — every light stop clears its bar and the encoding is
monotonic — but it means the light ramp cannot be re-tuned without moving the
accent. Decoupling the light arms is a palette re-curation touching every deck on
a light canvas, which is a slice of its own, not a rider on this one.
