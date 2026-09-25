---
status: shipped
summary: `scale-l`/`scale-xl` clipped a large share of real decks (25 of 64 slides on the repro deck at xl, 133 slides across 47 of 70 galleries) because type grows and the box does not. Fixed with (c) both. The engine gains STEP, a Fit-Ladder move that takes a slide that does not fit back down the scale ladder, never below 1x, so nothing clips. `lint:deck` gains `capacity-scale`, an `info` budget measured per scale. Code keeps scaling; its line cap scales with it.
builds-on: 2026-06-22-the-fit-spine.md, 2026-07-28-capacity-basis.md, 2026-07-29-autosplit-is-not-a-toggle.md, 2026-09-07-overflow-guards-trim.md
---

# The projection font scale must not clip a slide

**Status:** shipped · **Owner:** Sharmarke · **Code:** `lib/core/scale-fit.js`,
`lib/authoring/lint-core.js` (`capacity-scale`), `lattice-emulator.js`, `lib/runtime/index.js`

## Symptom

`typography.md` §7 recommends `class: scale-xl` for "projection, back-of-room reading".
Turning it on clipped a large share of a real deck:

| Surface | scale 1 | scale-l | scale-xl | scale-2xl |
|---|---|---|---|---|
| Repro deck (agentic-practices, 64 slides) | 0 | 13 | 25 | — |
| 70 component galleries (775 slides) | 0 | 87 slides in 32 galleries | 133 slides in 47 galleries | — |

Measured with `--no-split` so page N stays slide N, reading the emulator's own
`⚠ OVERFLOW` line. At scale-xl the repro deck clipped **code 8, list-steps 5,
compare-prose vertical 5, cycle 2, list takeaway 2, agenda 1, matrix-2x2 1, roadmap 1**.

## Root cause — type grows, the box does not

`--fs-scale` multiplies ten of the twelve `--fs-*` tokens. The slide's padding, gaps and
cell geometry are `cqi` values that do not ride it, so the content box stays the same size.
What the content needs grows by more than the scale:

- a **one-line** element (an agenda row, a code line) needs about `s` of its designed
  height: 1.3x at scale-xl;
- a **wrapped** paragraph needs about `s²`: the glyphs are taller AND fewer fit on a line.
  That is 1.69x at scale-xl.

A component authored to its capacity at the designed size fills its box. No spacing a
stylesheet can reclaim buys back 30–69% of the height, so no per-component CSS fix makes
the documented capacity fit at 1.3x. The measured ceilings below say the same thing
component by component.

### Dividers and the closing slide

The brief reported dividers and a closing slide clipping although h1/h2 are exempt. On the
current repro deck at scale-xl **no divider and no closing slide clips**. Mapping an
`OVERFLOW` page number to a slide by counting `<section` in the `.html` sidecar gets the
wrong slide: the sidecar inlines the engine CSS, whose comments contain `<section>`
literals. Mapped that way, the same page list names four dividers, a title and a glossary.
Mapped through the DOM (`section` elements that have no ancestor `section`), it names the
components in the table above.

The closing slide does clip in two gallery shapes, and in neither case is the heading the
cause (it holds at 64px):

