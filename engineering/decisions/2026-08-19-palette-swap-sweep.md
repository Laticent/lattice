---
status: shipped
summary: >
  The rendered-DOM contrast probe is the only tier that can see a cascade or composition
  defect, and it ran on ONE palette family — `indaco` — because a 32-palette matrix reads as
  unaffordable at 36s per render. The render is not the palette-dependent part: markdown,
  Mermaid, KaTeX and layout produce the same DOM whatever the colors are, so the deck is
  rendered ONCE and re-themed in place. Measured: ~15s render + ~80s for all 32 probes,
  against ~19 minutes to re-render the matrix. What that bought immediately is a selection
  effect nobody had measured — the gated palette scores 5 sub-threshold runs and SIXTEEN of
  the 32 score worse, `mustard` at 95 (90 of them in the 3.5-4.5 band, spread over eight
  component classes, i.e. a palette-wide ink tune rather than any component's bug). Two traps
  are recorded here because the first version fell into one and reported confident numbers
  for 18 fictional palettes: `dist/themes/*.min.css` are OVERRIDE LAYERS joined by `@import`
  (`cuoio-dark` is 1,948 bytes and declares no `--bg`), and an `@import` inside an injected
  `<style>` does not load — so each injection landed on top of whichever palette went before
  it. The fix is to inject the flattened chain `contrast-audit.js` already builds, and the
  durable guard is an ORACLE CHECK: the browser's resolved `--bg`/`--text-body` must equal
  what the static resolver says the palette declares, per palette, every run. Also fixes a
  pre-existing probe bug the sweep surfaced — an SVG-scoped `<style>` element's CSS source
  was walked as visible text and scored, so a Mermaid diagram's own stylesheet appeared as a
  1.17:1 offender.
---

# One render, thirty-two palettes

**Status:** shipped.
**Scope:** `tools/palette-sweep.js` (new), `test/integration/invariants/palette-sweep.test.js`
(new), `tools/check-slide-contrast.js` (probe fix), `tools/contrast-audit.js` (two exports).
**Related:** `2026-08-19-website-accessibility-gate.md` (the same "analytic gates cannot see a
cascade" lesson, on the website), `slide-contrast.test.js` (owns rendered-DOM policy on three
surfaces), HARD RULE #15 (one flattener, not two), HARD RULE #18 (why `mustard` is a recorded
ceiling and not a fix in this change).

---

## 1. The gap, and why it survived

Lattice's contrast gates stratify by layer, and only the rendered tier can catch a defect
where the tokens are right and the cascade is wrong. That tier ran on `gallery.md` at
`indaco`, the same gallery at `indaco-dark`, and prose at `indaco`. Thirty of the thirty-two
shipped palettes had never been measured on any deck, ever.

The reason is a cost assumption: one gallery render is 36 s, so the matrix is ~19 minutes.

The assumption is wrong in a specific and useful way. **The palette is not the expensive part
of a render.** Parsing markdown, rendering Mermaid, running KaTeX and laying out 117 slides
produce the same DOM whatever the colors are; only paint changes. Render once, re-theme in
place, re-probe:

| | measured |
|---|---|
| Full gallery render | ~15–36 s (cache-dependent) |
| Theme injection + full re-probe | 150–270 ms |
| **All 32 palettes** | **~80 s** |

## 2. What it found on the first honest run

The distribution is the finding. Sub-threshold runs on `gallery.md` at 1280×720:

| palette | runs |
|---|---|
| `mustard` | **95** |
| `atelier` | 19 |
| `concrete`, `magnolia` | 14 |
| … 12 palettes | 7–11 |
| **`indaco` (the gated one)** | **5** |
| `onyx`, four `a11y-*` | 3 |

**Sixteen of thirty-two palettes score worse than the one palette anybody measures**, and the
gated palette is very nearly best-case. That is a selection effect, not bad luck: the palette
someone chose to gate is the one that looked clean when they chose it.

