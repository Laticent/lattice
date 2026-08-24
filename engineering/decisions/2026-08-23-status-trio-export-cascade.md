---
status: shipped
summary: >
  #1698's first pass re-curated seven palettes' status trios and every gate went green, on a
  tree where the values it wrote never reached a rendered PDF. The trios were declared at plain
  `:root`, and `lattice-emulator.js` concatenates `dist/lattice.css` AFTER the palette, so at
  equal specificity the engine default won on source order: an exported deck painted base's
  `#2D6A3F` / `#B45309` / `#991B1B` on all thirty-two palettes, verified by reading `--pass` off
  the exported document and by sampling the painted pixels. The fix is to declare the trio at
  BOTH `:root` and `:root:root`, because neither form alone reaches every path — `:root` packs
  onto the slide section and wins the engine and export-to-Marp paths, `:root:root` survives that
  rewrite inert and wins the unpacked CLI export on specificity. Promoting it to the doubled form
  ALONE was tried first and shipped the mirror defect; an independent checker caught it.
  THIS NOTE'S VALUE WORK DID NOT SHIP. #1801 landed while the branch was parked at the merge gate
  and re-solved all 32 trios for the achromatopsia floor; that solve and this one move the same
  tokens along the same axis for opposite reasons and cannot be added, so #1801's values are kept
  verbatim and this branch's are dropped. What ships is the cascade fix, ten non-trio token edits
  on surfaces a rendered sweep found, a second swept deck, and four gates that were lying in the
  same direction: composed-contrast's export arm ignored `:root:root`, the rendered probe scored a
  wrapped inline's UNION rect as painted area, the `--player` export had no specificity model at
  all, and the diagram-scope gate rejected `(:root)+` outright.
builds-on: 2026-08-18-status-trio-own-hue-tints.md, 2026-08-19-palette-swap-sweep.md, 2026-08-10-palette-concat-order.md
---

# The status trios, and the cascade that was eating them

**2026-08-23 · #1698 (second pass)**

**Area:** `themes/*.css` (18), `tools/composed-contrast.js`,
`tools/check-slide-contrast.js`, `tools/check-ownership.js`,
`tools/build-docs-portal.js`, `test/integration/invariants/palette-sweep.test.js`,
`test/unit/palette/cvd-trio-floor.test.js`

---

## 1. What the first pass could not see

`2026-08-18-status-trio-own-hue-tints.md` solved seven palettes' trios against the
own-hue band each is painted on, and closed with every gate green. The method was
right. The tree it was measured on was not the tree that ships.

Three readings, taken on a real export of `test/integration/baseline-decks/gallery.md`:

| | |
|---|---|
| `getComputedStyle(:root)['--pass']`, palette `indaco` | `light-dark(#2D6A3F, #4ADE80)` |
| `themes/indaco.css:130` declares | `light-dark(#276305, #6FCC4D)` |
| `<ins>` ink painted, on indaco / concrete / atelier / mustard alike | `rgb(45,106,63)` = `#2D6A3F` |

`lattice-emulator.js:806` composes `paletteCSS + '\n' + layoutCSS`. Both files declare
the trio at plain `:root`, the bundle is last, and at equal specificity source order
decides. **Every palette's curated trio was inert in a CLI export.** So were 35 other
tokens — the mechanism, its blast radius and its sign-off package are #1527's
(`2026-08-10-palette-concat-order.md`, `2026-08-11-palette-concat-signoff.md`), and the
flip is deliberately parked on a human gate. None of that is new here.

What is new is what it did to *this* slice's two gates:

- `tools/composed-contrast.js` scores `mergedVars(theme)` — palette-wins, which is
  `lib/engine/css.js`'s order and therefore the Studio and the docs Playground. Real,
  and not the export.
- `test/integration/invariants/palette-sweep.test.js` renders through the emulator, so
  it scores base-wins.

They were measuring different documents. Their agreement about the size of the debt —
108 analytic pairs against 113 rendered runs — was arithmetic coincidence, and it read
as corroboration. A re-tune of `themes/*.css` would have closed the first number and
moved the second by nothing at all.

## 2. The fix needs BOTH selector forms, and finding that out cost a round

`:root:root` is (0,2,0) and beats the bundle's (0,1,0) whatever the source order.
`themes/ardesia.css:328` (and atelier, concrete, onyx) already reach for it, with the
reason written out in the file:

