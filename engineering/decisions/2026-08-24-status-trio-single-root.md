---
status: shipped
summary: >
  #1527's cascade flip landed while #1789's dual-`:root` workaround was still in the tree, and
  the two solve the same problem. Measured on the post-flip tree, on all four render paths at
  once: with the trio declared at plain `:root` ALONE, a real CLI export, a real `--player`
  export in both scheme states, a real marp-cli render and a real docs-site slide all resolve
  cuoio's curated `light-dark(#001305, #96f576)`; with it at `:root:root` alone, marp-cli paints
  base's `#2D6A3F`. So the doubled form is now dead weight on every path, and the duplicate is
  removed from all 18 self-curating palettes. `checkStatusTrioParity` — which existed only to
  keep two hand-written copies in sync — is retired and replaced by `checkPackedRootReach`, a
  gate on the general defect rather than the specific workaround: a custom property declared
  above plain `:root` is either dead weight or inert, and the inert case was a LIVE 1.00:1 panel
  edge on four palettes (#1797), fixed here by the same one-line move.
  THE REMOVAL UNMASKED A GATE THAT HAD GONE VACUOUS. `composed-contrast`'s regression arm ranks
  root blocks by specificity, so the `:root:root` copy made its base-wins map resolve to the
  palette's own value: the arm could not see a trio regression at all, and #1809 added five
  `chart/status-pill-*` surfaces into that blind spot. With the duplicate gone it reported 18
  real regressions — the pill's LIGHT arm, the same defect #1809 fixed on the dark one (#1807).
  Fixed by taking the light stops 33/54% to 18/30%, measured against the gate's own evalSurface
  and then on rendered pixels: concrete's on-track pill goes 3.43 -> 5.65:1. The 0% stop turned
  out to be sub-AA too (4.38:1) and modelled by nothing; both stops are catalogued now.
builds-on: 2026-08-23-status-trio-export-cascade.md, 2026-08-24-palette-cascade-flip.md, 2026-08-18-split-frame-edge-ownership.md
---

# One `:root` reaches every path now

**2026-08-24 · #1797 · #1807 · branch `claude/palette-contrast-sweep-osvq2v`**

**Area:** `themes/*.css` (18), `lib/components/chart/_chart-family/chart-family.css`,
`tools/check-ownership.js`, `tools/composed-contrast.js`,
`test/unit/cli/check-ownership.test.js`,
`test/integration/export/palette-cascade-order.test.js`, `design/skills/theme.md`

---

## 1. Two changes solved the same problem, three days apart

`2026-08-23-status-trio-export-cascade.md` (#1789) made every palette's curated status
trio reach a rendered export by declaring it at **both** `:root` and `:root:root` — because
neither selector form reached all three render paths. `2026-08-24-palette-cascade-flip.md`
(#1527) then flipped the export concat so the engine sheet loads FIRST, which makes plain
`:root` win the export on source order.

Both landed. Neither knew the other was going to. The question this note answers is what
the second one leaves the first one doing, and the answer is: nothing.

**It is answered by measurement, not by reading the two records.** The whole reason this
swimlane keeps paying for cycles is that every machine gate here can be green while the
values never reach the page.

## 2. §2's three-way table, retaken on the post-flip tree

`2026-08-23-status-trio-export-cascade.md` §2 carries a table of three paths × three
selector forms. Here it is again, on the tree that ships today, with a fourth path added
because the `--player` export collapses `light-dark()` into two blocks and had its own
answer once (§2b of that note).

One palette (`cuoio`), one token family, three variants of the palette file, every reading
taken from a real artifact in real Chromium. Curated value `light-dark(#001305, #96f576)`;
the engine default is `#2D6A3F` / `#4ADE80`.

| path | `:root` only | `:root:root` only | both (as shipped by #1789) |
|---|---|---|---|
| engine, packed (docs site, real slide) | **palette ✓** | base ✗ *(§2 of #1789)* | palette ✓ |
| CLI export, unpacked (`lattice-emulator.js`) | **palette ✓** | palette ✓ | palette ✓ |
| export-to-Marp (real marp-cli 4.5.0) | **palette ✓** | **base ✗** | palette ✓ |
| `--player`, both scheme states | **palette ✓** | palette ✓ | palette ✓ |

**The `:root` column is now clean, and that is the whole finding.** Before the flip the CLI
row read `base ✗` — that single cell is what the doubled form existed to fill.

The rows that moved and the rows that did not:

- **CLI export.** This is the cell the flip changed. All three variants now resolve the
  palette's trio off the rendered `<section>`; before the flip, `:root` only resolved base's.
- **export-to-Marp.** Measured rather than carried over, because it is the row that can
  refute the removal: if `:root:root` were the half that landed here, dropping it would ship
  a 32-palette regression. It is the opposite. A `_class: redline` deck exported with
  `tools/export-marp.js` and rendered by real marp-cli reads cuoio's curated trio with the
  plain `:root` half alone, and **base's `#2D6A3F` / `#B45309` / `#991B1B` with the doubled
  half alone.** `:root:root` is not merely redundant here; it is the form that loses.
- **`--player`.** Both scheme states, read in Chromium off the real exported file by toggling
  `data-lp-scheme` — not by regex over the minified CSS, because the collectors' bug in #1789
  §2b was precisely a disagreement between the text and the cascade. All three variants,
  both arms, resolve the palette's values.

### 2a. The empty root, which is the part that proves anything

Reading a token off a `<section>` does not tell you HOW it got there. The proof is the
document root:

```
docs site, /components/comparison/redline/, palette cuoio, inside the preview frame
  <section class="redline form">   --pass  light-dark(#001305, #96f576)
                                   --fail  light-dark(#8a010c, #ed6868)
  document.documentElement         --pass  ""      (empty)
                                   --fail  ""      (empty)
  painted <ins>                    rgb(0, 19, 5)     = #001305
  painted <del>                    rgb(138, 1, 12)   = #8a010c
```

The root holds NOTHING, so nothing arrived by inheritance: the only thing that can have put
those values on the `<section>` is the packed rule `article.lattice > :where(section):not([\20 root])`,
the rewrite of the `:root` half. Identical readings before and after the removal — which is
the claim being made, that dropping the duplicate is behaviour-neutral on the packed paths.

The same shape holds under marp-cli (empty root, values on the section, `div#\:\$p > svg >
foreignObject >` rather than `article.lattice >`). It does NOT hold on the CLI export, and
that is correct rather than a discrepancy: nothing is packed there, `:root` matches `<html>`
for real, and the section inherits.

**One trap worth recording, because it cost a reading.** The docs site's own page chrome
declares a palette at the document root, so reading the first `<section>` on the page finds
site furniture with a fully-populated root — the exact opposite of the signal being looked
for. The slide lives in a same-origin `srcdoc` preview frame; the reading has to go inside it.

## 3. What replaces the parity gate, and why it is a bigger gate rather than a smaller one

`checkStatusTrioParity` failed the build if a palette's two trio blocks drifted. With one
block there is nothing to keep in sync, so it is retired.

Retiring it outright would have left a real hole: a palette declaring the trio ONLY at
`:root:root` ships inert on every packed path, which is the mirror defect #1789 caught before
release. `checkPackedRootReach` covers that and generalizes it — **a custom property declared
above plain `:root` is a defect whichever way it goes:**

- declared at BOTH → dead weight, two hand-kept copies of the same value;
- declared ONLY there → inert on every packed path, silently falling back to the engine default.

The second is not hypothetical. Four palettes declared `--panel-edge-mark` at `:root:root`
alone, which is why `2026-08-23-status-trio-export-cascade.md` §7c had to correct its own
"13 phantom pairs" claim, and why #1797 was filed. Read off a real onyx slide on the docs
site, before this change:

```
--panel-edge-mark  light-dark(#000000, #FFFFFF)   ← base's var(--accent)
--accent           light-dark(#000000, #FFFFFF)
--surface-inverse  #000000                        ← the panel fill itself
```

A black top edge on a black panel: **1.00:1**. The fix is the same one-line move the trio
gets — `:root:root` → `:root` — and the same slide now reads onyx's own `--spectrum-end`
`#C71F2D`, **3.66:1** against the panel. Four palettes, one line each, and #1797 is closed by
the change that made the shape illegal rather than by a separate repair.

**Envelope, stated rather than implied.** The gate matches `(:root){2,}` only. It does not
judge `:root.print` / `:root[data-x]` (conditional overrides, a different contract) or
`:where(:root)` (the zero-specificity default), and it is scoped to `--*` properties so that
`a11y-base`'s `:root:root { color-scheme: light }` stays legal — that one is a deliberate
specificity war with an author's INJECTED `:root{color-scheme:dark}`, a live competitor
rather than a cascade-order workaround, and it is the only legitimate use of the shape left
in the tree. Mutation-checked in both directions: reintroducing either defect shape reddens
the gate with the right message, and the fixed tree is green.

## 4. The removal makes the order test stronger, which is the argument for it

The case for keeping the duplicate as belt-and-braces is that if the concat order ever flips
back, the trio stays alive. It does not survive contact with the numbers.

The flip activates **28 tokens** across all 32 palettes (`2026-08-24-palette-cascade-flip.md`
§3). The trio is three of them. Twelve `--hljs-*`, eight `--diagram-*`, `--seq-500`,
`--on-accent`, `--code-text` and the `--on-dark-*` tail carry no second declaration and would
go inert with it. A duplicate on three tokens is not insurance against that; it is a patch on
one hole in a hull with twenty-eight.

What actually guards the order is `test/integration/export/palette-cascade-order.test.js`,
which renders the real CLI and reads tokens off the rendered `<section>` in Chromium. And
that test is **better off** for the removal, by its own account: its vacuity guard notes that
`--pass` / `--warn` / `--fail` were spelled differently in the two files and resolved
identically, so three of its four probed tokens could have been order-BLIND while the guard
read satisfied. They are live discriminators again.

So the choice was not "safety versus tidiness". It was a dead mechanism that also blunted the
live one.

## 5. Removing it unmasked a gate that had gone vacuous — and it had a real finding

This is the part that was not predicted, and it is the fifth gate in this swimlane found
reporting a number about something that is not on the page.

`composed-contrast.js`'s REGRESSION arm asks whether a palette's own curated value is WORSE
than the base default it overrides. Both arms are built from merged token maps, and #1789's §6
taught the merge to rank root blocks `:where(:root)` < `:root` < `:root:root`. That ranking is
correct — and it means the `:root:root` copy won the **base-wins** map too. Both arms resolved
the palette's own trio, so **the regression arm could not see a status-trio regression at all**,
and had not been able to since #1789.

#1809 then added five `chart/status-pill-*` surfaces, whose ink is `--text-heading` on a mix of
the trio. They landed inside the blind spot. With the duplicate removed the arm reported **18
regressions** on first run, all `|light|chart/status-pill-{pass,fail}`.

They are the light-arm twin of the defect #1809 fixed on the dark arm, which is #1807:

| | dark arm (#1809, shipped) | light arm (#1807, here) |
|---|---|---|
| ink | `--text-heading`, LIGHT on dark | `--text-heading`, DARK on light |
| failure | more hue → lighter ground → too close to a light label | more hue → darker ground → too close to a dark label |
| stops | 48/64% → **42/54%** | 33/54% → **18/30%** |

Swept against composed-contrast's own `evalSurface` over 32 palettes × 5 states rather than a
model of it: the light end clears at 31% (4.59:1) and misses at 32% (4.46:1); **30%** is taken
for the margin (4.72:1, worst still `concrete|pass`).

**The 0% stop was sub-AA too, and nothing modelled it.** The catalog listed only the 100% stop,
on the argument that the 0% stop is "quieter by construction". That is true of the dark arm —
less hue mixed into black is a darker ground under a light label — and false of the light arm,
where less hue means a lighter ground under a dark label, so "quieter" is safer on one arm and
says nothing about the other. Measured on the shipped tree the light 0% stop read **4.38:1** on
`concrete|pass`, below the same bar, with every gate green. It moves 33% → 18%, reads 6.38:1,
and leaves the light arm 12pp deep — the same depth the dark arm has carried since #1809, so the
two arms now describe one gradient instead of two differently-calibrated ones. **Both stops are
catalogued**, so neither can drift unseen again.

That is the fourth time in this swimlane a raw `color-mix()` ground has been invisible to the
analytic tier because nobody wrote the catalog entry.

### 5a. And the rendered pixels, because the gate is not the page

The analytic numbers were confirmed on real renders — `progress` at six palettes, light mode,
sampled from the PNG rather than read off computed style:

| palette · worst pill | before | after |
|---|---|---|
| `concrete` · on-track | **3.43:1** | **5.65:1** |
| `laguna` · on-track | 5.30 | 8.02 |
| `cuoio` · on-track | 5.42 | 9.72 |
| `brina` · blocked | 5.21 | 8.80 |
| `mustard` · blocked | 5.26 | 8.65 |
| `atelier` · blocked | 5.31 | 8.78 |

The rendered figures are HIGHER than the analytic ones (concrete 3.43 → 5.65 rendered against
2.48 → 4.72 modelled) and the difference is not a disagreement: the sampler reports the pill's
DOMINANT ground, which on a gradient is nearer its middle, while the gate models the worst
stop. The gate is the conservative one, which is the right way round.

**The cost, stated plainly because it wants a human's eye:** the light-mode pills are paler.
Their state identity now rests more on the vivid `--pill-ink` border than on the fill. Nothing
is illegible and every state stays distinguishable, but this is a visible change to every
status pill in light mode across all 32 palettes, and it is the kind of trade a contrast number
cannot adjudicate on its own.

**One process note, recorded because it wasted a cycle and the swimlane's own brief warns about
it.** The first "after" render was byte-identical to the "before" one. `dist/` is untracked, the
emulator reads `dist/lattice.css`, and the component CSS had been edited without a rebuild — so
the analytic gate (which reads source) saw the change and the render did not. The pixels are what
caught it; comparing the two computed gradients showed them identical when they had to differ.

## 6. Numbers

| | before | after |
|---|---|---|
| palettes declaring the trio twice | 18 | **0** |
| lines of duplicated declaration + docblock removed | — | **~500** |
| `:root:root` custom-property declarations in `themes/` | 22 | **0** |
| — remaining `:root:root` uses | — | **1**, `a11y-base`'s `color-scheme` pin |
| `composed-contrast` — cascade regressions | 0 *(vacuous for the trio)* | **0** *(and load-bearing again)* |
| `composed-contrast` — pairs below bar | 85 of 2304 | **66 of 2624** |
| — frozen entries DELETED, not re-frozen | — | **19** (`chart/status-pill-*`) |
| — newly-modelled surfaces added | — | **5** (the gradient's 0% stop), all passing |
| order test's live discriminators | 4 of 7 probed | **7 of 7 eligible** |

## 7. What this does NOT fix

- **`state-chart` has the same gradient defect, on BOTH arms, and no catalog entry at all.**
  `state-chart.styles.css:257-258` still carries `33%/54%` light and `48%/64%` dark — the dark
  pair is the value #1809 replaced one file over, so it never received that fix, and the light
  pair is what this change replaced. Nothing in `SURFACES` models a state-chart pill, so no gate
  can see either. **Pre-existing and off the path** of both #1797 and #1807 (a different
  component, needing its own surfaces and its own visual pass), so it is logged rather than
  pulled in, per HARD RULE #18. It is the natural next slice after this one.
- **The joint trio re-solve** is untouched. 66 pairs remain below bar and cannot be cleared one
  token at a time; `2026-08-23-status-trio-export-cascade.md` §8 still carries it, and the
  removal of the duplicate makes it materially cheaper — every value now has ONE edit site per
  palette instead of two that a gate had to keep in agreement.
- **`--panel-edge-mark`'s other three palettes were not re-measured individually.** onyx is the
  worst case by construction (its `--accent` IS `--surface-inverse`) and is the one measured on
  a real slide; ardesia, atelier and concrete take the identical one-line move and are covered
  by the `split-panel/edge-mark` surface at floor 1.5:1. **UNVERIFIED** on a rendered slide for
  those three.
- **One viewport, and light mode for the pill sweep.** The pill's dark arm was not re-rendered
  here — it is unchanged by this diff — and every reading is at 1280x720.
