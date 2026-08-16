---
status: shipped
summary: The prerequisite that unblocks #1527. `base.tokens.css` declares many defaults as `light-dark()` PAIRS while 15 palettes overrode them with FLAT light-tuned values; while the base won the export path's cascade those overrides were inert and dark mode quietly got the base's adaptive arm, so flipping the order (#1527) would have shipped two P1 dark-mode regressions at once. Enumerated in a browser by resolving both sides through the merged variable map — the literal text misses the worst family, because base's value there is the indirection `--seq-500: var(--accent)`. 11 palettes (plus their `-dark` wrappers) get a `--seq-500` dark arm; carbone is NOT one of them, contrary to the ticket, because its `--accent` is mode-invariant and its flat anchor already resolves identically in both modes. The 4 a11y CVD palettes get dark arms for `--pass`/`--warn`/`--fail`, chosen against the surface redline actually paints them on — a 12% tint OF THE SAME TOKEN, so the background moves with the value, plus `del`'s opacity .85 on top — and holding the deficiency separation at the light trio's own. Proven both ways on the real render: with the #1527 one-liner applied locally the word-cloud regressions are restored to baseline EXACTLY on all 22 affected palette files (ardesia 1.16 -> 14.50) and redline's struck clause goes 1.25 -> 5.89-9.23:1; without it, 0 of 1404 measured text runs move, so this change is inert in the export path until #1527 lands. In the ENGINE path the palette already wins, so the a11y half is live there immediately: it replaces a fallback trio that is fully collapsed under every deficiency it is meant to survive (ΔE 0.019-0.092, and 1.01:1 for an achromat). Also found and logged, NOT fixed: two further #1527 blockers nobody had enumerated — redline's ins/del falling sub-AA in LIGHT mode on 5 brand palettes, and the a11y word-cloud at 2.60:1 on a dark slide.
---

# The flat palette tokens get dark companions

**2026-08-16 · branch `claude/flat-palette-dark-companions-fk0djy` · #1640 item 1**

**Area:** `themes/*.css`, `lib/base/base.tokens.css`

## Why this exists