`mustard` is the outlier and its shape matters. Its 95 are spread across `glossary`,
`list-tabular`, `list`, `journey`, `stats`, `list-criteria` and `timeline-list` — seven-plus
component classes — and **90 of them sit in the 3.5–4.5 band**. Those clear WCAG's large-text
allowance and fail the flat 4.5 floor this repo deliberately holds instead
(`2026-08-18-contrast-floor-deck-scale.md`). So it is one palette-wide ink tuning question,
not seven component bugs. It is recorded as a ceiling rather than fixed here: a palette
re-tune has its own blast radius and does not belong in the change that first measured it
(HARD RULE #18's pre-existing / off-path arm).

## 3. The trap this fell into, written down because the next person will too

The obvious way to swap a palette is to inject `dist/themes/<name>.min.css`. It runs, it
changes colors, it produces per-palette numbers, and for **18 of the 32 palettes it is
fiction**.

Those files are override layers that reach their base through `@import`:

```
cuoio-dark   1,948 bytes   @import "cuoio"    — declares no --bg at all
a11y-base    9,167 bytes   @import "onyx"     — declares no --bg, --text-body or --accent
```

An `@import` inside a `<style>` injected mid-document does not load. So each injection landed
its override layer on top of **whichever palette was injected before it** — a hybrid that
exists in no build, scored and reported with full confidence.

Nothing about the output looked wrong. It was caught by one tell: `mustard` and `a11y-base`,
unrelated palettes, reported byte-identical offender breakdowns (13 / 6 / 5 / 5 / 4 / 4).

Two corrections followed:

- **Inject the flattened chain.** `contrast-audit.js` already builds it (`paletteChainCss`,
  via `themeChain`), and its order is already what a cascade needs — `themeChain` returns
  `[base, …, self]`, so the override lands last. That function is now exported rather than
  reimplemented: a second flattener that drifted would hand the sweep a different palette
  than every analytic gate scores (HARD RULE #15).
- **An oracle check, per palette, every run.** The browser's resolved `--bg` and
  `--text-body` must equal what the static resolver says that palette declares. Two
  independent paths to the same answer, and the sweep fails on the specific palette rather
  than on an aggregate that can absorb it. Verified by re-introducing the bug: it names
  `a11y-base: painted rgb(245,239,216), expected #FFFFFF` — mustard's canvas, exactly as
  predicted.

An earlier canary compared each palette against the one *before* it and produced six false
alarms, because sibling palettes legitimately share a canvas (the four `a11y-*` variants do
by construction). An adjacent-pair test measures sort order, not repaint.

## 4. Baked paint, and refusing to score it

6,197 `var()` reads in the exported gallery re-resolve on a swap. **755 raw hex values do
not** — Mermaid bakes its label ink and node fills at render time.

The dangerous case is not a run where both channels are baked; it is a run where **one** is.
A Mermaid label keeps a stale ink while the canvas behind it follows the swap, so the ratio
scored is a color from palette A against a ground from palette B — a number describing no
rendered pixel anywhere. Measured, it reported Mermaid labels at 1.09:1 and 1.17:1 on every
dark palette: neither a real defect nor a real pass.

So invariance is tracked **per channel**, and a run is dropped if either its ink or its ground
never moved across the whole sweep. Eleven runs on this deck, pinned in both directions — a
jump means new un-swappable paint shipped, a drop to zero means the detection broke and stale
ink is being scored as live. Those runs belong to the analytic tier, which covers all 32
palettes at their own source (`diagram-ink-contrast`, `diagram-nontext-contrast`,
`checkCatContrast`).

## 5. A pre-existing probe bug this surfaced

`SVG_NON_RENDERING` in `check-slide-contrast.js` listed `desc`, `title`, `metadata` — and not
`style`. Chrome does not report `display:none` for an SVG-scoped `<style>`, so its CSS source
text was walked as a visible run and scored: a Mermaid diagram's own stylesheet appeared as a
1.17:1 offender reading `#lattice-mmd-1{font-family:'Outfit'…`. It never fired on `indaco`,
which is the only palette the sibling gate measures. Fixed in place, on-path.

## 6. What this does not cover

- **One deck, one viewport.** The palette axis is what this file buys; the surface axis is
  still the sibling gate's three.
- **A ceiling, not a bar.** Seeded at measured truth, exceed-only. It proves no palette gets
  worse; it does not claim any palette is clean.
- **The exclusion ledgers are not re-litigated.** The decorative watermark and raster-backdrop
  runs fail on every palette and sit inside every ceiling.
- **Both failure arms are proven, not assumed.** The ratchet was verified by lowering a
  ceiling (`onyx: 3 > 2` fails); the oracle by re-introducing the `@import` bug. A gate that
  has only ever been green is a green light, not a gate.
