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
different, unsafe-to-pinpoint case — `lattice-runtime.js` also draws a yellow
outline around that specific cell with a "Fix Me" corner tag at its
bottom-right (offset from the ring's own top-right "Overflows" tag so the two
never collide).

This is preview-only, like the ring itself: it lives entirely in
`lib/runtime/index.js` (never in `lattice-emulator.js`, so it can never reach
an exported PDF/PPTX/HTML). The signal comes from `lib/core/overflow-probe.js`'s
`overCells` — every clip cell whose own spill exceeded the 12px tolerance —
which is a geometrically certain cause, not a guess: a clip cell that
overflows clipped its own content, unlike a section-level "biggest box"
heuristic. See `engineering/decisions/2026-07-10-overflow-cause-highlighting.md`
for the full design (including the deliberately-deferred Case B: a
grow-to-fit-grid fallback keyed off the prose-density word budget).

If a slide overflows for a reason neither the clip-cell probe nor (once built)
Case B can safely attribute — an oversized image, a long code block, a wide
table — no Fix-Me tag appears. The ring alone still fires; guessing wrong
would be worse than staying silent.

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