`engineering/decisions/2026-08-12-theme-wins-the-cascade.md` diagnosed a real defect:
`lattice-emulator.js` composes `paletteCSS + layoutCSS`, so `base.tokens.css`'s
universal defaults override every value a palette curated — in the path that builds
every committed PDF. The engine's own `composeCss` has always had it the other way
round, so the two render paths disagreed about the cascade (HARD RULE #1).

The one-line fix is blocked, and the reason is the subject of this note. **The base
declares many defaults as `light-dark()` PAIRS while some palettes override them with
FLAT single values.** While the base wins, those flat overrides are inert and dark mode
quietly gets the base's adaptive arm. Making the palette win exposes every one of them
at once — so "restore the palette's intent" also means "ship a light-tuned value onto a
dark canvas", in fifteen palettes, in one commit.

This change gives those tokens dark arms. It changes nothing else, and deliberately
does not flip the cascade (HARD RULE #17 — that is #1527's PR).

## The enumeration, done in a browser

Resolving the literal text is not enough and that is the interesting part: the family
that caused the worst regression is `--seq-500`, whose base value is `var(--accent)`.
Read as text that is a flat `var()`; resolved, it is a pair, because `--accent` is one
in every palette. A text-first sweep would have reported the seq family as clean.

So the sweep composes the real sheet **both ways** in Chromium, sets `color: var(--token)`
on a probe element for every custom property the layout bundle names, and reads the
computed color — in `color-scheme: light` and `color-scheme: dark`. The flat-over-pair
set is: base's dark ≠ base's light, palette's dark = palette's light.

| palette family | tokens | files |
|---|---|---|
| `--seq-500` and the nine stops that derive from it | 10 | 11 light palettes + their 11 `-dark` wrappers |
| `--pass` · `--warn` · `--fail` and their `--status-*` / `-bg` derivatives | 12 | the 4 a11y CVD palettes |
| — none — | 0 | carbone, concrete, onyx, a11y-base |

**It is 11 palettes on `--seq-500`, not the 12 the ticket lists.** Carbone is a
single-canvas palette: its `--accent` is `var(--brand-accent)` with no arms, so its flat
`--seq-500` resolves to the same value in both schemes and there is nothing for a pair
to say. Concrete and onyx already declare pairs. Nothing else in the bundle diverges.

## What the dark arms are

### `--seq-500` — the palette's own dark accent

Every one of the eleven flat anchors is **exactly the light arm of that palette's
`--accent`**. That is not a coincidence: the base's fallback is `var(--accent)`, so
what renders today in dark mode is that palette's dark accent, and what renders in
light mode is a value identical to the flat override. The dark arm is therefore the
palette's own dark accent — the value the base was silently lending back — and the flip
becomes a no-op in dark mode instead of a regression.

```css
/* themes/indaco.css */
--seq-500: light-dark(var(--brand-accent), #82C8E5);   /* was: var(--brand-accent) */
```

The ramp's derivation is canvas-blind — `--seq-600`…`900` shade toward black either way
— so a light-tuned anchor puts `--seq-700/500/400`, the three stops `word-cloud spectrum`
paints as word fills, at 1–3:1 on a dark canvas. Aiming higher than "restore the base's
arm" is not available here: to lift `--seq-700` to AA on a near-black canvas the anchor
would need a lightness above 1. That is a property of the base ramp's derivation, not of
any palette, and it is out of this change's scope.

### The a11y status trios — solved against the surface, not against the canvas

The a11y palettes are mode-invariant at the DECK level: `a11y-base.css` pins
`color-scheme: light` at `:root:root`, which beats the dark toggle. **That pin cannot
reach a per-slide `_class: dark`**, which sets color-scheme on the SECTION — the same
seam that forced `--cat-on-fill` / `--cat-on-mark` to be pinned in #1323. So the trio
needs a dark arm even though the palette has no dark mode, and nothing else here does
(the categorical ramp is fixed grays that read on either canvas).

Choosing the values needs two feedback paths in the model or the answer is optimistic:

- **The background moves with the value.** `redline` paints `del`/`ins` on
  `--fail-bg` / `--pass-bg`, which are a **12% tint of the same token** over `--bg-alt`.
  Lift the ink and the band lifts under it. A first pass solved against a fixed
  background, shipped 4.35:1, and was caught by the render.
- **`del` renders at `opacity: .85`**, compositing the ink back toward that band.
  `tools/check-slide-contrast.js` reads computed `color` and cannot see element
  opacity, so its number for a struck run is optimistic by design — for the base trio
  it reports 5.30:1 where the true composited value is 4.16:1, already sub-AA.

The rule: **each arm is its own curated hue lifted up the OKLab lightness axis, hue
kept, by the smallest amount that clears AA everywhere it lands — including through
that opacity — with the deficiency-simulated separation held at or above the shipped
LIGHT trio's own.** Ranking is not constrained; meaning rides the ✓/!/✗ glyphs and the
separation (2026-06-16-cvd-redundant-encoding.md), not the order.

| palette | pass | warn | fail | flat on the band | fail, struck | separation |
|---|---|---|---|---|---|---|
| a11y-achromatopsia | `#B2B2B2` | `#909090` | `#D9D9D9` | 6.56 · 4.61 · 9.23 | 7.14:1 | 1.50:1 pairwise (light 1.61, gate 1.25) |
| a11y-deuteranopia · a11y-protanopia | `#7CBBFC` | `#FFDBA9` | `#FC827A` | 6.85 · 9.78 · 5.89 | 4.68:1 | ΔE 0.162 deutan (0.161) · 0.191 protan (0.189) |
| a11y-tritanopia | `#5CB772` | `#D7745B` | `#FFADF7` | 5.78 · 4.62 · 8.06 | 6.28:1 | ΔE 0.190 (light 0.188) |

Deuteranopia and protanopia share one trio because they share one light trio, and it is
checked under **both** deficiencies — a value that clears deutan alone drops protan to
0.129, below the 0.15 collapse floor.

**This half is a live accessibility fix, not only a prerequisite.** In the engine path
the palette already wins, so until now a dark slide in an a11y deck rendered the BASE
trio — `#4ADE80` / `#F97316` / `#F87171`, which is exactly what the a11y palettes exist
to avoid. Measured: ΔE 0.072 under deuteranopia, 0.092 protan, **0.019** tritan, and
**1.01:1** pairwise for an achromat, i.e. `--pass` and `--warn` at identical luminance.
Every one of those is a full collapse of the one channel color is supposed to carry.

## Proven both ways, on the real render

Twenty-seven probe decks — every affected palette and its `-dark` wrapper, plus onyx and
concrete as controls — each carrying `word-cloud spectrum` and `redline` on a normal
slide and on a `_class: dark` slide. Rendered through `lattice-emulator.js` and measured
with `tools/check-slide-contrast.js`'s own probe (HARD RULE #15 — it already resolves
effective backgrounds through transparent ancestors and reads the `color(srgb …)`
serialization Chromium emits for `color-mix()`), 1404 text runs per pass.

**With the #1527 one-liner applied locally** (`const css = layoutCSS + '\n' + paletteCSS;`,
reverted before committing):

