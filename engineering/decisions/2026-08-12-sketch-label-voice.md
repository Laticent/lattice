---
status: shipped
summary: The `sketch` finish reaches label voice by re-pointing --font-label, but 95 label-voice sites pinned --font-mono directly and were unreachable from it — so counters, column heads, chips, chart figures and three component eyebrows rendered machine-faced on hand-drawn slides. Routes every label-voice site onto --font-label (a strict no-op on every non-sketch theme, since --font-label defaults to var(--font-mono)), fixes three eyebrows whose font never reached their <code> child, and gates the invariant with checkLabelVoiceFont + SANCTIONED_MONO_FONTS. Mermaid diagram labels stay mono — a separate, pre-existing mechanism, logged below.
version: 1
supersedes: none
builds-on: 2026-06-11-sketch-finish.md, 2026-06-13-svg-native-legend.md, 2026-05-19-typography-token-refactor.md
---

# The sketch finish's label voice — one token, gated

**Date:** 2026-08-12
**Status:** Adopted

---

## The disease

The `sketch` finish is built on one good idea: it re-points type **tokens**
rather than enumerating elements. `section.sketch` sets

```css
--font-display: var(--sketch-font-display);   /* Caveat   */
--font-body:    var(--sketch-font-body);      /* Shantell */
--font-label:   var(--sketch-font-body);
--pill-font:    var(--sketch-font-body);
```

Custom-property inheritance decides the *value* a component's rule resolves, so
a component that pulls `var(--font-display)` on a metric numeral gets Caveat no
matter how specific its selector is. `--font-mono` is deliberately left alone:
real `code`/`pre`/math must stay unambiguous.

The mechanism works. What failed is **reach**. `--font-label` is the label
voice, and `base.tokens.css` defines it as `var(--font-mono)` — so the two
render identically on every shipped theme. That makes naming the wrong one
*completely invisible* until someone turns the finish on. 95 label-voice sites
had named `--font-mono` directly:

| What | Sites |
|---|---|
| Structural labels & chips — BEFORE/AFTER, column heads, card lifted labels, stamps, captions, kanban lanes | 43 |
| Counters & number badges — card numerals, step counters, Q/A markers | 14 |
| Eyebrows & kickers — chart, panel, math, legal, code-column labels | 12 |
| Chart data marks — legend values, gantt/quadrant/radar ticks, progress % | 13 |
| Citations & reference keys — statute cites, closing index keys | 9 |
| Slide chrome — cell-footer pagination, header/footer paragraph reset | 3 |
| Contact ledger | 1 |

Measured on the full 117-slide gallery forced to `class: sketch`: **301
mono-rendered text runs before, 72 after** — and the 72 are code.

A second, older bug hid inside the same blind spot. Three components
(`redline`, `citation-card`, `regulatory-update`) name the eyebrow font on the
parent `<p>` and reset the chip chrome on a companion `> code` rule — but that
companion never reset `font-family`, so `section code`'s `--font-mono`
(base.elements.css) won on the actual text node. Those eyebrows had **never**
worn the label voice, on any theme. Nothing could see it, because on a normal
theme the wrong answer and the right answer are the same font.

## The decision

**`--font-mono` in a `font-family` is an enumerated privilege, not a default.**
Every label-voice site routes through `--font-label`. Seventeen declarations
keep `--font-mono`, each for a stated reason:

- **Code and source literals** (8) — fenced blocks, the inline `code` chip,
  un-rendered mermaid source, function-plot notation, and the math matrix
  column whose 4em mono grid *is* the layout.
- **Error surfaces** (5) — a parse error quotes the author's own TeX or mermaid
  source back at them; it must stay literal, and must never read as deck
  content.
- **Engine diagnostic tabs** (3) — `overflow-tab` / `illegible-tab` /
  `fixme-tab`. Authoring-time instrument chrome. These must read as the engine
  talking and must NOT pick up a deck finish.
- **The wifi SSID / password literal** (1) — a password has to be transcribable
  without ambiguity (`0` vs `O`, `l` vs `1`). That is a code-voice requirement
  even though the surrounding slide is prose.

### Why chart figures moved too

The old `chart-family.css` comment argued legend values should stay mono "for
column alignment". That reason does not hold: the alignment comes from
`font-variant-numeric: tabular-nums`, not from the face — and **Shantell Sans
ships the `tnum` feature** (verified directly against
`assets/fonts/shantell-400.woff2`; Caveat does not, which is why the display
face is not a candidate here). The columns stay locked in both voices, so the
only thing mono was buying was a machine numeral sitting beside a hand label.

