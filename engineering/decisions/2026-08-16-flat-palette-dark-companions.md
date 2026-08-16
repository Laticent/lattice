---
status: shipped
summary: The prerequisite that unblocks #1527. `base.tokens.css` declares many defaults as `light-dark()` PAIRS while 15 palettes overrode them with FLAT light-tuned values; while the base won the export path's cascade those overrides were inert and dark mode quietly got the base's adaptive arm, so flipping the order (#1527) would have shipped two P1 dark-mode regressions at once. Enumerated in a browser by resolving both sides through the merged variable map — the literal text misses the worst family, because base's value there is the indirection `--seq-500: var(--accent)`. 11 palettes (plus their `-dark` wrappers) anchor `--seq-500` on `var(--accent)`, which is a pair in all eleven; a first cut hand-copied each accent's dark hex instead and was killed in review as ten literals no gate binds, which `tools/new-theme.js` would have scaffolded into every future palette. Carbone is NOT among them, contrary to the ticket, because its `--accent` is mode-invariant. The 4 a11y CVD palettes get dark arms for `--pass`/`--warn`/`--fail`, chosen against the surface redline actually paints them on — a 12% tint OF THE SAME TOKEN, so the background moves with the value, plus `del`'s opacity .85 on top — and holding the deficiency separation at the light trio's own. TWO seams reach past the a11y `:root` scheme pin, not one: `_class: dark` on a section, AND the status-marker pseudo that base.variants.css pins to dark on every title/closing/dark-divider, so the arms also paint the Confidential stamp on a LIGHT slide. Proven both ways on the real render: with the #1527 one-liner applied locally the word-cloud regressions are restored to baseline EXACTLY on all 22 affected palette files (ardesia 1.16 -> 14.50) and redline's struck clause goes 1.25 -> 5.89-9.23:1; without it, 0 of 1612 measured text runs move and a 542-token x 62-palette-mode sweep of the export composition finds 0 differences — with ONE qualification review found: the emulator's mermaid token parse already uses palette-wins order, so the baked parse-error box does move on a11y dark slides (an improvement, ~1.5 -> 8-14:1). The engine path is where the a11y half is live, and a first draft got its pre-state backwards: the palette wins there, so a dark slide got the palette's OWN light hues at 1.25-3.04:1 (a contrast failure, fixed here), not base's collapsed trio (a CVD collapse at dE 0.019-0.092 / 1.01:1, which is the EXPORT path and is NOT fixed here). Also found and logged, NOT fixed: redline's ins/del falling sub-AA in LIGHT mode on 5 brand palettes under the flip, the a11y word-cloud at 2.60:1 on a dark slide via onyx's own dark arm, and `--chart-state-*` which now disagrees with the trio on the engine path where it used to agree.
---

# The flat palette tokens get dark companions

**2026-08-16 · branch `claude/flat-palette-dark-companions-fk0djy` · #1640 item 1**

**Area:** `themes/*.css`, `lib/base/base.tokens.css`

## Why this exists

`2026-08-12-theme-wins-the-cascade.md` — which lives on the unmerged branch
`claude/cascade-theme-wins`, NOT in this tree (`git show
origin/claude/cascade-theme-wins:engineering/decisions/2026-08-12-theme-wins-the-cascade.md`)
— diagnosed a real defect:
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
to say. Concrete and onyx already declare pairs.

**One flat-over-pair case is deliberately left standing, and the first draft of this
table wrongly said there were none.** Carbone overrides `--on-accent` (a base pair,
`light-dark(#FFFFFF, var(--surface-inverse, #000))`) with a flat
`var(--surface-inverse)`, and four `--on-accent-*` tiers derive from it. It is
structurally the same shape, and it is excluded on purpose rather than by oversight:
#1640 item 3 already measured it as an IMPROVEMENT under the flip (white on carbone's
bright lime → its curated near-black, 10.95:1). It survives here because the sweep's
first filter was "does the DARK value move", and carbone's flat override happens to
equal base's dark arm — so it moves only in LIGHT, which is why it is an improvement
rather than a regression. Recorded so #1527 inherits an accurate list.

## What the dark arms are

### `--seq-500` — the palette's own dark accent

Every one of the eleven flat anchors was **exactly the light arm of that palette's
`--accent`** — all eleven, textually. That is not a coincidence: the base's fallback is
`var(--accent)`, so what rendered in dark mode was that palette's dark accent and what
rendered in light mode was a value identical to the flat override.