> `:root:root`, NOT `:root`, and that is load-bearing. The export path concatenates
> base.tokens.css AFTER the palette, so at equal specificity the engine default wins on
> source order and a plain `:root` override is silently discarded in the rendered PDF
> while every static check still passes.

So the first cut of this change promoted the trio to `:root:root` alone, in all eighteen
palettes. **Every gate went green and it was wrong**, in the mirror image of the defect it
was fixing. An independent checker caught it before it shipped.

`lib/engine/css.js` packs a theme the way Marpit does, rewriting `:root` onto the slide
`<section>`. The rewrite only touches a `:root` preceded by a combinator or start-of-string,
so the SECOND `:root` survives literally:

```
$ node -e "const {packTheme}=require('./lib/engine/css.js');
           console.log(packTheme(':root:root { --pass: red; }'))"
article.lattice > :where(section):not([\20 root]):root{ --pass: red; }
```

That trailing `:root` requires the `<section>` to be the document root. It never matches.
So the doubled form is **inert on the engine path** — Studio, docs Playground, Specimen —
and on export-to-Marp, whose rewrite is marp-core's own — measured under real marp-cli in
§2c, not assumed. Promoting the trio there alone moved the defect rather than fixing it:
the four `a11y-*` palettes rendered base's trio in the Playground, the one surface their
CVD-safe values exist to be seen on.

`engineering/gotchas/marp.md` documents this class for `:root[…]`. A `:root` residue is
strictly worse than an attribute residue — an attribute can at least match a section.

**Neither form reaches all three paths, so the trio is declared at both.** Measured, not
reasoned — `--pass` read off a real render on each path:

| | `:root` only | `:root:root` only | both |
|---|---|---|---|
| engine (packed) | palette ✓ | **base ✗** | palette ✓ |
| CLI export (unpacked) | **base ✗** | palette ✓ | palette ✓ |
| `--player` dual-mode block | base | **split ✗** | palette ✓ |

`:root` wins the packed paths on source order (`composeCss` inlines the base at the theme's
own `@import 'lattice'`, above); `:root:root` wins the unpacked CLI path on specificity and
is harmlessly dead on the others. `checkStatusTrioParity` in `tools/check-ownership.js`
fails the build if the two blocks drift, because a palette shipping two different greens
depending on which surface a reader is looking at is exactly what this pair prevents.

**This is still not the #1527 flip and still does not prejudge it.** The flip changes the
order for the whole palette region — 36 tokens, 99 distinct changed renderings, a repair
list that must land first. This is three tokens, declared twice, and it makes the flip
*safer*: after this change the trio clears 4.5:1 on every canvas in **both** orders, so
whichever way #1527 lands the status surfaces are legible. The other 33 collided tokens are
untouched.

### 2a. The packed path, read off a real slide rather than a harness

The table above says the engine path works. That claim was first made by composing the
stylesheet in a harness, which is a proxy (HARD RULE #23). It is now read off the real
docs site — `npm run dev`, the component reference at `/components/comparison/redline/`,
default palette `cuoio` — on the exact tree this change ships:

```
<section class="redline form">   --pass  light-dark(#001305, #96f576)   ← cuoio's curated value
                                 --fail  light-dark(#8a010c, #ed6868)
document.documentElement         --pass  ""      (empty)
                                 --fail  ""      (empty)
painted <ins>                    rgb(0, 19, 5)     = #001305, cuoio's --pass
painted <del>                    rgb(138, 1, 12)   = #8a010c, cuoio's --fail
```

Base's values are `#2D6A3F` = `rgb(45,106,63)` and `#991B1B`; neither appears. (These
readings were retaken after the #1801 rebase — the first pass of this section quoted
`#215F35` / `#8F0A11`, this branch's own since-dropped values, which is exactly the kind
of stale evidence §7c is about.)

**The empty root is the part worth keeping.** It is not incidental — it is the proof. If
the trio were reaching the section by ordinary inheritance from the document root, the root
would hold the value and the section would merely inherit it. The root holds *nothing*, so
the only thing that can have put those values on the `<section>` is the packed rule
`article.lattice > :where(section):not([\20 root])` — the rewrite of the `:root` half. That
distinguishes "the palette loaded" from "the palette's `:root` block actually landed on the
slide", which is the whole question this section exists to answer, and a token-map or
`getComputedStyle(:root)` reading cannot tell the two apart.

### 2b. The `--player` export had a third answer, and it was the wrong one