### Eyebrows stay upright

Under the finish an eyebrow is Shantell Sans, UPPERCASE, `0.18em` tracking —
unchanged. Italic was considered and rejected: neither Caveat nor Shantell Sans
ships an italic face in the embedded library, so `font-style: italic` would
synthesize an oblique on a hand face. `base.sketch.css` already documents why
that reads muddy (it is the reason the quote component's italic is stripped
under sketch). A real italic would mean embedding a new woff2, which changes
the bytes of every export — a bigger decision than this change, and not one
this work needs.

## Byte-safety

`--font-label` is defined **only** in `base.tokens.css` (as `var(--font-mono)`)
and re-pointed **only** in `base.sketch.css`. No theme overrides it. So on every
non-sketch render the swap resolves to the identical font stack.

Verified, not asserted: the full 117-slide gallery rendered before and after on
`theme: mustard` produces HTML whose only differences are CSS comment text, the
`font-family` token names themselves, and the two `section.sketch` rules deleted
below. **Zero slide-DOM change.** Overflow markers are identical across the pair
(`clip-marked` 12, `fit-marked` 2, before and after), so the wider hand face
tips nothing into a new overflow.

## Two sketch overrides deleted

Both existed only to fight the wrong token, and both are now dead weight:

- `section.sketch::after { font-family: var(--font-label) }` — the scaffold's
  pagination now names `--font-label` itself.
- The `font-family: … !important` half of the decision / compare-prose
  lifted-label override. It carried an `!important` because the component's
  `:has(> strong:first-child)` selector (0,3,4) outranked the sketch rule
  (0,3,3). Those component rules now name `--font-label` themselves, and
  **re-pointing a token beats any specificity contest** — inheritance decides
  the value the winning rule resolves. The radius `!important` beside it stays
  load-bearing: geometry is not a token, so it still loses without it.

## The gate

`checkLabelVoiceFont` (`tools/check-ownership.js`, via `build:check`) holds
`font-family: var(--font-mono)` in `lib/**` to budget 0 plus the enumerated
`SANCTIONED_MONO_FONTS` allowlist. It fails on an unlisted declaration AND on a
sanction that over-claims its `count`, so the list cannot rot. Both arms were
verified by injecting a violation of each.

This matters more than a normal ratchet because the defect class is
*invisible by construction*: no render test on a shipped theme can see a
label-voice site holding the wrong token, since both tokens resolve to the same
stack. The gate is the only thing that can catch it.

## Closed later — the three measured-geometry labels (#1663, 2026-08-16)

Three native-chart labels were sanctioned out of the sweep above and held back
through #1647, not because their voice was in doubt but because their **layout
geometry is computed from a static per-character advance** rather than measured:
`.gantt-tick`, `.wc-key-label`, `.wc-key-edge`. Pointing the CSS at
`--font-label` while the math still assumed mono would have retired the
wrapper's break-early guarantee silently, and invisibly off `sketch`. #1663
closed all three; the three sanction entries are gone and the chart family scans
**0 mono runs** under sketch.

The useful lesson is that the two rules needed **opposite** answers, and only
measuring told them apart:

- **`.gantt-tick` needed a second constant.** Mono sets 0.720 per character
  whatever the string says; the hand sans runs 0.561 (`Jul '11`) to 0.889
  (`May`) over the same labels, so one number cannot serve both. The builder now
  takes a `hand` flag from the slide's `sketch` class and selects
  `ADVANCE_HAND_TRACKED` (0.90) or `ADVANCE_MONO_TRACKED` (0.75).
- **`.wc-key-label` needed nothing.** Re-measured at its own CSS (uppercase +
  0.08em tracking), mono is 0.680 per character and the hand 0.675 — the tracked
  uppercase heading paints the same width either way, so the existing 0.75 bound
  still covers both the wrap width and the divider rule's `headW`. The CSS moved
  alone.

Two things about that hand constant are worth carrying forward, because both
walls of its window are load-bearing and each fails silently:

1. **The tick vocabulary is CLOSED**, so a measured maximum is a real bound
   rather than a sample. `buildGanttTicks` generates every label the axis can
   ever show — `Q1`…`Q4` and `Jan`…`Dec`, each with an optional year tag — and no
   author text reaches the label. Issue #1663 was drafted against `MMM` at 1.148,
   which looks like the worst case and **cannot occur**; calibrating to it would
   have been calibrating to a string the engine never emits.
   *Don't restate this set as a count.* An early draft of the constant's comment
   said "1616 strings", which is wrong: the tag is `String(year).slice(2)`, so a
   3-digit year yields a one-character tag (`0500-01-01` → `Q1 '0`). The bound
   does not depend on the count — it depends on the widest per-character form (a
   bare 3-letter month) and on nothing reachable being longer than 7 characters.
2. **Rounding a safety constant up is itself the regression here.** The tick
   wraps with `maxLines: 1`, so "break early" does not mean "wrap sooner" — it
   means *ellipsize*. Above 0.941 (`tickBoxW` 56 / 7 chars × 8.5 `fsTick`) the
   one-line budget drops to six characters and the ordinary `Jan '26` renders as
   `Jan …`. The window is [0.889, 0.941] and 0.90 sits in it with air at both
   ends; a unit test pins both walls, deriving each from `GANTT_GEOM` and from the
   emitted axis rather than restating the numbers.
3. **The floor protects the COLLISION CULL, not the wrapper.** Easy to get
   backwards, and the constant's first comment did: it claimed an under-count
   makes a label "overrun its box". It cannot — the widest label paints under 44
   units into a 56-unit box, so every reachable tick fits one line at any advance
   in this range. What an under-count breaks is the cull, which derives each
   tick's half-width from the same constant and would then let neighbors
   overprint. Both walls hold on either metric: on the real rendered ticks
   `getBBox().width` exceeds `getComputedTextLength()` by at most 0.016 per
   character, and the worst tick is 0.8885 on both.

One visible consequence, and it is correct rather than tolerated: a crowded
monthly axis thins one step further under sketch. At ~24 units of tick spacing
the hand's painted `Mar` (22.1u) leaves 1.7u of air, under the 2u the cull
requires — so alternate months drop. A perfect measurer culls them too, which is
how we know it is the face being wider and not the constant being generous.

Note that `lib/base/base.docs.md` already claimed axis ticks rode the hand seam
while these three did not. That claim is now true; it was aspirational before.

### The bug this uncovered in the runtime's class ordering

Making a transform's GEOMETRY depend on a deck-wide token exposed a latent
ordering defect in the browser runtime, found by an independent checker on the
#1663 diff and fixed in it.

`applyDeckClassFromFrontMatter` resolved the deck's registers inside a **promise
continuation**, so the FIRST `runAllContentTransforms()` pass read every section
*before* its deck-wide tokens landed. The bootstrap comment already named that
hazard and leaned on a later re-run to converge the two render paths — but the
re-run is gated on `applyDefaultComponent()` reporting a change, so a deck whose
slides all name their own component (`_class: gantt` on every slide) never gets
one. And chart-family's `chart-frame` idempotency guard makes the re-run a no-op
for charts even when it does fire.

Harmless while no transform keyed on a deck token; a real desync the moment one
keyed on it for MEASUREMENT. Reproduced against the shipped
`dist/lattice-runtime.js` in jsdom: a `mode: sketch` gantt came out with **13
ticks (mono advances) painted in the hand face**, where the engine renders 8 —
precisely the CSS-and-math-disagree failure this whole change exists to prevent.
`mode:` is the register that breaks, because Marp stamps a native `class:` itself
but has never heard of `mode:`.

Fix: `applyCachedDeckClass` now **primes the cache synchronously from the baked
front-matter block** when the promise has not resolved yet. The token derivation
moved out of the continuation into `deckClassConfigFrom(fm)` so both paths share
it. This is the same reasoning `deckFormMode` already used for `form: off` — the
baked block is in the DOM and `readBakedFrontMatter` is synchronous, so on the
export path there is nothing to wait for. Only the `.md` FETCH fallback genuinely
cannot answer that early, and deferring first paint behind a network round trip is
what the bootstrap deliberately refuses to do.

#### What the priming does NOT cover, measured

The fix reaches every path that carries a baked block — which is every
Export-to-Marp bundle. One surface remains: **marp-kit**, where a hand-rolled Marp
setup references our runtime, so the HTML has no baked block and the runtime falls
back to fetching the source `.md`. That fetch cannot land before first paint, and
deferring first paint behind a network round trip is what the bootstrap refuses to
do. There, a `mode: sketch` gantt still builds its axis with mono advances and
paints it in the hand face. (Over `file://` the fetch fails outright, so no token
lands at all and paint and math agree on mono — consistent, if machine-faced.)

