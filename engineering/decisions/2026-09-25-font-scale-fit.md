---
status: shipped
summary: `scale-l`/`scale-xl` clipped a large share of real decks (25 of 64 slides on the repro deck at xl, 133 slides across 47 of 70 galleries) because type grows and the box does not. Fixed with (c) both. The engine gains STEP, a Fit-Ladder move that takes a slide that does not fit back down the scale ladder, never below 1x, so nothing clips. `lint:deck` gains `capacity-scale`, an `info` budget measured per scale. Code keeps scaling; its line cap scales with it. Amended 2026-09-26: STEP made neighboring slides alternate size, so LEVEL now puts every slide that asked for one scale on one rung (the highest all fit), and a `venue:` register (laptop / huddle / conference / hall) sets the scale from the room's viewing distance.
builds-on: 2026-06-22-the-fit-spine.md, 2026-07-28-capacity-basis.md, 2026-07-29-autosplit-is-not-a-toggle.md, 2026-09-07-overflow-guards-trim.md
---

# The projection font scale must not clip a slide

**Status:** shipped · **Owner:** Sharmarke · **Code:** `lib/core/scale-fit.js`,
`lib/authoring/lint-core.js` (`capacity-scale`), `lattice-emulator.js`, `lib/runtime/index.js`

> **Amended the same day — two sizes, and a switch.** The owner ruled on the follow-up
> design (`2026-09-25-fit-policy.md`): STEP no longer walks 1.5 → 1.3 → 1.15 → 1. A slide
> that does not fit the deck's scale lands on the designed size, 1x, so a deck carries two
> sizes at most. And STEP is governed by the new `fit:` register: `heal` (default) runs it,
> `report` switches it off. The numbers below record the ladder as #2378 shipped it; on the
> repro deck at scale-xl the two-size rule gives 40 slides at 1.3x and 24 at 1x, 0 clipped.
> The frozen renders in `2026-09-25-font-scale-fit-renders/` are the ladder's.
>
> **Amended again 2026-09-26 — one size per deck.** Two sizes still read as a deck that
> changes size as you click. The owner chose one size: every slide that asked for a scale
> renders on the highest rung all of them fit, in-between rungs included, which replaces
> the two-size rule. It also added the `venue:` register. See the amendment at the end.

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
- **Demo deck:** `examples/font-scale-fit.md` (`class: scale-xl`), rendered as
  `examples/font-scale-fit.pdf`. The dark and `scale-l` renders are frozen here beside this
  record, in `2026-09-25-font-scale-fit-renders/` (`scale-xl.dark.pdf`, `scale-l.light.pdf`,
  `scale-l.dark.pdf`), made by
  swapping the front-matter `class:` line for `scale-xl dark`, `scale-l` or `scale-l dark`.
  At xl, pages 2, 6, 8 step to 1.15x and 4, 5 to 1x; at l, pages 4, 5 step to 1x.

## What this does not do

- **Lint does not predict every step.** Compare-prose, matrix-2x2, cycle and roadmap slides
  step on word density or chart geometry that no count budget sees. The engine still
  handles them, and the SCALE line names them.
- **The live preview shows no marker on a stepped slide.** The slide fits, so there is no
  ring; the export line and the `data-lattice-scale-step` attribute are the channels. A
  small author-mode tab is a follow-up (`followups.d/2378-p3-scale-step-preview-tab.md`).
- **When `guards: strict` and a scale are both on**, the embedded watcher can re-run STEP after
  the emulator's TRIM on a resize and land one rung higher than the SCALE line reported.
  The slide still fits in both states.

## Amends

- `2026-06-22-the-fit-spine.md` §3 — the closed four-move list gains STEP (and TRIM, which
  2026-09-07 admitted). Noted inline there.
- `engineering/typography.md` §7 — "When NOT to use it" now describes STEP.

## Amendment 2026-09-26 — one size per deck, and `venue:`

