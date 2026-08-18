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

#### What the red team caught — the tighten loop was dead code

The worst finding of the three lenses, and the most instructive, because the
mechanism was correct and *unreachable*.

`measureLabel`'s per-line tighten loop only engages when `advance` is a
FUNCTION. All three consumers passed `advance: upperAdvance(name, {...})` —
which **calls** it, yielding a number. `advanceFor` then returned that same
constant for every line, `tighter >= budget` on the first pass, and the loop
exited having done nothing. So the safety property the whole change rests on was
off in every shipping caller, and the string-average hazard the loop exists to
prevent was live:

| slide | line emitted | box | actually painted |
|---|---|---|---|
| clean | `WORKFLOW WORKFLOW` | 140u | **154.3u** (+10.2%) |
| sketch | `MOMENTUM WINDOW` | 140u | **146.8u** (+4.9%) |

The estimator's own model agreed those lines were over budget and emitted them
anyway, and `widestOf` handed `placeLabels` boxes 6–9.5% narrower than the
painted glyphs — the exact under-count this change documents as the box-breaking
defect. Fixed by passing the function: `advance: (s) => upperAdvance(s, {...})`.
(`cornerSpec`'s `name` parameter became dead in the process and is gone.)

**Why no test caught it, and this is the part worth carrying forward.** The test
written for this property called `measureLabel` directly with the FUNCTION form
— the shape production does not use — so it exercised a path nothing reached.
Its companion asserted a hypothetical rather than the emitted wrap. Two tests,
zero coverage of the shipped path: the "test that cannot fail for the thing it
exists to catch" shape, self-inflicted. The replacement asserts on the SVG that
`transformChartSection` actually emits, and fails when the call sites regress to
a number.

**`toUpperCase()` expansion broke the char-count ↔ advance contract.**
`upperAdvance` returns a PER-CHARACTER number and both consumers multiply it
back by a count of the SOURCE string, but it divided by the UPPERCASED length.
`ß`→`SS` is 1→2 and the ligatures a paste out of a PDF carries (`ﬄ`→`FFL`) are
1→3, while CSS `text-transform: uppercase` performs the same mapping — so the
paint expanded and the count did not, diluting the advance by exactly the
expansion factor. Measured on a real render: a corner name of 16 `ﬄ` painted
**356.97u into a 140u box**, ran off the left edge of the viewBox and printed
through its neighbor. Now billed against the source length, so `STRASSE` and
`STRAßE` estimate the same total, which is what they paint.

**The rebuild could resurrect a deleted deck.** `built` cached the source from
the first pass with no invalidation, so a previewer reusing a `<section>` across
an edit — new content, class list re-stamped from `_class:` — rebuilt from the
stale source and painted a chart the deck no longer contained. A regression
against the pre-change code, which had no memory and so could not be stale. The
fix keys on `chart-frame`: it is the marker saying "this section holds built
output", and a re-stamp drops it. Deliberately **not** `innerHTML !== prior.html`
— transforms after this one restructure these children (masthead-lift hoists the
chrome into cells), so that test reads every section as stale on every later pass
and would disable rebuilding entirely. That was tried, and the suite caught it.

Also fixed: an explicit `null` options object threw (`= {}` defaults only
`undefined`), and one British spelling in new prose that the `checkUsEnglish`
curated list does not carry (HARD RULE #21 says that class rides on review).

**What the red team could not break**, which is worth recording as covered
ground: the per-glyph table itself (all 51 mapped glyphs re-measured against the
real shipped woff2s in both faces — **zero entries below the real advance**); the
re-run gate under a slow, 404, garbage and never-responding fetch (all converge,
no unbounded pass loop, no lost wakeup); cross-path parity on the real
fetch-fallback surface (all 35 geometry nodes byte-identical to the engine's);
backdrop and Form survival across a rebuild; `cloneNode` of a built chart; and
hostile author names (empty, whitespace, NBSP, a 4000-character unbreakable
token, ZWJ emoji, RTL, CJK, and markup-injection attempts, which are stripped to
text before reaching the emitter).

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
| glyph table | 1.02 … 1.11 |

Those endpoints describe the VOCABULARY, not any one string. An independent
re-measurement over a different 49-string set (the trio's verification lens) put
the table's upper end at 1.098 on fully-mapped text and 1.114 once an unmapped
script is in the string — so the "at most 8% generous" this section first claimed
was a property of the first vocabulary, not of the estimator. **The claim that
survives both sets is the lower wall: it never under-counts.** The same lens
caught the −39% / +104% ends being attributed to `WORKFLOW` and `IL ILI`
specifically, which the recorded per-string numbers contradict (13.9% short and
68.3% over respectively); they are the extremes of the set.

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
3. **An unmapped character bills a fallback — and "the widest glyph in the
   table" was the wrong fallback.** It sounds safe and is not: the table's widest
   glyph is only the widest we happened to MEASURE, while what an author can type
   is unbounded. Measured, a three-em dash paints 3.00em — three times the widest
   letter — so a label of them was estimated at **0.34×** its painted width, and
   an astral emoji at 0.81× because one glyph spans two UTF-16 units while the
   consumers count units. The em-quad dashes are mapped explicitly now, astral
   code points bill per unit, and the fallback is pinned at 1.10 against the
   widest unmapped thing measured (CJK and fullwidth Latin, both exactly 1.00em,
   which the old fallback cleared by exactly zero). The residual is stated on the
   constant rather than implied away: a character neither in the table nor under
   1.10em still under-counts, and only real measurement could close that.

Verified on the real surface, not by eye: a stress deck of deliberately wide
author names rendered through the real pipeline in both modes, then read in
headless Chromium — computed `font-family` confirms Outfit clean / Shantell Sans
sketch, and every line's `getComputedTextLength()` is compared against the width
it was wrapped to. **One overrun before (`MMMM WWWW MMMM`, 12.9% past its box in
the hand face), zero after; zero painted-box overlaps either way.** Across all **24** shipped
decks carrying a quadrant or radar (48 renders, clean and sketch), the rendered
HTML is **byte-identical** before and after. (22 in the first sweep — the
corpus glob missed `design/forms.gallery.md` and
`exemplars/academic/conference-talk.md`, both of which ship committed PDFs. Both
were rendered afterwards and are identical too, so the conclusion held; the
count did not.)

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

### Closed later — the glyph table could drift and nothing noticed (2026-08-17)

`GLYPH_UPPER` above is a measurement of two specific woff2 files. So is the
`MEASURED` array in `test/unit/transformers/svg-label.test.js`. **Both sides of
that comparison were frozen literals in this repo, and neither was derived from
the font** — so bumping `assets/fonts/outfit-700.woff2` moved the painted width
while the table and the recorded "measurements" held still. The unit suite
stayed green, `build:check` stayed green, and quadrant + radar labels would have
started overrunning their boxes silently, handing `deCollideLabels` a box
narrower than the painted glyphs. The #1672 work stated this honestly in the
test header and left it as a follow-up; this is that follow-up.

**Demonstrated before fixing, not assumed.** With `assets/fonts/outfit-700.woff2`
replaced by a different file, `node --test test/unit/transformers/svg-label.test.js`
passed 39/39. The hole was real and total.

#### Why a PIN rather than a GENERATED table

Two shapes were on the table: generate `GLYPH_UPPER` into a
`*.generated.js` artifact regenerated by `npm run build` with a freshness check
(the `tools/derive-*` precedent), or hash the font files and fail when a digest
moves. **The pin ships.** Three reasons, in order of weight:

1. **`npm run build` has no browser dependency today** — no step of it launches
   Chromium, and `build:check` is a pure deterministic byte-diff that runs on
   every PR. Generating this table needs a real browser, so `build:check`
   would start depending on the installed Chromium + HarfBuzz. A CI browser bump
   could then redden the gate with nothing wrong in the tree. **A gate that
   fails for environmental reasons is the sibling defect of one that cannot fail
   at all** — and this whole change is about not manufacturing false signals in
   either direction.
2. **The repo's own precedent points this way.** The browser-measuring tools
   (`calibrate-capacity.js`, `calibrate-density.js`) are deliberately NOT build
   steps; only the pure-JS derivations (`derive-cat-ink.js`) are. The generate
   option cited that precedent, but the precedent splits on exactly this line.
3. **The table is not a pure function of the font files anyway.** Which
   characters are mapped is curated; `GLYPH_UPPER_MAX` is explicitly *not*
   derivable from the table (that framing shipped once and under-counted a
   three-em dash by 3x); and the round-up rule has a judgment step. A generator
   would emit most of the artifact and leave the load-bearing rest hand-authored
   beside it — so it could never certify the whole thing.

What the pin gives up is auto-update: a font bump fails the build and a human
re-measures. That is the right trade here, because the parts a machine cannot
decide are exactly the parts that matter.

#### What shipped

- **`GLYPH_UPPER_FONTS`**, beside the table — face → `{ family, file, sha256 }`.
- **`checkFontMetricsPin`** (`tools/check-ownership.js`, via `build:check`).
  Fails on a moved digest, on a missing file (a hash gate that hashes nothing
  and reports green is the worst outcome available), and **both ways on key
  parity**: a face with a table but no pin fails, a pin naming a dropped face
  fails as stale. So a third face cannot land un-pinned and the list cannot rot
  — the same two-directional contract `SANCTIONED_MARGINS` carries.
- **`tools/measure-glyph-advances.js`** (`npm run fonts:measure`) — the
  remediation. A gate whose fix instruction is "re-measure somehow" is a
  nuisance; this makes it a command. It follows the `calibrate-*` shape: real
  Chromium, on demand, never writes, prints rows for a human to paste.

#### Both arms, proven

- **Fails:** `assets/fonts/outfit-700.woff2` replaced with a different file →
  `node tools/check-ownership.js` exit 1, and `npm run build:check` aborted at
  the ownership guard with the digest diff.
- **Passes:** restored → both green.
- **Every branch is load-bearing:** five mutations of the gate (digest compare
  disabled, each of the three parity/missing-file branches removed, and the
  `run()` call deleted) each fail at least one test in
  `test/unit/cli/check-ownership.test.js`. That last one matters most —
  a gate can be perfect and simply not wired in.

#### What the re-measurement found

Re-derived from the shipped faces, **the committed table holds: zero
under-counts in either face**, and all 13 rows of the unit suite's `MEASURED`
array reproduce to three decimals in both faces — an independent confirmation
that the harness reproduces the original method (same weight 700, same
letter-spacing 0, same space-by-difference, same round-up-to-the-next-0.05).

One correction to the record, which cost a wrong answer during development and
is now mechanized so it cannot recur: **the measurement must use the product's
whole font stack, not the bare family.** Measuring `font-family: "Outfit"` alone
sends glyphs Outfit lacks to Chromium's *last-resort* font, while the shipped
rule says `var(--font-body)` — `'Outfit', system-ui, sans-serif, …` — so they
land on system-ui. The two disagree: `→` paints 1.000em under the last resort
and 0.838em under system-ui. The bare-family reading reported the table's
(correct) `0.90` arrow as an 11% under-count that does not exist. The tool now
reads both stacks straight out of `lib/base/base.tokens.css`.

#### The checker's catch — each face ships TWICE, and only one was pinned

The first cut pinned `assets/fonts/`. Each face also ships from
`docs/src/playground/fonts/` — a separately vendored copy (wider latin subset;
`assets/fonts/README.md` records why) that `font-embed.js` inlines into the
**Studio's live preview**, which paints these very labels through this very
kernel. `tools/check-fonts.js` compares face *names* across the two supplies,
never bytes. So refreshing the Studio's copy would have moved the painted width
with every check green — **the same hole, one level over**, inside a change whose
whole claim was to have closed it.

Both supplies are now pinned. They are metrically equivalent today: measured
glyph by glyph in Chromium at weight 700, the two Outfits agree exactly and the
two Shantells agree within **0.0004em** across the whole table — far inside the
0.05 quantization, so one table legitimately serves both. `dist/fonts/` and
`dist/marp-kit/fonts/` are deliberately not listed: they are generated from
`assets/` (HARD RULE #2) and `build:check` already byte-diffs them.

#### Two claims the checker refuted, corrected in place

Both were in the first draft's "what the pin does not catch" paragraph — a
paragraph whose entire job is to be accurate about cover, which makes getting it
wrong the worst available error here.

- *"Weight/size/tracking drift is what the unit suite's MEASURED array catches."*
  **False.** Nothing in `test/unit/transformers/svg-label.test.js` reads a
  stylesheet; it drives `upperAdvance` against frozen numbers with `TRACK`
  hardcoded at 0.04. Verified by breaking it: re-tuning `.quadrant-label` to
  `font-weight: 400; letter-spacing: 0.12em` leaves the file passing **39/39**.
  The labels' CSS is guarded by nothing, and now says so.
- *"The theme seam is billed conservatively by `upperAdvance`'s unknown-face
  branch."* **False.** `face` is computed as `hand ? 'hand' : 'clean'`, so both
  keys always exist and the `||` fallback is unreachable — as that function's own
  comment already said. A theme re-pointing `--font-body` / `--sketch-font-body`
  paints a face this table never measured, and nothing bills for it.

#### Found, and now CLOSED for three of five — the sub-fallback entries are gone

**Update, 2026-08-17.** The three entries this section left as found — `―`
(1.05), `→` (0.90), `　` (1.05) — have been **dropped from both faces**, so they
bill `GLYPH_UPPER_MAX` (1.10) like any other unmapped character. `⸺` and `⸻`
stay mapped, for the reason this section already gives. What follows is the
measurement that unblocked it; the original text is kept below, because the
mechanism it records is still the mechanism.

The blocker was never the safety argument — that direction was always right (a
mapping *narrower* than the fallback is the thing that under-counts). It was that
a wider advance breaks lines earlier, which can change wrapping and push
`placeLabels` into dropping a name. That is rendered geometry, and it needed
measuring rather than asserting.

**What was measured**, on the real render path (emulator → HTML sidecar, then the
sidecar in headless Chromium — HARD RULE #23):

| Subject | Result |
|---|---|
| 24 shipped decks carrying a quadrant or radar slide, current table vs dropped | **byte-identical HTML**, all 24 |
| Label strings those decks actually bill | 66 strings, 37 distinct characters, **zero non-ASCII** — the three characters never reach the table at all |
| `test/fixtures/glyph-sub-fallback-labels.md` — a fixture whose labels DO carry all three, both faces, all three tracked rules (0.04 / 0.06 / 0.08em) | **byte-identical HTML** — 24 labels, 0 re-wraps, 0 placement shifts, 0 drops |
| Advance change on the 55 fixture strings that carry one | **+0.20% to +3.79%** (worst: `'→ Arrow'`, clean, 0.04em) |
| Control — the same three billed at **3.00** instead of 1.10 | **19 of 24 labels re-wrapped** |

The control is the part that makes the null result mean anything: a harness that
cannot see a wrap change would report "no change" either way. It sees one.

**Why the null result is not luck.** `upperAdvance` returns a per-character
average over the *whole* string. Re-billing one character of a 16–33 character
label moves that average by a few percent, and `charBudget` is a `floor()` — so
it takes a much larger shift to change how many characters fit on a line. The
control's 3.00 is that larger shift.

**Painted-vs-estimated, same fixture, measured in Chromium** (`getComputedTextLength()`
per line against the width the kernel broke it to, in viewBox user units): 46
lines, **zero painting wider than their box**, worst-case fill 93.9% (`'Quick Wins ― Bar'`,
hand face, 131.39u of 140u), and **zero neighbour overlaps**. Computed
`font-family` resolved to `Outfit` off-sketch and `Shantell Sans` under sketch —
the estimate and the paint were looking at the same face, which is the failure
this whole area exists to prevent.

`npm run fonts:measure` now reports **2 unpinned** (`⸺` `⸻`), 0 under-counts, and
no longer prints its "consider dropping the entry" note — that note was the tool
asking for exactly this change, on every run since #1699.

**Still true, and still the honest limit:** this is ONE host — a Linux container,
Chromium 131, one `system-ui`. macOS (SF Pro) and Windows (Segoe UI) remain
unreachable from here. That limit is now *less* load-bearing than it was, which
is the point of the change: the three characters no longer depend on a
host-specific reading at all, because they bill the fallback that was always
meant to cover them.

**Also found (pre-existing, logged not fixed — HARD RULE #18, off-path):** the
`hand` half of `GLYPH_UPPER` has **no shipped-deck coverage**. Across all 24
decks with a quadrant or radar slide, every billed label resolved to the `clean`
face — no shipped deck combines `sketch` with either chart. The hand table is
exercised only by the unit suite and by `test/fixtures/glyph-sub-fallback-labels.md`. Worth a gallery slide; not this change.

#### The original section — five table entries are in NEITHER woff2

`―` `⸺` `⸻` `→` `　` are not in Outfit or Shantell Sans. The HOST paints them,
so **their numbers are readings of the host's fonts and no digest here pins
them** — `fonts:measure` labels them `unpinned` on every run and holds them at
their committed values rather than overwriting them with one machine's reading.

Only ONE of the five comes from a fallback *face*: measured here, `→` is
system-ui at 0.838em, while `―` `⸺` `⸻` `　` measure identically under
system-ui, `sans-serif` and a family that cannot exist — they are **last-resort
boxes**, so their 1.00 / 2.00 / 3.00em is the notdef advance, not a measurement
of any face that has the glyph. (The first draft of this note said all five were
"painted by system-ui at a flat 2em and 3em"; that was wrong about four of them,
and the checker caught it.)

That still leaves 2.05 / 3.05 a real bound for the em-quad dashes — a font that
*has* them draws them at a definitional 2em and 3em, and a font that lacks them
draws the box we measured — which is why they stay mapped: no single fallback
value bounds them (an unmapped three-em dash under-counted by 3x). But `―`
(1.05), `→` (0.90) and `　` (1.05) sit *below* the 1.10 fallback, so on a host
whose fonts paint them wider the mapping is what under-counts, where dropping the
entry would have been safe.

**Left as found** (HARD RULE #18, pre-existing + off-path): every host measured
so far paints all three under their mapped value, so nothing is broken today;
and re-billing `→` from 0.90 to 1.10 is a +22% width change on a character that
appears in real author text, which shifts label wrapping and can push
`placeLabels` into dropping a name. That is a change to rendered geometry, and
it belongs with a measurement of its deck impact — not bolted onto a gate-
integrity change. It is recorded on the table itself and re-reported by the tool
on every run, so it cannot rot quietly.

*Measured on ONE host* — a Linux container, Chromium 131, one `system-ui`. macOS
(SF Pro) and Windows (Segoe UI) were unreachable from here, and `→ = 0.90` is
where that would bite. Stated rather than generalized.

## Known gap — Mermaid diagram labels — **CLOSED 2026-08-17 (#1674)**

**Original text, kept because the reasoning for deferring was sound.** Text inside a
rendered Mermaid diagram stayed JetBrains Mono under sketch. This was pre-existing and
already documented as sanctioned drift: `fontFamily` was the sole entry in
`DIVERGENT_KEYS` (`lib/core/mermaid-theme-map.js`), because mermaid's
`sanitizeDirective` allow-list for `themeVariables` has no hyphen — so a stack
containing `system-ui` / `sans-serif` was silently replaced with `""` when it rode in a
`%%{init}%%` directive, and a blank font is *worse* than a wrong one (mermaid then
measures labels in one font and renders them in another, clipping mid-word).

Left out deliberately (HARD RULE #18, off-path): a different mechanism (JS
theme-variable plumbing, not CSS token routing), its own parity test asserting the
divergence, and it changes rendered diagram geometry — its own change, not bolted onto
a CSS token sweep.

**How it closed.** Not by finding a font that survives the directive sanitizer, but by
removing the directive: the export renders in a page the engine owns and configures
Mermaid through `initialize`, so the full `--font-body` stack reaches both paths and
`DIVERGENT_KEYS` retired. Sketch then falls out of token routing —
`base.sketch.css` already re-points `--font-body` to `--sketch-font-body`. Verified on
the real export: 26/26 labels in the hand face, 0 clipped, across flowchart, state,
class, ER and sequence. Full record:
`engineering/decisions/2026-08-17-mermaid-render-worker.md`.

### What a follow-up actually had to solve — measured, then corrected by #1674

A throwaway probe (engine config patched, rendered through the real PDF pipeline,
reverted) established three things. **Points 1 and 3 stand; the "lever" in point 2 was
refuted, and is struck below rather than deleted so nobody re-derives it.**

1. **The sanitizer was not the binding constraint** *for a bare family name.*
   `Shantell Sans` contains no hyphen, so it passed `DIRECTIVE_VALUE_OK` and reached
   Mermaid intact — the labels really did render in the hand face.

   **Sharpened by #1674:** the quoting matters more than the hyphen rule suggests. A
   name wrapped in APOSTROPHES (`'Shantell Sans'`) does not merely get blanked — it
   takes the whole palette with it. `detectDirective` runs a blanket `'` → `"` swap
   over the payload before `JSON.parse`, so one apostrophe anywhere in `themeVariables`
   makes the payload invalid JSON and mermaid's catch drops EVERY directive in the
   diagram. Measured on 11.14: an apostrophe in `primaryColor` alone drops the palette
   to stock `#ECECFF`/`#333333`, where a hyphen only blanks the value it sits in.
   Double quotes survive. This never reached the engine — `prune()` stripped
   apostrophes from every emitted string — but the trap and its defense are both gone
   now that nothing emits a directive.

2. **Label measurement was the binding constraint.** With the hand face, every node
   label clipped mid-word ("Raw Signals" → "Raw Signa"). The root cause is sharper than
   "proportional fonts are risky": `renderMermaidOne` shelled out to `mmdc` with only
   `--backgroundColor` and `--puppeteerConfigFile`, so **mmdc's page never loaded
   Lattice's fonts at all**. Mermaid measured in a fallback face and sized the
   `foreignObject`; the SVG was then embedded in the host page where `lattice.css` DOES
   load the real face, and the wider text overflowed the box it was measured for. Mono
   survived only because its stack ends in the `monospace` generic — near-identical
   fallback metrics. No hand face has that property.

   > ~~**The lever:** `mmdc` accepts `-C, --cssFile`. Feeding it the `@font-face` block
   > would make the measure pass and the render pass agree.~~
   >
   > **STRUCK (#1674) — it cannot, by construction rather than by timing.** mermaid-cli
   > appends `myCSS` as a `<style>` INSIDE the SVG *after* `mermaid.render()` has
   > returned (`src/index.js`), and preloads `document.fonts` before that. Measured on
   > real `mmdc` runs with and without a data-URI `@font-face` via `-C`: node widths
   > 216.02 / 186.20 and `foreignObject` widths 156.02 / 126.20, **byte-identical both
   > ways**. Adopting it would move the PAINT to the hand face and leave the
   > MEASUREMENT in the fallback — i.e. reintroduce exactly the divergence
   > `DIVERGENT_KEYS` existed to prevent. Worse than doing nothing.
   >
   > The actual fix was to stop shelling out: render in a page the engine controls,
   > inject the `@font-face` block, and `await document.fonts` before rendering. See
   > `2026-08-17-mermaid-render-worker.md`.

3. **`look: 'handDrawn'` works today** (Mermaid 11.14 bundles rough.js) and can be set
   from a deck's own `%%{init}%%` — but it costs the palette. Lattice colored
   flowchart nodes with `g.nodes > g.node:nth-of-type(N) > rect`, and the handDrawn
   renderer emits `g.rough-node > g.basic.label-container > path`, so both halves of
   that selector missed. *(Shipped in #1647 by painting with `stroke` instead of
   `fill` — see `2026-08-13-sketch-mermaid-hand-drawn.md`.)*

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

~~Also worth recording: a deck-authored `%%{init}%%` carrying its own `themeVariables`
**replaces the engine's palette wholesale** rather than deep-merging it — the probe's
variants fell back to Mermaid's stock `#ECECFF`/`#9370DB` defaults.
`engineering/mermaid.md` §5.3 currently tells authors their own init "is fine and costs
nothing", which is true for `flowchart.curve` and not true for `themeVariables`. Worth
a doc correction independent of any sketch work.~~

**STRUCK (#1674) — measured, and it is not what happens. §5.3 was right.** A second
directive carrying `themeVariables` DOES deep-merge: engine `primaryColor: #123456`
plus author `lineColor: #ff0000` renders with both, on Mermaid 11.14. What the probe
hit was the APOSTROPHE (point 1 above) — its variants quoted the font family with `'`,
which made the payload invalid JSON and cost the diagram every directive it had,
palette included. The stock `#ECECFF` was the whole engine directive vanishing, not a
partial override winning. A correction was written into §5.3 on the strength of this
paragraph and then withdrawn when the measurement was redone.

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
