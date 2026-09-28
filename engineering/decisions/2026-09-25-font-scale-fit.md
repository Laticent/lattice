---
status: shipped
summary: `scale-l`/`scale-xl` clipped a large share of real decks (25 of 64 slides on the repro deck at xl, 133 slides across 47 of 70 galleries) because type grows and the box does not. Fixed with (c) both. The engine gains STEP, a Fit-Ladder move that takes a slide that does not fit back down the scale ladder, never below 1x, so nothing clips. `lint:deck` gains `capacity-scale`, an `info` budget measured per scale. Code keeps scaling; its line cap scales with it. Amended 2026-09-26: STEP made neighboring slides alternate size, so LEVEL now puts every slide that asked for one scale on one rung (the highest all fit), and a `venue:` register (laptop / huddle / conference / hall) sets the scale from the room's viewing distance. Amended 2026-09-27: every component manifest carries `venueCapacity` (a measured count per venue, or a stated reason for none), which lint, the docs and the pick list all read; the calibration rig's SCALE-line parse, broken by LEVEL, is fixed. Amended 2026-09-27 (3): STEP, LEVEL and the Studio's hidden measuring frame are RETIRED by owner ruling — a venue (and any `scale-*`) is a fixed setting, like desktop zoom, so every slide renders at it; a slide too full for it clips and is named by `lint:deck`, the Studio's ring and clip notice (one-click Split or a smaller venue) and the export's OVERFLOW line. The Studio gains a Venue menu and a Present venue switch.
builds-on: 2026-06-22-the-fit-spine.md, 2026-07-28-capacity-basis.md, 2026-07-29-autosplit-is-not-a-toggle.md, 2026-09-07-overflow-guards-trim.md
---

# The projection font scale must not clip a slide

**Status:** shipped, then partly RETIRED (Amendment 2026-09-27 (3): STEP and LEVEL are deleted) · **Owner:** Sharmarke · **Code:** ~~`lib/core/scale-fit.js`~~ (deleted),
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

## Amendment 2026-09-27 — a budget per venue for every component, in its manifest

**The owner's direction.** Type size is set by the venue, one size per deck, and each
component has a budget per venue. An author (or an agent) should pick a component that fits
the room BEFORE writing, instead of trimming after the export's `↓ SCALE` line complains. The
agentic-practices talk needs 15 pages trimmed for `huddle` because nobody could see the
budget while writing.

**Where the numbers were.** `SCALE_CAPACITY` in `lib/authoring/lint-core.js`: 16 components
and the `code` pane, hard-coded in the linter. 26 of 70 manifests carried a `capacity` block
and 17 of 71 docs printed an "At a projection scale" line. An agent reading the pick list saw
no venue numbers at all.

**The decision (taken, reversible).**