| surface | main | flip alone | flip + this change |
|---|---|---|---|
| ardesia-dark, word-cloud spectrum, worst word | 14.50:1 | **1.16:1** | 14.50:1 |
| atelier-dark, same | 13.13:1 | **1.11:1** | 13.13:1 |
| every other affected palette, both moods | — | 1.04–3.75 | **restored exactly** |
| a11y-achromatopsia, redline struck clause on a dark slide | 5.30:1 | **1.25:1** | 9.23:1 |
| a11y-deuteranopia / -protanopia, same | 5.30:1 | **1.59:1** | 5.89:1 |
| a11y-tritanopia, same | 5.30:1 | **1.56:1** | 8.06:1 |

Every `--seq-500` cell returns to its `main` value to the second decimal — which is the
claim, since the dark arm IS what the base was lending. The a11y `ins` runs land at
5.78–6.85:1 against 7.84 on `main`: lower, comfortably AA, and CVD-safe where the value
it replaces was not.

**Without the one-liner** — the state this PR actually ships — **0 of 1404 runs move.**
The change is inert in the export path until #1527 lands.

## Goldens: rebuilt, verified identical, deliberately not committed

`npm run build:galleries` was run in full (122 PDFs). Every rebuilt PDF differs in bytes
and **none differs in pixels**: rasterized at 60 and 150 dpi and compared page by page,
plus `pdftotext`, the old and new files are identical. Building the same gallery twice
from the same tree also produces two different files, so the byte churn is render
nondeterminism, not this change. The PDFs were therefore reverted rather than committed:
122 files of churn would misrepresent a change that moves nothing on screen, and
`golden-diff` — the CI gate that actually watches these artifacts, per lefthook.yml's own
correction under #1640 — reads the committed goldens, so leaving them alone reports the
truth. `build:showcase-galleries` and `docs/scripts/rasterize-showcase.mjs` were also run
and produced no change at all.

## The gate

`test/unit/palette/paired-token-parity.test.js` fails any palette that overrides a base
`light-dark()` pair with a flat value. It resolves both sides through the merged map —
base's declaration evaluated through the PALETTE's leaves, which is what catches the
`var(--accent)` indirection a text comparison misses. Validated by reverting `themes/`:
it reports exactly the 26 palette files the browser sweep found, and zero after.

Exempt: a genuinely single-canvas palette (carbone). A `-dark` wrapper is NOT exempt
even though it pins `color-scheme: dark`, because that is precisely the canvas a flat
light-tuned override lands on.

`test/unit/palette/cvd-palette.test.js` now asserts BOTH arms of the a11y trio survive
the deficiency. It previously asserted the opposite — that each token is a fixed hex,
"mode-invariant, no light-dark()" — which was true of the deck-level toggle and false of
a dark section.

## Logged, not fixed — two more #1527 blockers

Both were found by this measurement and neither is a flat-over-pair divergence, so
neither is in this change's scope (HARD RULE #18's on-path/off-path boundary, keeping
#17 intact). **#1527 must not merge until they are resolved.**

1. **`redline`'s `ins`/`del` fall sub-AA in LIGHT mode on five brand palettes** once the
   palette wins: ardesia `ins` 4.65 → 3.88, brina 4.66 → 3.89, laguna 4.55 → 3.89,
   magnolia `del` 4.52 → 3.90, carta `del` 5.91 → 4.23. These are the palettes' own
   curated `--pass`/`--fail` on their own 12% tint band — a genuine quality gap in the
   curated values that "base wins" was masking, not a missing arm. No gate sees it:
   `tools/contrast-audit.js` checks each ink against `--bg`, never against the `-bg`
   mix a component paints it on.
2. **The a11y word-cloud drops to 2.60:1 on a dark slide** (need 3:1 at that size),
   from 4.30 on `main`. Source is onyx's `--seq-500: light-dark(#666666, #B8B8B8)`
   winning over the base fallback — onyx already HAS a dark arm, so this is a tuning
   question about that arm's `--seq-700` stop, not this change's class.

A third, pre-existing and unchanged here: `--chart-state-pass/-warn/-fail` stay flat in
the a11y palettes, so on a dark slide they diverge from the trio above. They diverged
before this change too (against the base's dark arm); after it they at least diverge
within the same hue family. The base declares no `:root` default for them, so they are
not a flat-over-pair case and no gate is being weakened.

## Verification

- `npm run lint` clean · `npm test` 6181 pass, 0 fail · `npm run build:check` clean
- 27 probe decks × 4 slides, rendered and measured three ways (main / flip / flip + fix);
  numbers above are from those runs, not from source inspection
- `node --test test/unit/palette/cvd-palette.test.js` — 8 pass (was 4; both arms now)
- `node --test test/unit/palette/paired-token-parity.test.js` — 31 pass; 26 failures when
  `themes/` is reverted
- Gallery PDFs rebuilt and compared page-by-page at 60 and 150 dpi: pixel-identical