- **`closing index`** (the gallery's "See also" slide): the body list is `--fs-body`, and
  five long bullets need ~665px of a 544px stage at 1.3x.
- **`closing qr`**: the QR tile is em-sized, so it grows 218px → 283px with the scale. The
  lead paragraph beside it also grows.

## The decision — (c) both

The brief offered three mechanisms.

**(a) The Fit Ladder absorbs the scale.** At `wide`, the ladder's existing moves cannot.
COLLAPSE and SHED restyle within the box. SPLIT does not run at a landscape @size, because
16:9 is the box a deck is authored in (2026-07-29). FLOOR is the ring. There was no move
that trades size for fit, because the spine rules out a shrink below the designed type
scale (2026-06-22 §3).

**(b) Capacities shrink with the scale, enforced by lint.** Lint cannot see enough of a
slide to predict its fit. 2026-07-28-capacity-basis.md already measured that "the same
slide fits or clips depending on its look modifier and whether it carries a trailing
insight". Scored against the engine over the 70 galleries and the repro deck at scale-xl
(§ Lint below), a count budget named the slide the engine had to step 65 times and was
wrong 70 times. Lint alone would leave every other clip silent, and every chart, QR code
and quote has no count axis for lint to budget at all.

**(c) — taken.** The ladder gains a move that can absorb the scale, and lint forecasts it.

### STEP — the new rung

`lib/core/scale-fit.js`. When a slide's resolved `--fs-scale` is above 1 and the slide
does not fit, STEP sets the next rung down the SAME ladder the author picks from (1.5,
1.3, 1.15, 1) as an inline `--fs-scale`. It stops at the first rung that fits. It never goes
below 1.

**Why this is not the shrink the Fit Spine forbids.** The spine's floor is "the curated
per-orientation type scale" — scale 1. STEP never crosses it. It declines the author's
optional enlargement on one slide. It is also the fix `typography.md` §7 already told the
author to apply by hand ("step the scale back down"), and the slide it renders is the
slide a hand-written `_class: scale-l` renders, chrome included. The spine's other rule,
"never a silent shrink", is met by reporting: the export prints a `↓ SCALE` line naming
every page and the rung it landed on, and the section carries
`data-lattice-scale-step="1.3>1.15"`.

**Its five rules** (full text in the kernel's header):

1. Nothing happens at the designed size. A section at `--fs-scale` 1 is read once and
   never written, so every deck without a scale class renders pixel-identically. (The
   exported `.html` gains the kernel's source in its embedded watcher, so its bytes change.)
2. Fit or change nothing. When no rung fits, the requested scale is put back, and the ring
   and the `OVERFLOW` line report the slide as authored.
3. "Does not fit" means the ring's `over`, plus a clip box cutting readable text. A `code`
   line past the pane's right edge is cut by the pane's own `overflow: hidden`, which the
   geometry probe reads as the box doing its job. A cut confined to the footer does not
   count.
4. Idempotent. Each call first undoes its own previous step, so the live preview gives a
   shortened slide its full scale back.
5. A `<!-- stress-slide -->` specimen overflows on purpose and is left alone.

**Order on the ladder:** COLLAPSE → SHED → SPLIT → **STEP** → TRIM → FLOOR. STEP comes before
TRIM because it loses no content.

**One kernel, three callers (HARD RULE #1):**

- the emulator's explicit pass, before TRIM and before the overflow measurement;
- the watcher embedded in every exported `.html`, so the sidecar agrees with the PDF;
- the live runtime's sweep (`lib/runtime/index.js`), which the Playground, the player and
  the export-to-Marp bundle all run.

The emulator and the embedded watcher inject the function's source (`SCALE_FIT_SRC`); the
runtime requires it.

### What it costs

- **Type size can differ from slide to slide in one deck.** A stepped slide's chrome
  (header, footer, page number) steps with it, as it does under a hand-written
  `_class: scale-l`. The `--fs-*` tokens resolve on the section, so pinning the chrome
  would mean redeclaring the tokens on each chrome element. Not done here; the SCALE line
  and `lint:deck` tell the author which slides to trim if a consistent size matters more.
- **A measurement pass on every render path.** It runs only on sections whose scale is
  above 1: one `getComputedStyle` read per slide otherwise.

## The code answer — the line cap scales

The brief asked for one of two answers for code: the line cap scales, or code stops
scaling. **The cap scales.** `code` is set in `--fs-body-compact`, the second-smallest
role on a slide. Exempting it would leave the densest, least forgiving text in the room as
the one thing the projection scale does not reach — the inverse of §7's rule that "the
small, readable stuff grows toward" the headings. Past the scaled cap the slide does not
clip: STEP takes it down until the block fits.

Measured with the calibration rig, one-line heading, `wide`:

| | designed | scale-l | scale-xl | scale-2xl |
|---|---|---|---|---|
| lines, no eyebrow | 15 | 13 | 11 | 10 |
| lines, under an eyebrow | 13 | 11 | 10 | 8 |
| columns (`floor(102 / s)`) | 102 | 88 | 78 | 68 |

Re-derive: `node tools/calibrate-capacity.js code --family wide --max 16 --scale xl [--eyebrow]`.

## Lint — `capacity-scale`, an `info` budget

`lib/authoring/lint-core.js` carries `SCALE_CAPACITY`: for each counted component, the
element count at which it last fits at `wide`, at each scale, measured at two element
lengths (6 words, and the component's `density.soft`). The rule reads the length at or above
the slide's longest element, so four one-line cards are not judged as four paragraphs.
`CODE_LINES_AT_SCALE` is the code table above.

**Why a measured table, not a formula.** `floor(ceiling / s)` over-promises on 7 of 26
components (agenda at xl: formula 4, measured 3). `floor(ceiling / s²)` still over-promises
on glossary and team-profile, whose layouts change shape at a scale.

**Why `info` and a budget, not a `warning` and a forecast.** The engine acts on the slide
by itself and loses nothing, which is the case `capacity-autosplit` is `info` for. And the
forecast is weak, for the reason 2026-07-28 recorded. Scored against the engine's SCALE
line over the 70 galleries and the repro deck at scale-xl:

| Model | Right | Wrong | Missed |
|---|---|---|---|
| longest element → nearest measured length (shipped) | 58 | 70 | 17 |
| mean element, interpolated | 51 | 56 | 24 |
| label length only | 40 | 8 | 35 |
| shipped, skipping `compact` slides | 31 | 21 | 14 |

Most of the "wrong" rows are `compact` slides and list variants, which hold more than the
bare component the rig measures. A `warning` that is wrong half the time would red
`lint:deck:all --strict` on slides that render whole. So the finding states only what the
table knows, "holds about 4 at scale-xl (5 at the designed size); this slide has 5", and
names the export's SCALE line as the measurement. Past the designed-size column as well, it
says instead that a step cannot save the slide: several declared `hard` values sit above
what the rig measures at 1x (authority-chain, kpi, pricing, q-and-a, regulatory-update,
team-profile). A `code` block taller than the pane at 1x is the one `warning`: it is a
real cut at every scale.

Re-derive the table: `node tools/calibrate-capacity.js --all --family wide --scale xl
--words 6` and `--words soft`, and the same for `l`, `2xl` and no `--scale`. Run at a
scale, the tool checks the table rather than the manifest's designed-size `hard`.

## Verified

- **Repro deck at scale-xl:** 0 clipped, 25 stepped (12 to 1.15x, 13 to 1x). The `.html`
  sidecar opened in Chromium also reports 0 overflowing sections. At scale-l, 13 stepped
  and 0 clipped.
- **70 galleries**, clipped slides before → after, with every slide still clipped after
  the change a `stress-slide` specimen (rule 5):

  | | scale-l | scale-xl | scale-2xl |
  |---|---|---|---|
  | before | 87 | 133 | not measured |
  | after | 11, all specimens | 20, all specimens | 29, all specimens |

- **The real Studio** (`/studio/`, `npm run dev`, the demo deck pasted into the editor):
  the live preview stepped the same pages to the same rungs as the PDF — 2, 6, 8 to 1.15x
  and 4, 5 to 1x — with no slide carrying `.overflow`.
- **Scale 1 is unchanged:** every rendered page is pixel-identical (rule 1). All 70 galleries
  were re-rendered and rasterized against renders taken before the change: 0 differing pages.
  `tools/pixel-check.js` over `gallery-jargon`, `font-scale`, `slide-context-editor`,
  `overflow-guards` and `matrix-grid-rendering-jank` reports 5/5 pixel-clean. The exported
  `.html` does change bytes on every deck, because its embedded watcher now carries the kernel.
- **Demo deck:** `examples/font-scale-fit.md`, light and dark.

## What this does not do

- **Lint does not predict every step.** Compare-prose, matrix-2x2, cycle and roadmap slides
  step on word density or chart geometry that no count budget sees. The engine still
  handles them, and the SCALE line names them.
- **The live preview shows no marker on a stepped slide.** The slide fits, so there is no
  ring; the export line and the `data-lattice-scale-step` attribute are the channels. A
  small author-mode tab is a follow-up (`followups.d/scale-step-preview-tab.md`).
- **When `guards: strict` and a scale are both on**, the embedded watcher can re-run STEP after
  the emulator's TRIM on a resize and land one rung higher than the SCALE line reported.
  The slide still fits in both states.

## Amends

- `2026-06-22-the-fit-spine.md` §3 — the closed four-move list gains STEP (and TRIM, which
  2026-09-07 admitted). Noted inline there.
- `engineering/typography.md` §7 — "When NOT to use it" now describes STEP.
