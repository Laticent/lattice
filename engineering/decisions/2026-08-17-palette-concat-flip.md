---
status: shipped
summary: >
  #1527 shipped. `lattice-emulator.js:782` now builds the export bundle as `layoutCSS +
  paletteCSS` instead of `paletteCSS + layoutCSS`, so the base loads FIRST and a palette's own
  `:root` wins on equal specificity — the order every theme declares with its opening `@import
  'lattice'`, the order `lib/engine/css.js` composeCss has always used, and the order the two
  Mermaid var readers in this same file already used. The export was the odd one out of four
  sites. Sweep re-run as the sign-off asked: a nine-slide deck from live gallery slides, 32
  themes x both color-modes x before and after = 1,152 renders compared by SHA-256. 64 of 64
  theme-modes change at least one slide; 196 of 576 changed slide instances; 36 DISTINCT states
  (28 duplicate pairs, computed from the renders rather than from filenames) and all 36 change;
  96 distinct changed renderings. Against the 2026-08-11 sign-off's 202/99 the delta is the
  corpus moving underneath it — 925 disputed declarations across 37 tokens today against its 932
  across 36 — plus a deck whose exact slide instances that note never recorded. THE THING NO
  EARLIER PASS HAD: `check-slide-contrast` over all 9,600 rendered text runs on both sides. ZERO
  new sub-AA runs, two fixed (concrete's kanban "Done" label, 3.25:1). The ramp claims #1724
  predicted all land, measured in Chromium across 19 palettes x 2 canvases: sub-3:1 tiers 3 -> 0,
  strict monotonicity 25/38 -> 38/38, the 12 tie-collapsed encodings -> 0, tightest adjacent step
  0.000 -> 0.096 OKLab, and mustard's light weight-2 word 2.86 -> 3.41:1 — the one deck-visible
  defect #1697 could not close. TWO PREMISES IN THE BRIEF ARE WRONG AND ARE CORRECTED HERE:
  `composed-contrast`'s two arms do NOT collapse (both are built by `mergedVars` from the same
  two files; the tool never read the emulator, so its output is byte-identical before and after
  and KNOWN_SUB_THRESHOLD does not move), and the a11y dark-mode status greys are not a
  regression to repair — #1681 already gave them curated dark arms, which now render at
  5.88-13.12:1 where the base's hue-coded trio used to leak in and mean nothing to an achromat.
  NOT closed, and it is the owner's call: all 355 committed PDFs are now stale, NO gate says so
  (golden-diff compares this PR's committed goldens and this PR commits none; build:galleries
  --check does exit 1 on 122 stale gallery PDFs but lefthook.yml records that it runs in no
  workflow, no hook and no build step), and the cost lands on other people — the pre-commit
  build-staged-pdfs hook regenerates a touched deck's PDF, so the next deck PR carries this
  change's colour delta fused into its own diff. Regenerating here is not free either: a rebuild
  of the UNCHANGED tree already differs on 6 of 6 sampled decks, so the pass would commit
  environmental rasterization drift alongside the real change. Also unmeasured: the eight
  --diagram-* fills (non-text, so the 9,600-run gate cannot see them), and the fact that
  base-wins used to give the export an engine-level AA floor for any consumer's own theme,
  which this removes.
---

# The concat flip

**2026-08-17 · branch `claude/seq-ramp-export-flip-vera8g` · #1527**

**Area:** `lattice-emulator.js`, `tools/composed-contrast.js`,
`tools/check-ownership.js`, `lib/base/base.tokens.css`, three palette tests

Two notes precede this one and neither shipped the change:
`2026-08-10-palette-concat-order.md` measured the mechanism and stopped at the
QUALITY BAR gate; `2026-08-11-palette-concat-signoff.md` produced the sign-off
package and ended with *"Then flip `lattice-emulator.js:691`, with the sweep
re-run as the proof."* This is that step. The line had drifted to **:782** before
this change, and sits at **:814** after it — the comment above it is longer than
the statement.

## The change

```js
- const css = paletteCSS + '\n' + layoutCSS;   // base last  → base wins
+ const css = layoutCSS + '\n' + paletteCSS;   // base first → palette wins
```

One line, one consumer (`${css}` in the document shell). Everything else in this
change is comments that described the old world, and the deliberate decision
about what to do with a tool that modelled both orders.

## What the sweep says

A nine-slide deck built from live `test/integration/baseline-decks/gallery.md`
slides — `divider`, `code`, `roadmap`, `list takeaway`, `gantt`, `kanban`,
`piechart`, `checklist`, `closing accent` — rendered PNG-per-slide across all 32
selectable themes in both `color-mode:`s, before and after. 1,152 renders,
compared by SHA-256. `--no-split` throughout, on both sides, so page N stays
slide N and a pagination difference cannot masquerade as a colour one.

| | |
|---|---|
| theme-modes in the grid | **64** |
| …with at least one changed slide | **64 of 64** |
| changed slide instances | **196 of 576** |
| **DISTINCT** states in that grid | **36** |
| …with at least one changed slide | **36 of 36** |
| **DISTINCT** changed renderings | **96** |

**Distinctness is computed from the renders, not from the filenames**, which is a
small methodological upgrade on the sign-off. Two theme-modes are the same state
when their entire before-fingerprint matches; 28 such pairs exist, and they are
not all `-dark` wrappers. Thirteen `-dark` files × 2 modes account for 26 of
them; the other two are `a11y-deuteranopia` and `a11y-protanopia`, which render
**byte-identically on this deck** in both modes. (That is a fact about this deck,
not about those palettes — they declare the same status trio and this deck paints
nothing that separates them.) So the honest corpus is 36 states, and the earlier
note's "16 of the 32 theme files are `-dark` wrappers" is off: there are 13.

By slide, which tracks the token families exactly:

| slide | theme-modes changed |
|---|---|
| `code` (the twelve `--hljs-*`) | 64 |
| `checklist` (`--pass`/`--warn`/`--fail`) | 64 |
| `gantt` (`--diagram-*`) | 28 |
| `kanban` (`--diagram-*`) | 28 |
| `divider` | 4 |
| `closing accent` | 4 |
| `list takeaway` | 2 |
| `piechart` | 2 |
| `roadmap` | 0 |

Worst is `cuoio` in dark mode at 8 of 9; mildest is `onyx` at 2 of 9. **No theme
is unaffected in either mode.**

### The delta against the sign-off's baseline, explained rather than waved at

The 2026-08-11 package reported 202 changed instances and 99 distinct changed
renderings; this run reports 196 and 96. Two causes, and both are checkable:

1. **The corpus moved.** Re-running that note's own disputed-token harness today
   gives **925 dead declarations across 37 distinct tokens**, against its 932
   across 36. Six days of palette work (#1681's dark companions, #1704, #1719,
   #1724) changed which declarations are in dispute.
2. **The deck is not the same deck.** Neither prior note committed the nine-slide
   source or recorded which `divider` / `closing` / `takeaway` instance it took
   from a gallery that contains several of each. This run's selection is recorded
   above and the extraction is mechanical, but it cannot be identical by
   construction.

The conclusion is unchanged and does not depend on either: **36 of 36 distinct
states change, and there is no theme this is invisible on.**

## The measurement no earlier pass had

The sign-off's §6 listed four things it had not verified. This closes the largest
one for every surface that paints TEXT.

`tools/check-slide-contrast.js` reads the real rendered DOM. Run over the HTML
sidecar of every deck in the sweep, both sides — **9,600 text runs per side**:

| | before | after |
|---|---|---|
| runs below AA | 267 | **265** |
| **new** sub-AA runs introduced by the flip | — | **0** |
| sub-AA runs fixed | — | **2** |

The two fixed are `concrete` and `concrete-dark`, light mode, the kanban "Done"
column label: `rgb(45,106,63)` on `rgb(184,184,181)`, 3.25:1, now painted from
concrete's own value and clearing the floor. **Not one run regressed anywhere in
the corpus.** That is a per-run diff, not a net count — a net could hide a
one-for-one swap, and this does not.

### What that measurement structurally cannot see

It is a **crossing count, not a magnitude**, and the difference matters here: the
2026-08-11 sign-off measured that of 684 changed `--hljs-*` / status pairs, **411
got worse**. "Zero newly below AA" is fully compatible with hundreds of runs
dropping while staying above the floor, and one of them is worth naming because it
is the largest single move a human will notice. `cuoio` declares
`--on-dark-secondary: color-mix(in srgb, white 65%, transparent)` against the
base's 76%; on its bookend canvas the body text goes **10.36:1 → 7.89:1**, sampled
from the render. That is cuoio's own curated value taking over, it is far above
the 4.5 floor, and no crossing count would ever have mentioned it.

The rest of the blind spots, from the tool's own header and its source:

- **Everything that is not text.** Rails, chips, borders, gantt bars, kanban
  fills, chart series, gradients, table rules. The eight `--diagram-*` tokens
  change `gantt` and `kanban` on 28 theme-modes and nothing here measures those
  fills — they were looked at on contact sheets, which is not the same claim.
- **Distinguishability.** Two categories collapsing onto one color is invisible to
  a background-contrast check; every tier can clear AA while the encoding dies.
  Ties are measured for the four `word-cloud` ramp stops and nowhere else.
- **Semantics.** A `--pass` that paints amber and a `--warn` that paints green
  swap at identical ratios and score identically.
- **Raster and gradient backdrops**, where the tool measures the wrong surface by
  construction and says so.
- **Runs whose ink goes fully transparent** are skipped, not failed.
- **The exempt tier**, keyed on the resolved composited value of `--text-muted` /
  `--border`: a newly-failing run that lands on one of those is bucketed exempt.

### And the gate that IS blocking covers one palette

`test/integration/invariants/slide-contrast.test.js` renders the **whole**
`gallery.md` and `gallery-jargon.md` through the flipped export path and holds
exact per-surface exemption counts — far wider component coverage than nine
slides, and it is green. But its corpus is `indaco` and `indaco-dark` only, and
indaco carries **17 of the 37** disputed tokens, the second-lightest in the set.
`cuoio`, the heaviest at 34, is covered by the nine-slide sweep alone.

## The ramp claims #1724 made, measured

`2026-08-17-canvas-relative-sequential-ramp.md` shipped the poles in the base and
the anchors in the palettes, and predicted exactly what the flip would turn on.
Measured in real Chromium over the 19 distinct palettes × 2 canvases (38
combinations), on the four stops `word-cloud spectrum` paints:

| | export before | export after |
|---|---|---|
| tiers below their 3:1 bar | 3 | **0** |
| combinations carrying one | 2 / 38 | **0 / 38** |
| strictly monotonic encodings | 25 / 38 | **38 / 38** |
| combinations with a TIE (two tiers one colour) | 12 | **0** |
| tightest adjacent step (OKLab) | 0.000 | **0.096** |
| worst tier vs canvas | 1.13:1 | **3.17:1** |

Every one of those "before" figures reproduces #1697's published export-path
table exactly, which is what gives the "after" column its weight — the harness
was validated against a measurement written by someone else before it was used
to make a claim.

The 12 ties were `onyx` and the five `a11y-*` palettes in both modes, where the
base's `var(--accent)` anchor is pure black or white and weights 5, 4 and 3
therefore painted **one colour**. They resolve to distinct tiers now.

And the single deck-visible defect #1697 could not close:

> `mustard|light`, 2.86 → 2.86 — **unchanged, and it ships**. … It is the single
> deck-visible contrast defect this change does not close, and #1527 closes it.

Measured on the render: mustard's light weight-2 word goes **`#a58a53` at 2.86:1
→ `#977d48` at 3.41:1** on the `#f5efd8` canvas. Closed.

