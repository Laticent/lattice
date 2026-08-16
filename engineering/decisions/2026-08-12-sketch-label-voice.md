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
   ever show — `Q1`…`Q4` and `Jan`…`Dec`, each with an optional two-digit year
   tag, 1616 strings in all. No author text reaches the label. Issue #1663 was
   drafted against `MMM` at 1.148, which looks like the worst case and **cannot
   occur**; calibrating to it would have been calibrating to a string the engine
   never emits.
2. **Rounding a safety constant up is itself the regression here.** The tick
   wraps with `maxLines: 1`, so "break early" does not mean "wrap sooner" — it
   means *ellipsize*. Above 0.941 (56 units / 7 chars × 8.5 fsTick) the one-line
   budget drops to six characters and the ordinary `Jan '26` renders as
   `Jan …`. The window is [0.889, 0.941] and 0.90 sits in it with air at both
   ends; a unit test pins both walls.

One visible consequence, and it is correct rather than tolerated: a crowded
monthly axis thins one step further under sketch. At ~24 units of tick spacing
the hand's painted `Mar` (22.1u) leaves 1.7u of air, under the 2u the cull
requires — so alternate months drop. A perfect measurer culls them too, which is
how we know it is the face being wider and not the constant being generous.

Note that `lib/base/base.docs.md` already claimed axis ticks rode the hand seam
while these three did not. That claim is now true; it was aspirational before.

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