`lib/export/player-core.mjs` collapses `light-dark()` into a light base plus a flat
`:root[data-lp-scheme=dark]` block. Both of its collectors — `rootScopedDecls` and the
dual-mode scan — took the LAST declaration of a token as the cascade winner. That is true
only at equal specificity, and it stopped being true the moment a palette declared the trio
at two specificities. Measured on a real `--player` export at atelier, before the fix: the
light base honored specificity and kept `#1f5d33`, while the dark block ended with base's
`#2D6A3F` / `#4ADE80`. (That reading is from this branch's PRE-REBASE tree, where atelier's
`--pass` was this branch's own `#1f5d33`; on `main` after #1801 it is `#054b22`. The defect
and the fix are unaffected — the collectors' bug was "last declaration wins" regardless of
which values were in the file — but the hex is a historical one and is left labelled rather
than silently restated against values it was never measured on. What pins the fix on the
CURRENT tree is `test/unit/export/html-player.test.js`, 118 passing.) One exported file,
two different greens depending on the viewer's
scheme toggle — and invisible to every ratio gate, because both values clear their bar.

Both collectors now rank by root specificity (`rootSpec`), with source order as the
tie-break, so the old behavior is preserved wherever specificity is equal. This was a
PRE-EXISTING structural weakness — `themeDualMode` has never had a specificity model — that
this change tipped from latent into visible, which HARD RULE #18 puts on this change to fix.

### 2c. Export-to-Marp, measured under real marp-cli

The table in §2 covers three paths, and until now the export-to-Marp row was the one
claim in this note resting on INFERENCE: `packSelector` is a documented mirror of
marp-core's rewrite, so marp-core was assumed to do the same thing. An earlier pass
also recorded marp-cli as uninstallable in this sandbox. Both were wrong to leave
standing — `npx @marp-team/marp-cli` fetches fine, and the assumption is now a
measurement.

A `_class: redline` deck on `cuoio`, rendered by **marp-cli v4.5.0 / marp-core v4.4.0**.
Read off the emitted HTML, this is what marp-core did to each half:

| declared | marp-core rewrote it to | matches a `<section>`? |
|---|---|---|
| `:root` | `div#\:\$p > svg > foreignObject > :where(section):not([\20 root])` | **yes** — this is the half that lands |
| `:root:root` | `div#\:\$p > svg > foreignObject > :where(section):not([\20 root]):root` | **no** — the trailing `:root` survives literally |

and the computed values on the slide agree: the `<section>` resolves cuoio's curated
`light-dark(#001305, #96f576)` / `light-dark(#8a5903, #f7a64f)` /
`light-dark(#8a010c, #ed6868)` — #1801's values, verbatim — while `document.documentElement`
returns EMPTY for all three, the same shape as §2a, so the values arrived by the packed
rewrite and not by inheritance. Retaken after the rebase, on the tree that ships.

**The part that justifies having measured it rather than reasoned it:** marp-core's
wrapper is NOT ours. It packs onto `div#\:\$p > svg > foreignObject >`; `lib/engine/css.js`
packs onto `article.lattice >`. The *behavior* of the two `:root` halves is identical, which
is what the mirror claim predicted — but the selector the behavior rides on is a different
string, and "identical rewrite" was never true as written. A prediction that happens to
come out right is still not a measurement, and this is the third claim in this note that
had to be corrected after someone actually ran it (§7c is the other two).

## 3. Then #1801 landed, and the values became someone else's

