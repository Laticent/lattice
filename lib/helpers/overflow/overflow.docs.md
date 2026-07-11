# overflow

Authoring-time diagnostic. When a slide's content exceeds the 1280×720
budget, the renderer adds `class="overflow"` to the section so CSS can
draw a red warning ring around the slide.

The ring is meant to be impossible to miss during deck review and
trivial to fix (delete content, shorten prose, switch to `compact`).
Shipped decks should never have overflow rings.

---

## How it fires

- `lattice-runtime.js` measures rendered slide height against the
  720px budget. If overflow is detected, it adds `.overflow` to the
  section at runtime.
- `lattice-emulator.js` produces an analogous static check during PDF
  build, but the ring/tab are stripped before bytes are written — an
  overflowing slide produces a clean, clipped PDF page plus a stdout
  warning naming the exact page(s), never a marked-up export. The ring
  (and the Fix-Me overlay below) are preview-only, authoring-time-only
  signals.

The `.overflow` class is the contract. Anything that detects overflow
and wants the ring just adds the class.

---

## Fix-Me overlay — pinpointing the cause (Case A)

The ring tells you a slide overflows; it does not tell you what to fix. When
the cause is a bounded content cell (`.cell-stage` / `.panel-right` /
`.compare-right`) that genuinely clips its own content — never a grow-to-fit
grid card that merely grew and pushed a neighbor past the frame, which is a
different, unsafe-to-pinpoint case — `lattice-runtime.js` draws a yellow
outline with a "Fix Me" corner tag at the culprit's bottom-right (offset from
the ring's own top-right "Overflows" tag so the two never collide).

**It narrows further than "the whole cell" when it can.** A cell often holds
a repeated-item collection (cards-grid's cards, split-compare's two options)
whose items are flex row-mates STRETCHED to a common height — so box size
alone can't tell the genuine over-stuffed card from an innocently-stretched
neighbor sharing its row. What does: each item's own *content slack* (box
height minus how far its own content actually reaches) — the culprit's
content nearly fills the shared height, the bystander's doesn't. When a clear
low-slack outlier exists, ONLY that item is highlighted; when the row is
uniformly dense (no real outlier) or the cell has no known collection at all,
it falls back to the whole cell — never a guess dressed as a fact.

This is preview-only, like the ring itself: it lives entirely in
`lib/runtime/index.js` (never in `lattice-emulator.js`, so it can never reach
an exported PDF/PPTX/HTML). The cell-level signal comes from
`lib/core/overflow-probe.js`'s `overCells` — every clip cell whose own spill
exceeded the 12px tolerance, a geometrically certain cause, not a guess. The
item-level drill-down resolves each component's repeated-item collection via
`lib/runtime/axis-dom-catalog.generated.js` (built from every manifest's
`density.axis` + an explicit `domSelector` override for the handful of
components whose own transform retags the rendered elements — see
`lib/components/manifest.schema.json`). See
`engineering/decisions/2026-07-10-overflow-cause-highlighting.md` for the
full design (including the deliberately-deferred Case B: a grow-to-fit-grid
fallback for slides with NO clip-cell at all, keyed off the prose-density
word budget).

If a slide overflows for a reason neither Case A nor Case B can safely
attribute — an oversized image, a long code block, a wide table — no Fix-Me
tag appears. The ring alone still fires; guessing wrong would be worse than
staying silent.

---

## Fix-Me overlay — the density-budget fallback (Case B)

Case A needs a bounded clip-cell to blame; some layouts (`kanban`,
`timeline-list` — the `STAGE_DEFERRED` bucket in
`lib/forms/cell/masthead/masthead.transform.js`, plus any component under
`form: off`/`no-form`) never get wrapped in one, so a genuine "grow-to-fit
push" overflow on those slides gives Case A nothing to point at. Case B
covers that gap: when a section overflows with **zero** clip-cell spill at
all, `lattice-runtime.js` falls back to the component's own
`density.soft`/`density.hard` word budget (the same manifest field
`lib/authoring/review-core.js`'s Node-side linter already enforces) and
highlights whichever item in the slide's repeated-item collection has the
highest LIVE word count — measured off the rendered DOM's own `textContent`,
not the markdown source (the runtime never has source at hand in a live
preview) — once that count clears `hard`.

**This is an editorial guess, not a geometric fact, and its label says so.**
Case A's tag reads "Fix Me" — an unhedged claim, because clipping is
provably true. Case B's tag reads "Likely fix" instead, with a native
tooltip ("Likely cause — Nw words, over budget") carrying the fuller,
still-hedged detail. Never the same string for both — see HARD RULE #23 (a
claim must never overclaim its own certainty).

Case A and Case B are mutually exclusive per section: Case B only runs in
`check()`'s `else` branch, when Case A's `overCells` found nothing at all.
Architecture, the `kanban`-doesn't-actually-repro-it finding (its card
text is CSS-truncated, so it can't overflow via prose length —
`timeline-list` is the real one), and full verification are in
`engineering/decisions/2026-07-10-overflow-cause-highlighting.md` §12.

---

## How to silence

There is no "silence" — by design. If the ring is on the slide, the
slide is broken; the fix is to make the content fit.

Common remedies:

- **Switch to `compact`** (`<!-- _class: <layout> compact -->`):
  tightens spacing scale ~25%; usually buys back one card of room.
- **Split the slide.** Two cards-grid slides at 4 items each beat one
  cards-grid at 6.
- **Trim prose.** Per the editorial rule, content slides go past ~40
  words become walls of text the audience stops reading anyway.
- **Switch component.** If `cards-grid` is bursting, `cards-stack`
  uses the full slide width per card. If `compare-prose` is bursting,
  the `vertical` modifier stacks the cards.

---

## Where the CSS lives (current)

The `section.overflow` rule currently lives in
`lib/base/base.modifiers.css` (alongside other cross-cutting modifiers).
A planned cleanup will extract it into `lib/helpers/overflow/overflow.styles.css`
to live next to this doc — the rule is a helper, not a modifier, and
this folder is its proper home. The extraction is straightforward but
out of scope for the Phase 5 docs refactor; see commit history when
the move lands.

---

## Other helpers (future)

This folder is the home for diagnostic and authoring-time helpers.
Anticipated additions:

| Helper | Purpose |
|---|---|
| Slot tracer | Highlight which DOM element each manifest-declared slot resolved to. Tier-1 debugging aid when a layout looks broken. |
| Debug grid | 1280×720 overlay with safe-area markers. |
| Token swatches | Render every palette token on a single slide for theme calibration. |
| A11y inspector | Outline focus order, contrast warnings, alt-text gaps. |

Each lands as its own subfolder: `lib/helpers/<name>/<name>.docs.md`
+ `<name>.styles.css` + optionally `<name>.transform.js`. Same pattern
as `lib/helpers/overflow/`.

---

## See also

- `lib/base/base.docs.md` — the rest of the cross-cutting chrome
  conventions (eyebrow, subtitle, key insight, etc.).
- `engineering/visual-review.md` — the deck visual-review workflow that
  the overflow ring feeds into.
