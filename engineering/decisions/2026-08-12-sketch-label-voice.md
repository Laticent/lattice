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

One useful finding for whoever closes it: **`'Shantell Sans'` on its own
contains no hyphen**, so the sketch face specifically would survive that
sanitizer where the general stack cannot. That makes a sketch-scoped fix
plausible without touching the general WYSIWYG gap.

Left out deliberately (HARD RULE #18, off-path): it is a different mechanism
(JS theme-variable plumbing, not CSS token routing), it has its own parity test
asserting the divergence, and it changes rendered diagram geometry — which
belongs in its own change, not bolted onto a CSS token sweep.

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
