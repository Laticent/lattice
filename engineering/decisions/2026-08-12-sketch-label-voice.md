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

### The shading, and why AA is not the thing that blocks it

**Who draws it:** rough.js, driven by Mermaid's `userNodeOverrides`, which
**hardcodes** `fillStyle: "hachure"` with `fillWeight: 4`, `hachureGap: 5.2`,
`roughness: 0.7`. Mermaid's config exposes only `handDrawnSeed` — there is no
`fillStyle` knob, so "give me a solid hand-drawn fill" is not available. The
hachure colour is the `mainBkg` themeVariable (Lattice's `--cat-1-fill`) for
EVERY node, because Lattice's per-node colours come from CSS that no longer
matches.

So a node's "fill" is not a flat colour: it is stroked diagonal lines over the
page canvas, and label ink sits over an alternating stroke/gap background.

**Measured: contrast is not the problem.** Audited all 32 themes with the
shipped `tools/contrast-audit.js` loader + colour math, scoring `--cat-on-fill`
against the solid fill, the bare canvas, AND every blend between them (a striped
background is not decided by its endpoints — if the ink's luminance fell between
stroke and gap, the blend could be worse than either). It does not: on all 32
themes the minimum sits at an endpoint, and the worst case across the whole set
is **6.02:1** (carta-dark) against a 4.5 floor. No theme fails.

**The real regression is one the contrast audit structurally cannot see.** On
`a11y-*`, `onyx` and `concrete`, a node's fill is
`var(--cat-N-texture, var(--cat-N-fill))` — an SVG pattern paint-server, and the
M1 redundant-encoding channel that lets a CVD or monochrome reader tell
categories apart **without hue** (`engineering/textures.md`). Under `handDrawn`
the `> rect` selector stops matching, the texture disappears, and every node
gets the same uniform hachure. Rendered on `a11y-deuteranopia`: classic gives
four distinct tiles (diagonal, counter-diagonal, horizontal, vertical); handDrawn
gives four identical boxes. **Categories become indistinguishable for exactly the
readers the texture exists to serve** — a worse failure than a contrast miss, and
invisible to every contrast metric.

Note also the trap in the obvious fix: re-pointing the texture at rough's paths
layers a pattern over a pattern. And a naive `fill:` override on those paths is
wrong outright — rough paints hachure as STROKED paths with `fill: none`, so
forcing a fill turns the squiggles into solid blobs.

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