Measured rather than assumed, on the real rendered surface — 15-month axis, mono
advances, hand paint:

| | |
|---|---|
| tick pairs under the cull's intended 2u air | **1 of 12** (`Feb`\|`Mar`, 1.85u) |
| overprinting pairs | **0** |
| worst clearance | 1.85u |

So the practical cost on that surface is one pair sitting 0.15u tighter than the
cull intends, with the face correct.

**Considered and rejected: pairing the paint to the measurement structurally** —
have the builder stamp the face it measured (`data-face="hand"`, which
`wrapSvgLabel` already supports via `attrs`) and let CSS follow that attribute
instead of the class. It would make the desync impossible on every path, at the
cost of one sanctioned `--font-mono` declaration. Rejected because it makes the
*viewer's* outcome worse exactly where it applies: on that surface the axis would
render machine-faced on a hand-drawn deck — the defect this whole change exists to
remove, visible on every gantt slide — in order to recover an invariant whose
violation there costs 0.15u of tick spacing and no overprint. Trading a visible
regression for an invisible one is the wrong direction. Revisit if the fetch
fallback ever becomes a common surface, or fold it into the proper fix: un-gate the
runtime's re-run AND make the chart axis rebuildable, which would give that path
hand geometry *and* hand paint. That is a bootstrap-and-chart-family change across
all 14 chart components, and belongs in its own PR with its own checker.

#### Closed — the proper fix landed (#1673, 2026-08-16)

The paragraph above named the two defects and deferred them. Both are now gone,
and the residue it measured with them.

**The re-run was gated on the wrong question.** `if (applyDefaultComponent())
runAllContentTransforms();` asked whether the DEFAULT-COMPONENT stamp had
changed — a signal with no relationship to whether the deck's own registers had
landed. For a deck whose every slide names its own component it is permanently
false, so those decks never re-ran and the convergence the bootstrap comment
claimed was simply not happening. The gate is now the union of that signal and a
new one: `deckClassStampedSincePass`, set by `applyCachedDeckClass` when it
actually changes a section's class list, and cleared by `runAllContentTransforms`
the instant it has applied the classes for the pass it is about to run.

That clear-point is the whole design, and it is what keeps the cost story
intact. On the baked path the block primes synchronously *inside* pass 1, so the
stamp belongs to that pass and is cleared before the transforms run — both gate
signals are false and the deck pays nothing, which is the property the old gate
was reaching for and the reason not to just drop it. Only the fetch fallback,
where the answer genuinely cannot arrive before first paint, buys a second pass.

**A chart could not be rebuilt even when the re-run fired.**
`transformChartSection` early-returns on a section already carrying
`chart-frame`, and the DOM adapter had replaced `innerHTML` on pass 1, so the
authored `<ul>` the builder needs was gone. The adapter now keeps that source in
a `WeakMap` keyed by the section, alongside the class list it built for, and
rebuilds from it when — and only when — that class list changes.

Two choices inside that worth keeping:

- **A `WeakMap`, not a `data-` attribute.** An attribute would ride into every
  exported bundle, inflating the artifact and changing its bytes, to serve a
  re-run that only ever happens live in a page session. The map is exactly that
  scope, and it lets a previewer replacing a section wholesale on an edit drop
  the entry with it. **No exported byte changes.**
- **The comparison is order-independent** (tokens sorted before joining), and
  the *absence* of a change is what buys the free pass. The runtime runs this
  transform repeatedly and cheaply on purpose — every transform is an idempotent
  no-op — so a chart that rebuilt on every pass would throw away its own
  `data-mark` popover targets and anima nodes each time. Both halves are pinned
  by test, because either being wrong is a defect.

Verified the way #1664's fix was: the parity test drives the real shipped
`dist/lattice-runtime.js` in jsdom, and now covers the fetch fallback (no baked
block, an `https://` origin, a stubbed `fetch` that resolves on a later turn than
the synchronous first pass). **Confirmed to fail without the fix** — 1 of 9
assertions, the tick count, exactly the one that reads which advance the builder
used. The five baked-path assertions are unchanged and still pass.