This branch was open, green and parked at the merge gate when
`2026-08-24-status-trio-monochromacy-respacing.md` (#1801) merged. It re-solved the
status trio on all 32 palettes — 192 committed pairs — for a constraint this branch was
not carrying: under a monochromacy only lightness survives, so the trio needs three
distinct WEIGHTS against the canvas, and 162 of the 192 pairs sat under the 0.11 floor
`a11y-achromatopsia` exists to reach.

**The two value-solves cannot be added together.** Both move the same three tokens along
the same axis, for different reasons:

| | this branch's solve | #1801's solve |
|---|---|---|
| moves the ink | toward legibility on its OWN 12% tint | to three distinct weights vs the canvas |
| because | `--pass-bg` is a tint OF `--pass`, so the ground moves with the ink | a monochromacy leaves only lightness |
| measured by | `composed-contrast.js` over the SURFACES table | `cvd-trio-floor.test.js` over 768 frozen pairs |

Those pull the same token opposite ways often enough that neither result survives the
other's gate. #1801's floor is the harder constraint, it is already shipped, and it
protects the palette family whose entire reason for existing is that constraint. So it
wins outright: **this change keeps #1801's values verbatim and drops its own.**

What is left is the half that was never about values — the cascade that decides whether
ANY curated value reaches the page. That half is worth more after #1801 than before it,
because #1801 shipped 192 freshly-solved pairs into a tree where the CLI export still
painted base's trio over every one of them.

### 3a. What this change does still move, and why it does not collide

Ten token edits survive the rebase, on four tokens that #1801 does not touch. Each was
found by a rendered sweep, not by reading a token table, and each is confirmed unchanged
between the merge-base and `origin/main`:

- **`--code-inline-fg`** dark arm on brina / burgundy / crepuscolo / cuoio / laguna /
  mustard — the inline `<code>` chip inside a `kanban` card title, on its own 10%
  `currentColor` wash over a card fill that has itself been lifted 12% toward white.
- **`--scheme-dark-text-body`** on concrete — the done-column card title on that same fill.
- **`--text-secondary`** on brina and laguna — the `policy-recommendation` `defer` badge,
  ink on its own 12% tint.

**Cuoio's `--text-secondary` was attempted and REVERTED**, and the reason is worth keeping:
#1801's second commit added `checkMutedTierFloors`, which fails a palette whose
`--text-secondary` sits within OKLab 0.030 of `--text-body`. Cuoio's badge wants the ink
DARKER; the tier floor wants it FURTHER from a body ink that is already dark. The two are
opposed, so the badge cannot be fixed from `--text-secondary` at all on that palette — it
needs the badge's own tint tuned, which is a component change. The four `defer-badge`
entries that DID clear (brina, laguna, x2 for the -dark variants) are deleted from
`KNOWN_SUB_THRESHOLD` rather than re-frozen; cuoio's two remain.

## 4. What is left, and why

`KNOWN_SUB_THRESHOLD` stands at **66**, down from #1801's 70 and from 108 before that.
The 66 are #1801's to carry, not this change's, and the biggest single group is the one
this note has to be honest about.

**`concrete-dark`'s three `redline` runs are the visible cost of making the fix work, and
they are still an improvement.** Measured both ways on the export path:

| painted on an exported `concrete-dark` deck | `redline/del` | `del-on-old-card` | `old-label` |
|---|---|---|---|
| BEFORE — base's `--fail` `#F87171` (the cascade bug) | 3.58:1 | 3.37:1 | 3.94:1 |
| AFTER — concrete's own #1801 `--fail` `#ee8787` | **3.91:1** | **3.61:1** | **4.35:1** |

Every one improves. The surface was failing before this change and fails by less after it,
which is the opposite of a regression — and the analytic gate already froze all three on
`main`. It is recorded as `gallery/concrete-dark: 3` in the sweep's ceiling table with that
comparison written beside it, rather than quietly zeroed.

**A one-token fix was attempted and does not exist.** Lifting concrete's dark `--fail` by
the minimum that clears 4.5:1 on all three (dL +0.09, `#ee8787` -> `#ffacab`) collapses
`warn^fail` under achromatopsia from 0.1203 to **0.0250**, straight through #1801's 0.11
floor, and takes `pass^fail` under deuteranopia from 0.2087 to 0.1198 through the 0.15 one.
The three arms have to be solved JOINTLY against both constraint sets — a re-run of #1801's
solve with the composed surfaces added to its objective. That is a separate change, and
§8 carries it.

## 5. Carbone's light arm still describes a canvas carbone does not have

Recorded here because it was found by this work and remains true on `main`, NOT because
this change fixes it — it no longer does.

Carbone pins ONE canvas in both color-schemes (`--bg: #1A1A1C` either way), but its trio
is a `light-dark()` pair. So a `_class: light` or `.print` slide flips the ink to arms
tuned for an off-white surface it does not have: `--bg` on `--fail` measures **2.28:1**,
and `diagram-ink-contrast.test.js` still sanctions `errorTextColor` on `main` partly for
this combo. The fix is the one that sanction's own comment names — "a palette-side `--fail`
curation, not a map edit" — and concretely it is to pin the trio mode-invariant the way
carbone already writes `--cat-N-ink`. That is a trio-value change, so it now belongs to the
joint solve in §8 rather than here.


## 6. Three gates were lying, all in the same direction

Every one of these reported a number about something that is not on the page. They are
fixed here rather than worked around, because each one stood between this change and a
measurement that could be trusted.

**`composed-contrast.js`'s export arm ignored specificity.** `mergedVars(baseWins)` was
`{ ...palette, ...bundle }` — flat, source order only. So the four palettes that had
*already* escaped the concat order for `--panel-edge-mark` were scored on the bundle's
`var(--accent)`: 13 phantom sub-threshold pairs on an arm that renders correctly, and,
had it not been fixed, a re-curated trio scored as inert on the one path where it is the
whole point. Root-family blocks are now ranked `:where(:root)` < `:root` < `:root:root`.

**`check-slide-contrast.js` scored a rect nothing paints.** Its underlay scan tested
containment against `getBoundingClientRect()`. On a **line-wrapped inline** that is the
*union* of the line fragments, and an inline paints only the fragments. On `gallery.md`'s
redline slide, `<ins>Provider's standard export format</ins>` wraps line 1 → line 2, so
its union spans the whole column and swallowed `<ins>ninety (90)</ins>` sitting mid-line-2
— which was then scored on a **doubled** `--pass-bg` band, `rgb(184,194,174)`. The
rasterized slide reads `rgb(204,208,190)` there: one band. Four runs on that one slide,
on 19 palettes, at 4.27:1 where the page reads 5.02:1. It now tests every rect from
`getClientRects()`; a block box generates exactly one, so nothing else moved.

This one is worth naming for its shape. The probe's own docblock lists its approximations
and says both "fail toward a backdrop closer to the truth than the section canvas" — i.e.
toward a *lower*, more conservative number. This one did too, and a conservative gate
that cannot be satisfied is not conservative, it is broken: no palette value could have
cleared a band that is not painted.

**`checkDiagramScopeSelectors` rejected `(:root)+` outright.** `--fail` is in the diagram
token closure, and the check admits `:root` or a `section` + class compound. Its own prose
says what it is guarding against — "a positional pseudo-class, an attribute selector, a
`:has()`, or a descendant/sibling combinator" — and a repeated `:root` is none of those:
same single element, no per-slide variance, specificity only. Left as it was, it forced a
choice between a diagram token that resolves per-slide correctly and one that resolves at
all in an export.

A fourth parser needed teaching rather than fixing: `tools/build-docs-portal.js` matched
the root selector WHOLE, which is correct and is what keeps descendant rules out — and it
meant `:root:root` fell through the test entirely, so the doubled block was invisible to
the docs portal while it was the winning declaration everywhere else. Three tiers now,
not two.

## 7. Numbers

| | before | after |
|---|---|---|
| `composed-contrast.js` — pairs below bar | 70 of 1984 (`main`, post-#1801) | **66 of 1984** |
| — cleared outright and DELETED from the baseline | — | **4** (`policy-recommendation/defer-badge`, brina + laguna) |
| — newly-modelled surfaces added to the catalog | — | **3**, all passing |
| `palette-sweep.test.js` — sub-threshold runs, 32 palettes | 113 (pre-#1801 tree) | **5** |
| — decks swept | 1 | **2** |
| palettes whose curated trio reaches a CLI export | **0 of 32** | **32 of 32** |
| trio VALUES changed by this branch | — | **0** — they are #1801's, verbatim |
| non-trio token edits | — | **10**, on four tokens #1801 does not touch |

The last two rows are the point. This change moves no status-trio value at all; what it
moves is whether the values already in the tree arrive on the page. Before it, every one
of #1801's 192 freshly-solved pairs was inert in a rendered PDF.


## 7b. Who actually cleared the `redline-strike-ink` backlog

`slide-contrast.test.js` carried a `PREEXISTING_CONTRAST_BACKLOG` entry pinning
`section.redline del` at 4.25:1 on `gallery @ indaco-dark`, and its staleness arm fired
during this change and forced the entry's deletion. The obvious reading — and the one the
first draft of this note and the commit message both took — is that the trio re-curation
cleared it. It did not.

Measured by running both PROBE versions against one render: the `getClientRects()` fix moves
exactly four runs on `gallery.md` p105, and **two of them are `<del>`, not `<ins>`** —
`thirty (30)` and `shall delete` go 4.44 → 5.15 on `gallery @ indaco-dark`. Those two runs
ARE the backlog entry. So §6's probe fix cleared it, and the trio had nothing to do with it.

Worth recording because the wrong attribution is the more flattering one, and because it
means the probe fix was load-bearing twice: once for the 19 palettes it un-flagged in the
sweep, and once for a sibling gate's backlog nobody was looking at.

## 7c. Two claims this change made that measurement refutes

Both were written by this change, about surfaces it declared verified. They are recorded
here rather than quietly corrected, because an unreproducible number in a design record is
worse than no number.

**"carbone's print band does not leak the palette hue."** The commit that made this change
claimed to have REFUTED a checker finding by sampling a rendered print band at
`193,193,193`, neutral. That measurement was taken on the wrong element: the test deck used
`_class: print` with a plain blockquote, which renders as a KEY INSIGHT box, not
`section.redline`. On a real `_class: redline print` slide the bands sample
**rgb(229,242,231)** and **rgb(246,231,231)** — `color-mix(#73DF88 12%, transparent)` over
the print canvas, i.e. carbone's own green, and the matching red.

The mechanism is real: `--pass-bg` is declared at `:root`, so `var(--pass)` substitutes
against the ROOT value, and `section.print`'s remap of `--pass` arrives too late to change
a mix that was already resolved. What the correction does NOT change is that this is
**pre-existing and cross-palette** — `origin/main` leaked base's green at carbone's 18%, and
indaco leaks its own at 10%. This change alters which green, not whether. No contrast gate
moves either way, because the print band's ink is `--print-*` gray regardless.

**"13 phantom sub-threshold pairs on an arm that renders correctly."** Also false, and
corrected in `tools/composed-contrast.js`'s own docblock. `--panel-edge-mark` is declared
only at `:root:root`, so by this change's own measurement it is inert on the packed paths:
the Studio resolves base's `var(--accent)`, which on onyx IS `--surface-inverse` — 1.00:1
against the panel, the exact defect `2026-08-18-split-frame-edge-ownership.md` set out to
fix. The specificity fix to the export arm is still right; the four palettes need their
`:root` half too. Tracked as **#1797**.

The pattern in both is the same and worth naming: a number measured on a surface adjacent
to the one being claimed. It is the failure this repo's gates keep catching in others, and
it went into two records here before a second checker caught it.

## 8. What this does not cover

- **The joint re-solve.** The composed-surface constraint and the monochromacy floor both
  want the same three tokens and pull them opposite ways (§3). Clearing the rest of
  `KNOWN_SUB_THRESHOLD` means running #1801's one-dimensional lightness solve with the
  SURFACES table added to its objective, on all 32 palettes at once, and re-blessing both
  frozen tables from the result. It also subsumes carbone's mode-invariant pin (§5) and
  concrete's three `redline` runs (§4). It is the single largest remaining item in this
  swimlane and it wants its own visual sign-off.
- **The other 33 collided tokens.** `--hljs-*` (12), the diagram state family (8),
  `--on-accent`, `--seq-500`, `--code-text` and the palette-specific rest are still decided
  by source order, and still #1527's. This change neither helps nor hinders that flip; it
  removes three tokens from its blast radius by making them clear their bar in both orders.
- **One viewport.** Every sweep is at 1280x720; a fit-spine reflow at another width is a
  different composite and nothing scores it.
- **The `kanban` status wash (#1788).** `gallery-jargon.md` writes `kanban` cards with
  STATUS sub-bullets, which `gallery.md` does not, so the `[data-s]` card takes a
  status-tinted fill and the card title's `--text-heading` lands on a colored wash instead
  of the neutral card. Recorded as a ceiling on the new deck and tracked, not fixed here:
  it is a component-level tune of two wash percentages across all 32 palettes.
  **The general lesson is the one worth keeping:** a run that no deck WRITES is a run no
  probe can score, and no amount of palette-axis coverage substitutes for it.
- **`--panel-edge-mark` is inert on the packed paths (#1797).** Four palettes declare it at
  `:root:root` ONLY, which is the same half-fix this note exists to correct — measured
  through `composeCss`, all four fall back to base's `var(--accent)`, which on `onyx` IS
  `--surface-inverse`: a 1.00:1 panel edge. Pre-existing and off the path of this change,
  so it is logged rather than pulled in; the four docblocks now say what is true.
- **The catalog is still a catalog.** Three surfaces were added here
  (`kanban/card-code-chip`, `kanban/done-card-title`, `kpi/hero-target-line`), each found by
  a rendered sweep rather than by reading the token table. That is the third time in three
  slices that the rendered tier found a surface the analytic one did not model. The gap is
  structural: a catalog entry has to be written, and nobody writes one for a stack they have
  not seen.