The first cut wrote that dark accent out as a hand-copied literal,
`light-dark(var(--brand-accent), #82C8E5)`. Adversarial review killed it, and the
objection is worth recording because it generalizes: **ten new hexes whose correctness
depends on a hand-maintained equality that no gate checks.** `tools/new-theme.js`
scaffolds a new palette from `themes/indaco.css` verbatim, so every future palette would
have started life with indaco's blue anchoring its ramp, 40 lines from the `--accent`
the author actually edits, with `word-cloud spectrum` the only surface that reveals the
error. That is the #1181 shape exactly — a distant re-tune breaking a surface through a
duplicated value.

What ships is the form that has no literal to drift:

```css
/* themes/indaco.css */
--seq-500: var(--accent);   /* was: var(--brand-accent) */
```

`--accent` is a `light-dark()` pair in all eleven, so this is adaptive by reference. It
is also the STRONGER "changes nothing" form: the pair pinned the ramp to the brand
tokens and would have stopped following a deck-level `--accent` override, which today's
render does follow. Identical computed value in both schemes and both cascade orders.

The honest reading is that these eleven overrides now restate the base default
(`--seq-500: var(--accent)`) rather than curating anything — which is what they were
always worth. They are kept rather than deleted because `base.tokens.css` asks each
theme to set the anchor deliberately, and because a future change to the base default
should not silently move eleven palettes. `onyx` and `concrete` are the only palettes
where the token earns its keep: their `--accent` is pure black/white, so they curate a
real gray ramp instead.

The ramp's derivation is canvas-blind — `--seq-600`…`900` shade toward black either way
— so a light-tuned anchor puts `--seq-700/500/400`, the three stops `word-cloud spectrum`
paints as word fills, at 1–3:1 on a dark canvas. Aiming higher than "restore the base's
arm" is not available here: to lift `--seq-700` to AA on a near-black canvas the anchor
would need a lightness above 1. That is a property of the base ramp's derivation, not of
any palette, and it is out of this change's scope.

### The a11y status trios — solved against the surface, not against the canvas

The a11y palettes are mode-invariant at the DECK level: `a11y-base.css` pins
`color-scheme: light` at `:root:root`, which beats the dark toggle. **That pin reaches
nothing that sets color-scheme below it, and TWO things do:**

1. a per-slide `_class: dark`, which sets it on the SECTION — the same seam that forced
   `--cat-on-fill` / `--cat-on-mark` to be pinned in #1323;
2. the status-marker pseudo. `base.variants.css:355-358` pins `color-scheme: dark` on
   `section:is(.title, .closing)::before` and `section.divider:not(.light)::before` so
   the Confidential / WIP stamp reads on those dark bookends — which means **the dark
   arm also lands on an otherwise LIGHT slide**, wherever a deck stamps a title.

The second seam was missed on the first pass and found by adversarial review. It is not
a regression (achromatopsia's Confidential stamp goes 1.55 → 14.88:1, deutan 1.95 →
8.61, tritan 1.94 → 12.57) but the enumeration was incomplete and two canonical files
briefly documented "one seam". So the trio needs a dark arm even though the palette has
no dark mode, and nothing else here does (the categorical ramp is fixed grays that read
on either canvas).

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

**This half is a live fix, not only a prerequisite — but not for the reason a first
draft of this note gave.** That draft said the engine path had been rendering the BASE
trio. It cannot: if the palette wins, the PALETTE's value ships. The two paths fail
differently, and conflating them was the biggest error the adversarial review caught.

| | who wins | what a dark slide got before this | what that is |
|---|---|---|---|
| **engine** (Studio, docs Playground) | palette | the palette's own CVD-safe hues, at **1.25–3.04:1** | a CONTRAST failure — fixed here |
| **export** (PDF/PPTX) | base | base's trio `#4ADE80`/`#F97316`/`#F87171` | a CVD COLLAPSE — ΔE 0.072 deutan · 0.092 protan · **0.019** tritan · **1.01:1** for an achromat — NOT fixed here; #1527 fixes it |

Measured on `origin/main` through the engine's own `composeCss` in Chromium,
`<article class="lattice"><section class="dark">`:

```
a11y-achromatopsia dark  --pass rgb(77,77,77)  --warn rgb(110,110,110) --fail rgb(46,46,46)
a11y-deuteranopia  dark  --pass rgb(0,73,130)  --warn rgb(148,100,0)   --fail rgb(128,6,19)
a11y-tritanopia    dark  --pass rgb(0,113,49)  --warn rgb(176,81,57)   --fail rgb(107,22,103)
```

Those are the palettes' own LIGHT hexes on a dark canvas. The CVD-collapse numbers are
real and worth recording, but they describe the surface this PR leaves alone. What this
PR fixes on the engine path is legibility: `--fail` on redline's band goes 1.25 → 9.22
(achromatopsia), 1.59 → 5.91 (deutan/protan), 1.55 → 8.04 (tritan).

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