**The cost, measured on the real runtime rather than argued.** Two different
numbers, and it is worth keeping them apart — CHART BUILDS (observed as
`.chart-body` insertions) and TRANSFORM PASSES (counted inside
`runAllContentTransforms`):

| path | chart builds | transform passes | ticks |
|---|---|---|---|
| baked block + `mode: sketch` | **1** | **1** | 8 (hand) |
| fetch fallback + `mode: sketch`, plain slide | — | **2** | — |
| fetch fallback + `mode: sketch`, chart slide | **2** | **3** | 8 (hand — converged) |
| fetch fallback, no `mode:` | 1 | 1 | 13 (mono) |

The baked path pays nothing, which is the property the old gate was reaching for
and the whole reason the gate survived rather than being deleted. The fetch
fallback buys a second pass, and on a CHART deck a third — the rebuild's own
`innerHTML` write returning through the MutationObserver. An earlier draft of
this note said "the second pass" flatly; that undercounted the chart case.

Steady state is clean on both paths: after the deck settles, further transform
passes leave the SVG node IDENTITY unchanged. That mattered enough to measure
rather than reason about — a rebuild-every-pass bug looks completely correct in
the rendered output while quietly discarding each chart's `data-mark` popover
targets and anima nodes on every tick of the preview.

#### What the adversarial trio caught (HARD RULE #25 tier 2)

The ladder was mis-applied at first. #1673 was scoped to maker-checker, and
#1672 got no independent eyes at all — self-review plus the gates — despite
changing a shared kernel whose `measureLabel` / `widestOf` serve every
chart-family label. The tier-1/tier-2 question turns on *novel*, and keeping a
source snapshot so a transform can rebuild a section is machinery no other
transformer in this repo has. Escalating found three defects the gates could
not, two of them in the half that had already been reviewed.

**`mode: sketch-clean` measured the hand and painted the clean face.** The
worst of the three, because it is the exact defect class this whole line of work
exists to close, reintroduced by the fix for it. `sketch-clean` resolves to
`sketch sketch-clean-body`, and that rule puts `--font-body` BACK to the clean
stack while leaving `--font-display` and `--font-label` on the hand. The three
labels here are `--font-body`; `.gantt-tick` is `--font-label`. So the gantt's
`classTokens.includes('sketch')` predicate is correct for the gantt and wrong
here — and it was copied without re-asking which token the rule names. Measured,
the hand table is NARROWER than the clean one for `C`, `D`, `O`, `Q`, so
`C`/`O`-heavy names under-count by up to 11% (`LOCO` 0.703 estimated against
0.790 painted) — the direction that lets a line past its box. Now
`readsHandBody()`, with a test on the seam.

Latent in precisely the way the original bug was: no shipped deck pairs
`sketch-clean` with a quadrant or radar, so the byte-identical corpus proves
nothing about it. **The generalizable lesson: ask which TOKEN a rule names,
never which mode looks hand-drawn.**