## Two premises this change was handed, and both are wrong

Recorded because each would have produced a confident wrong edit.

### `composed-contrast`'s two arms do not collapse

The brief said the tool's cascade arms "COLLAPSE after the flip — both orders
produce the same values", and that `KNOWN_SUB_THRESHOLD` would move.

Neither happens, and the reason is one function. `mergedVars` builds **both**
arms out of `dist/lattice.css` and the palette chain — `{...base, ...palette}`
and `{...palette, ...base}` — and the file has never read `lattice-emulator.js`
at all. The flip cannot move a number in it. Verified: `node
tools/composed-contrast.js` prints `0 cascade regressions · 0 unlisted · 0
degraded · 0 stale · 0 unresolved · 123 of 1600 pairs below their bar` on both
sides of the change, and no baseline row was touched.

What *did* change is what the base-wins arm **means**. Before the flip it
described a shipping path; now it describes no render anywhere. So the live
question is whether it still earns its keep, and the answer is **yes, keep it**:
`base.tokens.css` is the reference standard an override is meant to improve on,
so "the palette's curated value is worse than the default it replaces" is a
palette-curation defect whether or not anything paints the default. That is
precisely the #1640 shape this gate was built for. Deleting the arm would delete
the only check that a re-tune moved a composed surface the wrong way. The header
now says so, and reframes the arm as a REFERENCE rather than a second cascade the
repo ships.