**Without the one-liner** — the state this PR actually ships — **0 of 1612 runs move**
across 31 probe decks, and an independent 542-token × 62-palette-mode sweep of the
export composition finds 0 token values differing between `origin/main` and this branch.

**One qualification, found by review and not by that sweep: the export path is not
100% inert.** The emulator's *mermaid* token parse is a second composition site and it
already uses palette-wins order (`lattice-emulator.js:940`,
`parsePaletteVars(layoutCSS + '\n' + paletteCSS)`). `errorBkgColor` maps to
`{ var: 'fail' }` (`lib/core/mermaid-theme-map.js:236`), so on the four a11y palettes
the baked mermaid **parse-error box** changes fill in dark mode — `#2e2e2e → #D9D9D9`,
`#800613 → #FC827A`, `#6b1667 → #FFADF7` — while `errorTextColor` is `--bg`. That takes
it from roughly 1.5–1.8:1 (invisible) to 8–14:1. An improvement, on the exact surface
HARD RULE #18 was born from (#1181). It paints only on a MALFORMED diagram, which no
probe deck and no committed golden carries — which is why the render sweep and
`golden-diff` both read clean and still tell the truth about what they measured.

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
2. **`word-cloud spectrum` drops below its 3:1 threshold on onyx, concrete and the four
   a11y palettes** once the palette wins — onyx and a11y 4.30 → **2.60**, concrete 3.12 →
   **2.16**. Both palettes already HAVE a curated `--seq-500` pair
   (`light-dark(#666666, #B8B8B8)` and `light-dark(#585855, #B8B8B5)`), so this is a
   tuning question about how those arms feed the `--seq-700` stop, not a missing arm and
   not this change's class. The a11y palettes inherit it through onyx. Widening the probe
   set to include onyx and concrete as controls is what surfaced the concrete case, which
   was not in the ticket.

A third: `--chart-state-pass/-warn/-fail` stay flat in the a11y palettes, so on a dark
slide they now diverge from the trio above. **The first draft justified this with "they
diverged before this change too", which is true only of the EXPORT path** — there the
trio came from base and the chart states from the palette. On the ENGINE path both were
the palette's own flat value, i.e. they AGREED, and after this change they disagree:
one slide, two renderings of "fail". It is disclosed rather than fixed because the base
declares no `:root` default for `--chart-state-*` (its pair lives in
`lib/components/chart/_chart-family/chart-family.css` as a `var(…, light-dark(…))`
fallback), so it is neither a flat-over-pair case nor visible to the new gate — and
pulling a differently-shaped defect into this diff is what #17 exists to prevent. It is
the next `_class: dark` collapse in these files and wants its own slice, with the same
measurement. Same for the flat `--diagram-critical` in each a11y palette.

## Verification

- `npm run lint` clean · `npm test` 6194 pass, 0 fail (`origin/main` is 6159; +31 parity
  tests, +4 from cvd 4→8) · `npm run build:check` clean
- 31 probe decks × 4 slides = 1612 text runs, rendered and measured three ways (main /
  flip / flip + fix); numbers above are from those runs, not from source inspection.
  The first pass covered 27 decks / 1404 runs, before onyx and concrete were added as
  controls — both counts appear in earlier drafts of this note and 31 / 1612 is current.
- `node --test test/unit/palette/cvd-palette.test.js` — 8 pass (was 4; both arms now)
- `node --test test/unit/palette/paired-token-parity.test.js` — 31 pass; 26 failures when
  `themes/` is reverted to `origin/main`
- Gallery PDFs rebuilt and compared page-by-page at 60 and 150 dpi: pixel-identical
- Every consumer of the status trio measured on a dark section through the real composed
  engine sheet, `main` vs branch — checklist rows and discs, verdict-grid badges and
  their disc rings, obligation-matrix state cells, kpi pills, chart-status pills,
  redline `ins`/`del`, and the derived `-bg` tints. **Every changed value moves toward
  the canvas; none is worse.** `.light`, `.print`, `divider.light` and `.heat` are
  unchanged — each pins `color-scheme: light` explicitly, so no light island inside a
  dark scheme exists to catch out a near-white arm used as a FILL.

**UNVERIFIED (HARD RULE #23).** The engine-path change — 256 token values across 26
palette-modes, all in the dark scheme — has no artifact from the engine surface. Every
render above is the emulator (export path) or a Chromium harness driving `composeCss`
directly; nobody has built the docs site and looked at the Studio or the Playground.
The direction is measured and the token values are right, but "it looks right in the
Studio" is not a claim this note is entitled to make.