**`data-orientation` is a build input that the rebuild key ignored.**
`transformChartSection` takes three arguments and the class list is one of them.
Orientation is re-stamped at runtime from measured aspect, and builders key on it
(the funnel's portrait viewBox, `GANTT_GEOM_TALL`) — so a chart built for
landscape could sit on a section that had since become portrait. Same
measure-versus-paint disagreement, different channel. Now part of the key.

**Two false claims in this change's own comments.** `svg-label.js`'s header still
said "NO FONT METRICS. A pure kernel has no DOM and no font tables" — the
sentence that was the *argument* for why an estimate was acceptable — while the
file had grown a 92-entry font table. And the new test's header claimed that "a
change to the glyph table, to the shipped faces, or to those rules has to face
these again": false for the middle one, since both the table and the recorded
measurements are frozen literals in the same repo, so bumping a woff2 moves the
paint while both sides sit still and the suite stays green. Both corrected.
Closing that drift channel properly — a generator following the
`tools/derive-*` / `calibrate-*` precedent, or a font-file hash pin gated by
`build:check` — is a real follow-up, and is now stated as missing rather than
implied to exist (HARD RULE #23).

#### What the checker caught, and why the first cut was wrong

Two defects survived the maker's own testing, both found by the independent
checker required here (HARD RULE #25), both reproduced before being accepted.

**The rebuild dropped the finish backdrop.** `injectBackdrops()` runs at the TOP
of a pass (inside `applyCachedDeckClass`), and the `.backdrop` wrapper is the
section's FIRST CHILD rather than part of any transform's output — so a rebuild
writing `innerHTML` later in the same pass took it with it, and nothing restored
it until the MutationObserver's 150 ms debounce brought the next pass around. A
finish visibly popped in late, on chart slides only. This is a regression the
change itself introduced, so HARD RULE #18 gives it no exit — filing it would
have been the prohibited move. Fixed at the ordering, by re-injecting after the
registry as well: the hazard belongs to any transform that rebuilds a section's
children, and a transformer has no business knowing what a finish is.

**Engine diagnostic classes forced rebuilds.** The trigger was "the class list
changed", but the overflow / fit / legibility watchers toggle `overflow`,
`clip-marked`, `illegible` and `fit-marked` onto sections as live state — and
they land on chart sections for real, as the type-floor alarm's own note records
(7 of 11 slides of the state-chart gallery). Every flip re-minted a chart to
identical output while discarding its popover and motion targets. `classKey` now
excludes them.

The two fixes are deliberately layered: a missing entry in that exclusion list
costs wasted work rather than a broken slide, because the backdrop is restored
either way.

A third finding was a test defect, and the useful kind. The assertion written to
prove the rebuild "replaces rather than stacks" counted `.chart-frame` — which is
a class on the `<section>` itself, so it was always exactly 1 and could not fail
for the thing it existed to catch. It counts `.chart-body` and `svg` inside the
section now. The backdrop test needed the same correction in a different form:
read at the end of startup it passed with the fix reverted, because the debounce
had already repaired the document. It samples throughout and asserts on the
worst moment seen.

### Closed later — ADVANCE_UPPER under-bounded BOTH faces (#1672, 2026-08-16)

`ADVANCE_UPPER` (0.68, `svg-label.js`) was calibrated for uppercase + 0.04em
tracking in the CLEAN face. Its three consumers — `quadrant.transform.js:624` and
`:1093`, `radar.transform.js:772` — style their labels `--font-body`, which
`base.sketch.css` re-points to the hand sans, where the hand exceeded 0.68 by up
to ~9.6% (`Wide moat` 0.745, `Emerging challengers` 0.723, `Operational maturity`
0.706, `Quick Wins` 0.692).

**Re-measuring first changed what the bug was.** Those four strings reproduced
exactly, but the vocabulary was widened from four gallery names to 42 strings
spanning `IL ILI` to `WWWWWWWWWW`, at each rule's real CSS (weight **700** — the
shipped rules say 700, not the 600 the issue assumed), and that showed the clean
face already broke its own bound on ordinary author text: `WORKFLOW` 0.790,
`AUTOMATE` 0.737, `COST` 0.702, `DEFER` 0.685. **This was never a sketch defect.**
Sketch widened an estimate that was already wrong, and a second per-face
CONSTANT — the shape the gantt tick used, and the shape this issue was drafted
around — would have carried the same class of error into both faces.

The reason the gantt answer does not transfer is the one the issue named: the
tick's vocabulary is CLOSED, so a measured maximum is a real bound. These labels
are author text, and no single average describes both `IL ILI` and `WORKFLOW` —
the two differ by more than 2× per character in the same face.

**Real measurement was not available.** `state-chart.transform.js:882` solves the
same problem with a canvas because its whole architecture is browser-measured
layout: it computes NO geometry at build time and installs a layout pass on all
three render paths. Quadrant and radar do the opposite — every box, wrap and
de-collision decision is made in a pure string transform, deliberately, so the
export and the runtime cannot disagree and the anima clone has a stable target
(`svg-label.js` header). Reaching for a canvas here means rewriting both charts,
not calling a different function.

**What shipped instead: a per-glyph table per face.** `upperAdvance(text, {hand,
tracking})` sums a measured advance per character and adds the rule's tracking,
so the estimate follows the STRING and the FACE. The table holds glyphs at
`letter-spacing: 0`, which is what lets one table serve all four tracked rules
(0.04 / 0.06 / 0.08em). Each entry is rounded UP to the nearest 0.05 — that
rounding is what buys the "never short" property. Predicted ÷ actually-painted,
over the 42-string vocabulary in both faces:

| estimator | ratio |
|---|---|
| flat 0.68 | 0.61 … 2.04 |
| glyph table | 1.02 … 1.08 |

Three things are worth carrying forward:

1. **Both ends of that range are defects, and they are different defects.** An
   under-count lets the line past its box AND makes `placeLabels` /
   `deCollideLabels` guard a box narrower than the painted glyphs, so an item
   label routes through a corner name. An over-count is not the safe direction:
   inflated boxes wrap text that fits and shove neighbors until the hide-overlap
   rule DROPS a name from the artifact. The goal is a tight bound, not a
   generous one — the same lesson `ADVANCE_HAND_TRACKED`'s ceiling records.
2. **A per-string average needs a per-LINE check.** `IL ILI WORKFLOW` averages
   well under what the line `WORKFLOW` alone paints, and it is the line that has
   to fit. `measureLabel` now re-asks with the widest line's own advance and
   re-wraps until the budget stops shrinking. A NUMERIC advance is unaffected —
   every line returns the same number, so the loop exits on its first pass and
   the legend, funnel and gantt callers are byte-identical.
3. **An unmapped character bills at the face's widest glyph.** Wrong in the only
   direction that cannot clip, which is what makes measuring non-Latin scripts a
   safe change to defer rather than a silent gap.

Verified on the real surface, not by eye: a stress deck of deliberately wide
author names rendered through the real pipeline in both modes, then read in
headless Chromium — computed `font-family` confirms Outfit clean / Shantell Sans
sketch, and every line's `getComputedTextLength()` is compared against the width
it was wrapped to. **One overrun before (`MMMM WWWW MMMM`, 12.9% past its box in
the hand face), zero after; zero painted-box overlaps either way.** Across all 22
shipped decks carrying a quadrant or radar (44 renders, clean and sketch), the
rendered HTML is **byte-identical** before and after.

That last number was only readable because #1677 landed first. Measured against
the base before it, five sketch decks showed whole-file diffs that had nothing to
do with this change — re-rendering twice with identical code produced the same
five, because their Mermaid SVG was nondeterministic run to run. Rebasing onto
the deterministic bake turned a result that needed a paragraph of explanation
into a clean zero. Worth remembering the next time a corpus diff looks alarming:
**run the control — render twice with the same code — before attributing a diff
to your own change.**

*A note on the gallery names.* Most do NOT straddle a word break between the two
faces, which is why the corpus renders identically and why the unit tests pick
`COMMITMENT WAVE` and `MAXIMUM COMMITMENT` deliberately — the seam where the
`sketch` token reaches the builder is unobservable on the shipped fixtures, so a
test written against them would pass with the token unplumbed.

Originally recorded here as *found, not fixed*: it arrived with the `--font-body`
re-point in #1647, not with #1663, and was off the path of a change scoped to
three specific rules with a different constant (HARD RULE #18's
pre-existing/off-path branch).

## Known gap — Mermaid diagram labels (NOT closed here)

Text inside a rendered Mermaid diagram stays JetBrains Mono under sketch. This
is pre-existing and already documented as sanctioned drift: `fontFamily` is the
sole entry in `DIVERGENT_KEYS` (`lib/core/mermaid-theme-map.js`), because
mermaid's `sanitizeDirective` allow-list for `themeVariables` has no hyphen —
so a stack containing `system-ui` / `sans-serif` is silently replaced with `""`
when it rides in a `%%{init}%%` directive, and a blank font is *worse* than a
wrong one (mermaid then measures labels in one font and renders them in
another, clipping mid-word).

Left out deliberately (HARD RULE #18, off-path): it is a different mechanism
(JS theme-variable plumbing, not CSS token routing), it has its own parity test
asserting the divergence, and it changes rendered diagram geometry — which
belongs in its own change, not bolted onto a CSS token sweep.

### What a follow-up actually has to solve — measured, not guessed

A throwaway probe (engine config patched, rendered through the real PDF
pipeline, reverted) established three things:

1. **The sanitizer is NOT the binding constraint.** `'Shantell Sans'` contains
   no hyphen, so it passes `DIRECTIVE_VALUE_OK` and reaches Mermaid intact —
   the labels really do render in the hand face.
2. **Label measurement is the binding constraint.** With the hand face, every
   node label clips mid-word ("Raw Signals" → "Raw Signa", "Decision Log" →
   "Decision Lo"). This is the failure `DIAGRAM_FONT_STACK`'s comment predicts,
   and the root cause is sharper than "proportional fonts are risky":
   `renderMermaidOne` shells out to `mmdc` with only `--backgroundColor` and
   `--puppeteerConfigFile`, so **mmdc's page never loads Lattice's fonts at
   all**. Mermaid measures in a fallback face and sizes the `foreignObject`;
   the SVG is then embedded in the host page where `lattice.css` DOES load the
   real face, and the wider text overflows the box it was measured for.
   Mono survives this only because its stack ends in the `monospace` generic —
   the fallback has near-identical metrics to the intended face. No hand face
   has that property.
   **The lever:** `mmdc` accepts `-C, --cssFile`. Feeding it the `@font-face`
   block would make the measure pass and the render pass agree.
3. **`look: 'handDrawn'` works today** (Mermaid 11.14 bundles rough.js) and can
   be set from a deck's own `%%{init}%%` — but it costs the palette. Lattice
   colours flowchart nodes with
   `g.nodes > g.node:nth-of-type(N) > rect`, and the handDrawn renderer emits
   `g.rough-node > g.basic.label-container > path`, so BOTH halves of that
   selector miss and every node falls back to a single fill. Mirroring the
   `nth-of-type` block onto the rough path selector is not sufficient on its
   own either: rough.js paints its fill as a hachure of stroked lines, so a
   `fill:` override leaves a muddy box that swallows the label ink.

### The shading — SUPERSEDED, see the note below

**This section's verdict was wrong and is retained only for the measurements.**
It concluded the hand look was disqualified because the categorical fill could
not reach a rough node. The fill IS reachable; the earlier probes were looking
for it in the wrong place. `2026-08-13-sketch-mermaid-hand-drawn.md` records the
mechanism and ships it. What survives from this section:

**Who draws the shading:** rough.js, via Mermaid's `userNodeOverrides`, which
**hardcodes** `fillStyle: "hachure"` (`fillWeight: 4`, `hachureGap: 5.2`,
`roughness: 0.7`). Mermaid exposes only `handDrawnSeed` — there is no
`fillStyle` knob.

**Contrast is not a blocker.** Audited all 32 themes with the shipped
`tools/contrast-audit.js` loader + color math, scoring `--cat-on-fill` against
the solid fill, the bare canvas, AND every blend between them (a striped
background is not decided by its endpoints — if the ink's luminance fell between
stroke and gap, the blend could be worse than either). It does not: the minimum
sits at an endpoint on all 32, worst case **6.02:1** (carta-dark) against a 4.5
floor.

**The texture finding stands, and is why the shipped feature refuses the hand
look on `a11y-*` / `onyx` / `concrete`.** There the per-category pattern is the
M1 redundant-encoding channel, and it cannot survive being painted through a
stroke — measured on `a11y-deuteranopia`, four distinct tiles collapse to four
grays 5% apart.

**What was wrong:** this section said the categorical fill was unreachable
because `g.node > rect` became `g.rough-node > … > path`, and that the muddy
boxes in the probe were inherent. Neither holds. A rough node's "fill" is a
STROKE (two paths, both `fill="none"`), so the palette goes on with `stroke` —
at which point the full categorical cycle works. The muddy boxes were a probe
that forced `fill` onto those stroked paths.

Also worth recording: a deck-authored `%%{init}%%` carrying its own
`themeVariables` **replaces the engine's palette wholesale** rather than
deep-merging it — the probe's variants fell back to Mermaid's stock
`#ECECFF`/`#9370DB` defaults. `engineering/mermaid.md` §5.3 currently tells
authors their own init "is fine and costs nothing", which is true for
`flowchart.curve` and not true for `themeVariables`. Worth a doc correction
independent of any sketch work.

## Found, not fixed — list-tabular's value column sits flush to the sketch frame

Under `sketch`, `list-tabular`'s right-aligned value column
(`ol > li > ul > li:nth-child(2)`, `text-align: right`) touches the drawn table
frame with no inset, because the finish draws the frame ON the ledger's own edge
while the value column has no right padding of its own. Cosmetic, and **not
caused by this change**: it is present identically in the before render, and the
hand face is in fact slightly narrower here than the mono it replaced, so the
change marginally improves it.

Recorded rather than fixed per HARD RULE #18's pre-existing/off-path rule —
this is `sketch`-frame geometry, not label-voice token routing, and pulling a
padding change into a 100-file token sweep would blur what the diff is for. The
value column is NOT truncated (a first read suggested it was; the gallery's
`−5 to +5 · Auto` is the complete source string).