**What went wrong.** The first real deck to opt in, the agentic-practices talk (PR #2361),
rendered at `scale-xl` with 45 slides at 1.3x, 11 at 1.15x and 14 at 1x. STEP stepped each
slide on its own, chrome included, so neighboring slides alternated size and the running
header, eyebrow and page dots pulsed as you clicked through. The owner saw it at a glance,
and the talk went back to scale 1. The cost this note listed under "What it costs" ("Type
size can differ from slide to slide") turned out to be the defect, not a side effect.

**The options, measured** on that talk at `scale-xl` (70 slides, 69 transitions from one
slide to the next; sizes are multiples of the designed size; `.scratch` prototypes, not
shipped):

| Option | Body sizes (slides) | Body changes | Chrome sizes | Median body | Clipped |
|---|---|---|---|---|---|
| STEP as shipped | 45 @1.3, 11 @1.15, 14 @1 | 40 | 3 (29 changes) | 1.3 | 0 |
| A — chrome held at the deck's scale | same as STEP | 40 | 1 | 1.3 | 0 |
| **B — one rung per ask** (taken) | 70 @1 | 0 | 1 | 1.0 | 0 |
| B per section (rung per divider section) | 61 @1, 2 @1.15, 7 @1.3 | 3 | 3 | 1.0 | 0 |
| C — author scales chosen slides only | 56 @1, 5 @1.15, 9 @1.3 | 20 | 3 (17 changes) | 1.0 | 0 |
| D — no STEP | 70 @1.3 | 0 | 1 | 1.3 | 25 |

Only B and D give one size, and D clips 25 pages. B and D converge once the binding slides
are trimmed; B is the version that never cuts content on the way there. B's cost is that a
dense deck gets no enlargement until it is trimmed: the talk lands at 1x until 14 slides
are trimmed (1.15x) or 25 (1.3x).

**Decision (owner, 2026-09-26): B.** STEP still finds each slide's own highest fitting
rung; a new pass, LEVEL (`levelScaleSteps`, rule 7 in the kernel header), then puts every
slide that asked for the same scale on the lowest of those rungs. It reads only what STEP
recorded, so it never measures. It runs in all three callers: the emulator pass, the
embedded watcher (both inject `SCALE_LEVEL_SRC`), and the live runtime, which measures only
the slides in view and re-sweeps when LEVEL moves a slide it did not measure. A slide no
rung fits is left out of the minimum (size cannot save it) and renders at the shared rung.
The `↓ SCALE` line now names the slides to trim for each rung above the one the deck landed
on.

**Why the scale matters at all — and `venue:`.** The owner then asked what drives the
need. The answer is viewing distance. Slide text is a fixed share of screen height, so its
angle in the eye depends only on how many screen-heights away the back row sits; at scale 1,
Lattice's body text is about 51.6 ÷ k arcminutes of x-height, and a mixed audience reads
comfortably at about 12′. That made the problem partly an authoring one: authors were
picking a multiplier when what they know is the room. The owner chose a `venue:` register
(`laptop` / `huddle` / `conference` / `hall`, one per rung) that sets the scale, lifts the
meta role past the body (`--venue-meta-lift`, 1.15 at conference and 1.3 at hall), and turns
`capacity-scale` into a warning. The bands came from the owner's own rooms (desk, huddle
4–6, conference 10–20 and 20–30, halls 50–100 and 500–2,000), which the math collapses
into four. The derivation is `engineering/typography.md` §7 "Venue". Rejected on the way: a
numeric `view-distance:` (authors do not know their room in screen-heights), a `call` venue
for video calls (owner: three bands plus laptop), and room-free names such as
small/medium/large or near/mid/far (owner preferred names for the room).

**Amended above:** "What it costs" no longer holds for type size; rule 2 now leaves a slide
no rung fits out of the shared rung instead of at its request.

**Then the live surfaces (same day).** Verification on the real Studio build found that the
editor preview and Present render one slide per document, so LEVEL saw one slide and a
`venue: conference` deck still showed 1.3x · 1x · 1.3x as you moved through it (the gap
`2026-09-25-fit-policy.md` §4 predicted). The owner chose to close it in the same PR. The
Studio now renders a scaled deck once in a hidden frame, runs a full sweep there
(`latticeSweep.sweep({ all: true })`: 225–376 ms of STEP for the 70-slide talk, LEVEL under
3 ms), and writes the shared rung per ask as `data-lattice-scale-cap` on each single-slide
frame's document element; LEVEL never lands above it (`docs/src/lib/scale-cap.ts`, the
kernel's rule 7). Decks without a scale never create the frame. Pinned on the real surface by
`docs/e2e/scale-one-size.spec.ts`: every slide at the shared rung in the editor preview and in
Present, the full scale back after the binding slide is trimmed, and no cap on an unscaled
deck.

**Checker round on the Studio half (same day).** An independent checker reproduced one
blocking bug on the real Studio: when the hidden frame had to rewrite its whole document
(a Mermaid slide on screen flips its signature), the measure read the PREVIOUS deck's
document, which still had sections and a runtime until the new page committed, and cached
that cap under the new deck. The fitting deck then stayed at 1x, and came back at 1x on an
undo to the same text. Fixed: a measure waits for a NEW document after a full write, and
measures run one at a time so two cannot cross-write; each deck debounces on its own; and
a known cap is written into a rewritten preview frame's `<html>`, so the runtime's first
sweep never paints the uncapped size. `docs/e2e/scale-one-size.spec.ts` pins the bug in its
own test, which fails on the unfixed code (the fitting deck stays at `1.3>1`) and passes on
the fix, plus a test that an unscaled deck never creates the frame, with a positive control.
Left as known and low: the measuring renderer is never disposed (one frame and one memo entry
for the page's life), and its whole-deck renders show in the Studio's performance overlay.