### The a11y dark-mode status greys are not a repair this change owes

The sign-off's §4 found `a11y-achromatopsia`'s dark checklist losing its rails and
icons under the flip, then corrected itself: the a11y palettes declare
`modes: ["light"]`, so that is a mode they say they do not have.

**The mode is reachable, and the correction's premise was wrong.** Rendering the
sweep proves it: `a11y-*` at `color-mode: dark` produces different bytes from the
same palette at `color-mode: light`, on every one of the five. The `:root:root`
pin beats the global toggle but not a per-deck mode, which lands on the section —
`a11y-base.css`'s own comment says the pin cannot reach there. So an author who
writes `color-mode: dark` with an a11y theme gets a dark canvas, and nothing warns.

**But the repair was already made, by #1681, and the flip is what makes it
visible.** `themes/a11y-*.css` carry `--pass: light-dark(#4d4d4d, #B2B2B2)` and
its siblings, with a comment saying in as many words that those arms *"are inert
until #1527 flips the order"*. They are not inert now. Scored on the real composed
surfaces, the a11y family's checklist rows land at **5.88–13.12:1** on the dark
canvas, against a 3:1 bar.

Looking at the render settles the remaining question, and it takes the opposite
reading to the sign-off's first one — but the argument has to be made on
luminance, not on hue, because luminance is exactly the channel an achromat keeps.
The base's dark status arms:

| token | dark arm | relative luminance |
|---|---|---|
| `--pass` | `#4ADE80` | 0.553 |
| `--warn` | `#F97316` | 0.325 |
| `--fail` | `#F87171` | 0.330 |

**`--warn` and `--fail` are 1.01:1 apart — amber and red were literally one grey**,
and `--pass` vs `--warn` is 1.61:1, below any distinguishability bar. So before the
flip an achromatopsia deck's dark checklist painted green and amber rails that
carried, at best, one bit. After it, the palette's curated arms
(`#B2B2B2` / `#909090` / `#D9D9D9`) give warn 0.279 < pass 0.445 < fail 0.694 —
ordered, no collapsed pair, adjacent separations 1.50:1 / 1.50:1 / 2.26:1 — plus
four distinct glyph shapes (✓ − ○ ⊘), which is what that palette leans on. Note the
best-separated pair gets slightly *worse* (1.61 → 1.50): the after wins because it
is complete and ordered, not because any pair widened. The colour did not
disappear; the *pretence* of colour did.

**The reachable-unsupported-mode gap is filed rather than fixed**, as #18 requires
for a pre-existing defect found off-path: **#1736**.

## What is not verified, and one thing that is now worse

- **All 355 committed PDFs are stale, no gate will say so, and the cost compounds
  onto other people.** This is the sharpest open question in the change and it is
  the owner's, so it is set out in full.

  *Nothing catches it.* `checkCommittedPdfs` audits ownership, not freshness. The
  CI visual regression gate is retired (`.github/workflows/ci.yml`, Skia
  rasterization flake). `golden-diff` diffs **this PR's committed goldens** against
  the base branch, and this PR commits none — so the PR that changes 36 of 36
  distinct theme-modes will post *"nothing changed"*. `build:galleries --check`
  does detect it and exits 1 (**122 gallery PDFs stale**, naming
  `dist/lattice-emulator.js`), but `lefthook.yml` says in as many words that it
  *"is invoked by no workflow, no hook and no build step"* — it is on-demand only,
  disabled deliberately because a full rebuild is ~30 minutes.

  *How the cost lands.* The pre-commit hook `tools/build-staged-pdfs.js`
  regenerates the PDF for any deck markdown in a commit. So the next person to
  touch any deck gets their intended change **fused** with this flip's colour
  delta for that deck, and `golden-diff` attributes all of it to them. That
  repeats, deck by deck, until all 355 are drained. The failure mode is not "the
  colours are wrong"; it is "nobody can tell what a deck PR changed any more".

  *Why they are not regenerated here.* Rebuilding six sampled decks from the
  **unchanged** tree at `44af457` already produces different bytes in **6 of 6**
  cases (`gallery-jargon`, `a11y`, `build`, `claim`, `chart-legends`,
  `accent-finishes`; `seq-ramp-canvas-aware` reproduces byte-identically, and it
  was regenerated in this container image on #1724). A regeneration pass here
  commits environmental font-rasterization drift alongside the real change and the
  diff cannot separate them.

  *The two honest options, both the owner's to pick.* Regenerate all 355 in one
  dedicated commit that says in its message that it includes environmental
  rasterization drift — the precedent is `2026-08-11-palette-concat-signoff.md`
  §7e, which made exactly that call for `kit/Sample-Deck.pdf` and named it an
  accepted cost; absorbing the drift once deliberately beats absorbing it 355
  times unattributed. Or hold the flip until a freshness gate exists so the
  staleness is loud. **#1623** tracks that gate.
- **A fifth site already agreed with the flip, and it is a check on the reasoning.**
  `kit/Sample-Deck.pdf` is produced by real `marp-cli` against `dist/marp-kit`
  (`tools/build-marp-kit.js`), and marp-cli resolves `@import 'lattice'` natively —
  so the kit has always rendered palette-wins. It is unaffected by this change,
  which is the point: the order this line now uses is the one an off-the-shelf CSS
  engine already produced from the same files.
- **The export path used to carry an engine-level floor, and this removes it.**
  Under base-wins the base's `--hljs-comment` / `--hljs-literal` were solved against
  its own panel *and all 15 distinct `--code-bg` values in the corpus*
  (`2026-08-11` §7d), so no theme could produce a sub-AA exported code panel
  whatever its author wrote. Post-flip the only thing between an arbitrary palette
  and a sub-AA PDF is `checkHljsContrast`, which scans `themes/` — this repo's own
  palettes. Studio-generated themes are covered (`lib/theme/derive.js` was raised to
  4.5). A consumer's hand-authored theme is not, and now nothing catches it. That
  door is closed for later, not by this change.
- **PPTX and the exported HTML player are covered structurally, not swept.** The
  sign-off called them UNVERIFIED. They are not a separate path: `lattice-emulator.js`
  navigates the browser to the same `outHtml` that embeds `${css}`, and the PNG
  buffers that navigation produces are what `writePptx` packs and what the `.png`
  output writes. The 576 PNGs in the "after" sweep *are* the PPTX's slide images.
  The `.html` deliverable is that same shell. No sweep drove a `.pptx` or a player
  end-to-end, so this is a code-path argument, not an artifact — stated as such.
- **Nine slides, not the whole gallery.** Unchanged from the sign-off. A component
  reading a dead token that this deck does not paint would not appear here. The
  token-level measurement (925 declarations, 37 tokens) is exhaustive; the render
  sweep is not exhaustive over components.
- **Non-text surfaces are covered by `composed-contrast`'s catalog, not by a
  render.** `check-slide-contrast` sees text runs. Rails, chips, bars and diagram
  fills are scored by the composed-surface catalog, which is green — but that
  catalog is a curated list of surfaces, not everything the engine paints.
- **The status trio's real reference surface** stays unmeasured per component; the
  sign-off's §4 showed `--bg` is the wrong pair for at least the a11y icon use.
  Unchanged by this note.