- Each manifest carries `venueCapacity` (`lib/components/manifest.schema.json`), in one of
  three shapes: `byWords` — the element count at each venue (`laptop` / `huddle` /
  `conference` / `hall`), at each element length it was measured at (6 words, and the
  component's `density.soft`); `lines` — the `code` pane's line count, bare and under an
  eyebrow; or `none` — one sentence saying why there is no count budget. **All 71 manifests
  carry one**, pinned by `test/unit/components/venue-capacity.test.js`.
- `tools/build-stage-catalog.js` bakes the rows into
  `lib/authoring/venue-capacity.generated.js` (the `pane-lint.generated.js` pattern), and
  lint-core reads that file as `SCALE_CAPACITY` / `CODE_LINES_AT_SCALE`. The Studio's live
  lint loads the same module, so it needs no vocab handoff. `build:check` fails a stale file.
- `tools/lib/venue-capacity.js` formats the budget for the two reading surfaces: a
  "**By venue**" line in every component's `.docs.md` (replacing "At a projection scale"),
  and a `by venue` column in `dist/docs/components.pick.md`. `components.json` carries the
  block as is.
- `atLeast` marks a venue where the rig never saw the component overflow, so the number is
  the most it tried (kanban and timeline-list at laptop; roadmap at laptop and huddle). The
  docs print it as `12+`.

**What `none` covers, and why each is honest.** 39 components: charts scale their marks to
the box instead of clipping (20, with `flowchart`), a bookend or single statement has nothing to count (6),
media fills its box (3), `diagram` is scaled whole by Mermaid, the connect cards are fixed
fields (2), `content`, `citation-card`, `logo-wall` and `math` for the reasons
`tools/lib/calibrate-core.js` `NOT_COUNT_CALIBRATABLE` already gave, and a `redline` is one
clause's prose. Two are gaps, and say so: `compare-code` and `obligation-matrix` are not measured per venue yet.

**Calibration, and the bug it found.** The rig (`tools/calibrate-capacity.js`) had silently
stopped measuring past the first rung. #2390 turned the `↓ SCALE` report into two lines, with
the pages to trim on the second; the rig read only the first, so every ceiling at scale-xl
and scale-2xl came back equal to the scale-l one (agenda at 10 words: 5 at conference, truly
3). The rig also read the SCALE block's "(the OVERFLOW line reports them)" as the OVERFLOW
line. Both are fixed in `parseProbeLog`, which `test/unit/tools/calibrate-core-parse.test.js`
feeds the report `scaleLevelReport` itself prints. Re-measured with the fix, all 16 old rows
reproduce exactly, and so does the code pane; the one difference was premise at 6 words and
laptop, which the old run had capped at `--max 9` (now 13). The rig gained builders for
`table`, `cycle`, `policy-recommendation`, `kanban` and `roadmap`, so every component with a
`capacity` block now has a measured row: 32 measured, 39 `none`.

**Lint, before and after.** Every component gallery plus the baseline gallery, linted at each
venue with `main`'s linter and this one on the same source: all 412 existing findings are
identical, and 10 are new, all `policy-recommendation` at conference and hall (three
20-word reasons; the component holds 2 there). Rendered at the venue, the engine agrees: the
slide holds the deck to 1x at every venue from huddle up, so lint under-warns at huddle,
which is the direction a count budget is allowed to err. The rig's element lengths are the
ones lint counts: `kanban`'s builder writes two cards of `w` words per lane, and lint counts
the whole lane (2w + 3 words), so its rows are keyed 15 and 19, not 6 and 8. Keyed by card
length, the first cut warned on a four-lane gallery slide at huddle that fits.

**The published number never exceeds `capacity.hard`.** A venue row is the geometric
ceiling, and `split-compare` measures 4 side by side at laptop while its design holds 2;
`capacity-overflow` enforces `hard` in every room. So the docs line and the pick column print
`min(measured, hard)` (`tools/lib/venue-capacity.js` `hardCap`), and say so when it binds. The
manifest keeps the measured number, which lint reads.

**Found on the way, not fixed here.** At the designed size the new `cycle` builder measures
a ceiling of 5 stages of 12 words against a declared `hard` of 6 — the same shape as the seven
in `followups.d/2378-p3-capacity-hard-above-measured.md`, where it is now recorded.

## Amendment 2026-09-27 (2) — one type size across modifiers

**The rule.** One size per deck holds only if nothing on a single slide changes a type role's
size. So: **a per-slide class may change spacing, chrome and color; it may not change the size
of a type role** — with one carve-out: the explicit magnitude ask (`scale-*`, `venue-*`) can be written on a
single slide, and then that slide is its own size (the owner chose a lint warning, below).
Concretely, for engine CSS:

- **A role token** (`--fs-*`, and `--venue-meta-lift`, the label lift) is declared only on
  `:root` / `section` in a `*.tokens.css` file or by a venue / scale rung (`section.venue-*`, `section.scale-*`) — the
  deck-level classes whose whole job is the size.
- **A cross-component modifier** — `compact`, `claim-*`, `accent`, a mood, a tone, a state
  stamp, any token in a `MODIFIER_GROUPS` group except `aliases` — sets no type size on a
  slide's content: no `font-size`, no `font`, no custom property named as a size or aliasing a
  role. Pseudo-elements (the state stamps, a drawn mark) are chrome and are exempt.
- **A component's own variant may assign its elements to roles.** `list.principles` sets its
  rows in `--fs-emphasis`, `divider.light` sets its heading in `--fs-h2`: that is a different
  layout of the component, and each role it picks still has one size per deck. The dense-cell
  step (`--fs-body-compact` in tables, ledgers and glossary cells) is a role, not a modifier,
  for the same reason.

Gated by `checkTypeSizeModifiers` in `tools/check-ownership.js` (via `build:check`), budget 0,
with `SANCTIONED_TYPE_SIZE_MODIFIERS`: each entry carries its reason, and a stale one fails.

**The audit** (every `font-size` / `font` / role-token declaration in `lib/**/*.css` under a
modifier or variant class: 245, measured by a postcss walk over the tree):

| Class | What it changes | Verdict |
|---|---|---|
| `venue-huddle` / `-conference` / `-hall`, `scale-l` / `-xl` / `-2xl` | `--fs-scale` (and the label lift) | The rung itself, exempt. Deck-wide when set in front matter; but a spot `_class: scale-xl` (or `venue-*`) on ONE slide is a documented directive, and that slide then differs in size from its neighbors — put to the owner |
| `claim-quiet`, `claim-hero`, `claim-bleed` | Frame insets (`--frame-x/y`, `--footer-reserve`) and which chrome shows | Clean: spacing and chrome only |
| `compact` (universal) | The `--sp-*` spacing scale only | Clean |
| `cards-stack.compact` | Card and nested-item text from `--fs-body` to `--fs-body-compact` | **Violated**: a per-slide shrink. Removed (owner's ruling, below) |
| `q-and-a.compact` | Questions `--fs-message` → `--fs-body`, answers `--fs-body` → `--fs-body-compact`, index numeral re-based to `--fs-body`; gaps close | **Violated**, mostly a size change. The size change removed; the gaps still close (owner's ruling, below) |
| `kanban` under `.dark` | `.kanban-size` at `--fs-meta` | Size-neutral: one rule shared with the bare selector. Sanctioned |
| State stamps (`confidential`, `draft`, `stamp-*`, …) | `::before` label size | Chrome (pseudo-element): exempt |
| `numbered` on `divider` | The `::after` numeral | Chrome: exempt |
| `note-warn` | The size of the drawn warning mark (`::after`) | Chrome: exempt |
| `no-note` | Nothing: it only switches the note register off (`:not(.no-note)`) | Clean |
| List variants (`takeaway`, `principles`, `numbered`, `lettered`, `roman`, `bullet`) | Rows to `--fs-emphasis` (principles), the gloss to `--fs-body` (takeaway) — both a step UP from the default, never down | Component variant: allowed |
| Other component variants (178 declarations: kpi, timeline, spotlight, math, …) | Each assigns its elements to roles, or sizes chart and math glyphs in its own units | Component variant: allowed by this rule; out of scope |

**What dropping the two `compact` shrinks costs, measured.** Every `cards-stack compact` and
`q-and-a compact` slide in the tree (78: 71 generated "When NOT to reach for X" gallery slides,
4 `cards-stack compact` slides in `examples/`, and 3 `q-and-a compact` slides) rendered with the
shrink removed by a deck-local override: **22 clip** (19 gallery anti-pattern slides, 1 example
slide, 2 q-and-a slides), against 0 today. So the fix could not ship alone (#18).

**The owner's ruling (2026-09-27): "we shouldn't shrink text, but we should shrink things like
padding."** Both shrinks are gone, and `compact` on those two components now changes spacing
only, as it does everywhere else. The fallout, fixed in the same change:

- **The gallery generator** (`tools/build-component-docs.js` `antiPatternPages`) packs the
  anti-patterns onto as many `cards-stack` slides as fit at body size: greedy, in order, a new
  slide past 100 words (title + body) or three cards. Measured over every component's
  anti-patterns at a wide @size: 100 words clips 0 of 107 slides, 110 clips 2, 130 clips 6. 35
  of the 70 galleries that have anti-patterns now carry the anti-patterns on two or three slides (footer "· 1 of 2"). The
  slide also drops `cards-stretch` for the register default, which sizes each card to its
  text: stretch was there to hide an overrun that no longer happens, and on a paged slide it
  blew a lone card up to fill the stage. Re-measured with the default: 0 of 107 clip; and again
  at head, after #2385 added `flowchart`: 0 of 108 (35 galleries on one slide, 32 on two, 3 on
  three).
- **`q-and-a`'s budget** is re-measured without the shrink: bare, 4 pairs fit (short or long
  answers); with `compact`'s spacing, 5; 6 clips. `capacity` goes from sweet 4 / soft 5 /
  hard 6 to sweet 4 / soft 5 / hard 5, and its stress slide shows five pairs.
- **Two hand slides:** `examples/matrix-grid-rendering-jank.md`'s four long cards split into two
  slides of two, and `examples/q-and-a.md`'s five-pair `compact` slide drops its eyebrow and
  shortens its answers so five pairs still fit.

**The spot `scale-*` carve-out** (shipped 2026-09-27 as lint-core `spot-scale`: a `warning` for a spot `venue-*`, `info` for a spot `scale-*`, whose only corpus use is the ladder specimen `examples/font-scale.md`) was recorded as a follow-up: the
owner chose a `lint:deck` warning when a slide asks for a scale the deck does not.

**The dense-cell step** (`--fs-body-compact` for table, glossary and ledger cells) the owner
reads as the same kind of shrink: the venue sets the size, the budget says how much to write,
and an author who wants more room picks a smaller venue. Retiring it changes one of the twelve
typography roles (HARD RULE #4) on every table-bearing slide, so it is measured and put to the
owner as its own change rather than folded in here (`followups.d/2361-p2-retire-dense-cell-step.md`).

**What the render shows.** `cards-grid.gallery.md` at `venue: huddle` renders all 11 pages
at 1.15x (no `↓ SCALE` line): headings, running header and page numbers one size. Page 10 —
the generated `cards-stack compact` anti-pattern slide — is the one page whose body text is
visibly smaller than its neighbors', which was the `cards-stack compact` shrink. `list-steps` at
huddle levels all 20 slides to 1x ("for 1.15x, trim page 3"). This change moves no engine
CSS; the owner's ruling above then removed the page-10 shrink.

## Amendment 2026-09-27 (3) — a venue is a fixed size; STEP and LEVEL are retired

**The ruling (owner, on PR #2399).** A venue is an intentional setting, like desktop zoom. The
deck must never shrink itself to fit. Display detection is out: a browser sees the screen, not
the room. When a slide does not fit, the answer is **warn, plus a one-click fix**.

**Why the automatic step-down went.** It was not deterministic — under LEVEL one added line could
move every slide in the deck to another size — and it was expensive where authors work. Measured
on the real Studio before this change (81-slide talk, `venue: hall`, desktop Chromium): each
whole-deck measure was about 1.3 s of main-thread long tasks and about 11 MB of heap; typing
queued one measure per key (48 keys → 30–48 measures, 32–52 s blocked); and every slide change
in the preview painted the requested size for 30–150 ms before dropping (18 of 18). Fixes for
the last two were written and deliberately not shipped (`0d04238`, `1a8de05`), because this
retirement deletes the code they lived in.

**What changed.**

| Before | After |
|---|---|
| `lib/core/scale-fit.js` STEP + LEVEL, injected into the export pass, the exported `.html` watcher and the live runtime | Deleted. Every surface renders the scale the deck asks for. |
| The export's `↓ SCALE` report; `data-lattice-scale-step` / `-fit` / `-cap` | Gone. The `⚠ OVERFLOW` line names every clipped page. |
| `docs/src/lib/scale-cap.ts`: a hidden whole-deck frame in the Studio, re-measured behind edits | Deleted. Nothing measures the whole deck. |
| `capacity-scale`: "every slide renders at a smaller size" | "the deck renders every slide at 1.3x and never shrinks one to fit, so it is clipped". Fix: keep N, split, or the LARGEST smaller venue whose budget holds the slide (never one that still clips). `warning` under `venue:`, `info` for a bare `scale-*` (its budget misjudges committed decks that render whole — P2 follow-up). |
| — | Studio: **Look → Venue** menu (Default / Laptop / Huddle / Conference / Hall) writes `venue:`. |
| — | Present: a **venue switch** re-renders this showing at another room size; the deck is not edited. |
| — | Studio: a **clip notice** under the preview when the shown slide clips at a venue above laptop, with **Split slide** (halves the main list or table; undoable) and **Use <venue>** (the venue lint names; hidden when lint says no venue would fit). |
| — | `orderedListStart` (markdown-it kernel): an `<ol start="4">` sets `--lat-split-offset: 3`, so a continued list keeps STEP 04 in every counter layout. |

`fit:` stays: `report` / `heal` / `trim` still govern SPLIT and TRIM; none of them changes the type
size. Rules 1–7 of STEP and LEVEL above are history.

**Verified.**

- The agentic-practices talk (74 slides) exported at each venue: every section of the exported
  `.html` computes `--fs-scale` 1 / 1.15 / 1.3 / 1.5 — 74 of 74 at each — with no step attribute;
  the OVERFLOW line names 0 / 17 / 31 / 47 pages, matching the ringed sections one for one.
- Studio typing probe (the same talk, 48 keys typed at the deck's end, desktop Chromium, built
  site): 2,723 ms at `venue: hall` vs 2,748 ms with no venue; 0 measuring frames created.
- `docs/e2e/venue-fixed-size.spec.ts` on the real Studio: every slide at 1.3x in the preview and
  in Present, the over-full slide ringed with the notice, Split and Use Huddle working, the menu
  writing `venue:`, the Present switch at 1.5x without editing the deck, and the lint tooltip.

**Known gaps, recorded not fixed here.** The clip notice reads the deck's `venue:` only, so a bare
`class: scale-*` deck or a slide's own `_class: venue-*` gets the ring without the notice. For the same reason the Present venue switch and the Venue menu set `venue:` only: a deck that also carries `class: scale-*` renders at that class, which the CSS declares after the venue rungs, whatever the switch says. A
figure that fits itself to its box (a flowchart, a chart) shrinks its own text at a venue rather
than clipping, so it is reported by the TYPE FLOOR check, not the ring.


## Amendment 2026-09-27 (4) — the venue budget reads the slide a real deck writes

With the step-down retired, `capacity-scale` is the early warning for a clip, so it has to be
right on real decks. Scored against the export's OVERFLOW list on the 74-slide talk (a venue now
clips exactly the slides that do not fit, so that list is the ground truth), it was not: every
false warning was a `list takeaway` slide judged by the bare `list` row, and most misses ended in a
callout the bare rows never measured. Three changes, all in
`lib/authoring/lint-core.js` `scaleCapacityFor` and the manifests' `venueCapacity`:

- **Interpolate between measured word lengths** (floored). A 10-word item used to be judged as a
  14-word one.
- **A variant can carry its own row** (`venueCapacity.variants`). `list takeaway` holds
  9+ / 9+ / 8 / 3 at 10 words where bare `list` holds 6 / 5 / 3 / 2. Measured with the rig's new
  `--variant` flag.
- **A callout costs its measured height** (`venueCapacity.insight`, measured with `--insight`):
  a slide ending in a `> …` blockquote (the key-insight block; an `insight-*` class only relabels
  it) pays the bare row minus the callout row, per rung, on whichever row it uses. `list-steps`,
  `cycle`, `cards-grid` and `list` carry one. The message names the row it quotes
  ("'list takeaway'", "'list-steps with its callout'").

- **A component with a venue row and no `capacity` block** (`compare-prose`, `matrix-2x2`, …)
  now reaches `capacity-scale`, and only that rule. It never claims a clip at the designed size:
  it has no count budget to stand behind one, and its rows are the rig's shape rather than the
  author's. `compare-prose` carries a `vertical` row and a `vertical` row with its callout.
  This closes the hall label-lift follow-up: the talk's six pages that clip at hall only because
  the lift raises the labels (4, 6, 27, 45, 47, 57) are all named at hall, and the owner's
  ruling (keep the lift, warn) holds.

| venue | before: right / false / missed | after |
|---|---|---|
| huddle (17 clip) | 9 / 10 / 8 | 16 / 3 / 1 |
| conference (31 clip) | 18 / 6 / 13 | 25 / 4 / 6 |
| hall (47 clip) | 29 / 4 / 18 | 38 / 1 / 9 |

No finding claims a clip at the designed size on the talk any more (it made 10 per venue). Still
off: components with no venue row at all (`roadmap`, `diagram`, `divider`, a mermaid slide), and
a few `list takeaway` / `glossary` slides whose rows run pessimistic. Both stay in
`followups.d/2361-p2-venue-lint-accuracy-on-real-decks.md`.

**Compact rows (follow-up, 2026-09-27).** `q-and-a` and `cards-stack` now carry a
`venueCapacity.variants.compact` row, measured with `calibrate-capacity --variant compact` at the
designed size and each rung: `q-and-a` 5 / 4 / 4 / 3 at 6 and 12 words; `cards-stack` 5 / 4 / 4 / 3
at 6 words and 5 / 4 / 2 / 2 at 16. `scaleCapacityFor` already reads a variant row when the slide
carries the token, so only the rows were missing: a five-pair `q-and-a compact` slide at huddle is
judged against 4 rather than the bare 3. The docs line caps a compact row at `withCompact.hard`,
the number lint judges a compact slide by (`cards-stack` has none, so its row stays capped at 4).

**Callout rows (follow-up, 2026-09-27).** Two rows a trailing callout needed. `list takeaway`
measured with its callout (`variants.takeaway.insight`: 4 / 3 / 3 / 2 at 14 words), because the
bare `list` pair charges nothing at hall. The `code` pane with a callout (`lines.insight`
11 / 9 / 8 / 7, `lines.eyebrowInsight` 10 / 8 / 7 / 5), read when the slide ends in a `> …`
blockquote; its "clipped at any size" claim stays on the row without the callout, the number the
designed-size code rules enforce. Talk, right / false / missed: conference 26 / 4 / 5, hall
40 / 1 / 7; huddle unchanged. A fill model (each element at its own length) was tried and reverted,
with its numbers in the follow-up: the error is in counting words where the box counts lines.

**`--fs-body-compact` stays (owner, 2026-09-27).** The question was whether the smaller size for
table, glossary and ledger cells (and code) should go, as `compact`'s shrink did. Measured by
pinning it to `--fs-body` with a deck-local `section { --fs-body-compact: var(--fs-body)
!important; }` in the calibration rig: gallery clips 2 → 13 pages, and per venue
(laptop / huddle / conference / hall) table rows 11/10/9/8 → 10/8/8/3, glossary 10/9/4/4 →
9/4/4/3, list-tabular 7/6/6/5 → 6/6/5/3, obligation-matrix 7/6/6/5 → 6/6/5/4, team-profile
6/3/3/3 → 3/3/3/3, code lines 15/13/11/10 → 12/11/9/8; pricing unchanged. The rig's baseline runs
reproduced the committed rows exactly. Retiring it would lift the back-row x-height at hall from
about 8.2′ to 10′, and cost a hall table five of its eight rows. The owner kept it: the venue sets
the room size, and an author who wants larger cells writes fewer rows or picks a larger venue.

## Amendment 2026-09-28 (5) — the rig measures the venue, and a claim panel has its own budget

**The rig measured a slide no venue renders.** `tools/calibrate-capacity.js --scale l|xl|2xl`
wrote `class: scale-*` into the probe deck. That class sets the same `--fs-scale` as the venue and
not the venue's meta lift (eyebrows, labels and captions ×1.15 at conference, ×1.3 at hall;
`lib/base/base.modifiers.css`), so every conference and hall row was measured on a smaller slide
than the room gets. Found on a real slide: seven-steps' first `split-panel proof` slide clipped at
`venue: hall` and fit at `class: scale-2xl`. `gradedDeck` (tools/lib/calibrate-core.js) now writes
`venue: huddle|conference|hall` for the three rungs, pinned by a unit test. Huddle has no lift, so
its rows cannot move.

**Every stored row re-measured at conference and hall.** 88 rows, 62 unchanged. Of the 26 that
moved, three are artifacts of the sweep's own flags (`kanban`'s rows are keyed by LANE length and
`timeline-list`'s 6-word row by a longer card, so `--words` does not reproduce them); they stay as
stored. A control run on the old rig showed `compare-prose` at 6 words and both `decision` rows had
also drifted with the engine since they were measured, lift or no lift. Each of the other 23 lowers
its conference or hall number, and 21 are applied (the largest drops: `timeline-list` at 16 words,
hall 4 → 0, confirmed by render — one 16-word item clips at hall; and `roadmap`, hall 9 → 6). Two
are NOT applied, because each produced a false warning on a real deck that renders clean:
`compare-prose vertical` at 20 words (conference 2 → 1; the talk's slide 44 holds 2) and `actors`
at 12 words (conference 6 → 3; gallery slide 68 holds 4). The rig's filler words run long, so a
row measured near a line break reads pessimistic; both stay as stored until a line model (below)
can judge them. A row of 0 now reads "holds not one item", and its fix says to shorten each one.

**A claim panel is a box of its own.** On `split-panel proof` the slide clips in its 31% claim
panel, not its list: rendered at hall, a shorter heading or a shorter lede un-clips the real slide,
and shorter points do not. So `split-panel` carries `venueCapacity.panel`: the most lede words the
panel holds under a heading of 3, 6, 9 and 12 words, per venue, for the bare component and for
`proof` and `capstone` (measured separately; the two rows come out identical, as the shared panel
predicts). `calibrate-capacity split-panel --panel [--variant proof] [--scale …]` measures it with an
eyebrow and the component's usual points beside it. The panel rows use plain English prose rather
than the count rows' filler: that filler averages 7.2 characters a word with its space, and the
shipped decks' ledes 5.1. Measured with the filler, the rows read 20–30% low and warned on four
real slides that fit. `panel.tried` (80) is the most lede words the rig wrote, so a row at it is a
floor and prints with a `+`.

`lint-core` `panelOver` reads the slide's first heading outside a code fence and the paragraph under
it (image lines skipped). Past the longest measured heading the row keeps falling along its last
measured slope instead of holding flat. A slide past the row gets a `capacity-scale` finding that
names the panel, reported beside a count finding rather than hidden by it; when even the laptop row
is short, the fix does not offer a smaller room. The variants whose panel features something else
(`metric`, `pullquote`, `steps`, `watermark`, `qr`) are not judged by the bare row. The Studio
bundles this rule (its live lint is lint-core, HARD RULE #7): measured as a pair, +668 bytes gz, and
`docs/route-budget.json` moves by the owner's rule.

Scored against the export's `⚠ OVERFLOW` line on five decks (the talk, `gallery.md`, and
bloom / seven-steps / kaizen), each forced to each venue:

| venue | before: right / false / missed | after |
|---|---|---|
| huddle | 25 / 3 / 16 | 25 / 3 / 16 |
| conference | 46 / 8 / 43 | 47 / 8 / 42 |
| hall | 78 / 2 / 68 | 82 / 2 / 64 |

No new false warning. The gain is small, and the next case shows why. **Word and character counts
cannot separate the rest.** At hall, seven-steps' slide 8 (a 47-character heading, a 154-character
lede) clips while slide 10 (50, 160) fits. Rendered LINE counts separate every one: a 3-line heading
leaves room for 7 lede lines and a 2-line heading for 8. Predicting lines from text needs per-glyph
widths in a bundle that already grew 668 bytes here, so that line model is its own piece of work
(`followups.d/2361-p2-venue-lint-accuracy-on-real-decks.md`).
