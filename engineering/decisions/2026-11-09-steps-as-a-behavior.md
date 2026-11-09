---
status: proposed
summary: >
  `_focusSteps` and `_build` are one capability, walking a slide in steps, built two ways and finished neither way.
  `_focusSteps` copies the slide once per step in the Markdown parser, so every surface gets N slides and every reader
  of slide position pays for it; `_build` keeps one slide but nothing walks its steps. Proposed: one slide always; a
  step cursor in the shared Present transport that walks both; one shared step contract (each unit tagged with its
  step, the slide tagged with the current step, CSS draws reveal or spotlight); still formats show the slide at rest;
  one page per step only as an export option. Retires the parse-time copy and the guards it forced.
---

# Steps are a behavior: one slide, walked in place

**Date:** 2026-11-09 · **Asked by:** the owner, after PR #3096 found a `_focusSteps` divider counted as three sections
("why the fuck is the engine turning it into several slides?"; "focus steps is a state management issue and a css
solution"; "yeah, we need to redesign") · **Status:** proposed, no code · **Amends:**
`2026-06-16-focus-highlighting.md` §4 · **Finishes:** `2026-06-16-narrative-step-model.md` §11 increments 2 and 3
(issue #380) · **Follows:** `2026-11-08-dynamic-components.md` §Dynamic behaviors · **Built by:**
`followups.d/3096-p5-focus-steps-as-a-behavior.md`

## What is wrong today

Two directives walk a slide in steps. Both stop half way, in opposite directions.

| | `_focusSteps: row 1 \| row 2 \| row 3` | `_build` / `_build: rows` / `_build: 1, 2-3, 4` |
|---|---|---|
| What a step does | moves a spotlight to the next unit | reveals the next unit |
| Slides in every surface | **one per step**: the parser copies the slide (`focusSteps`, `lib/integrations/markdown-it/plugins.js`) | one |
| Does Present walk the steps? | only because they are separate slides | **no**: nothing sets `data-build-at`, so every unit always shows |
| PDF | one page per step, always | one page, everything shown |
| Breaks page numbers, section counts, narration, preview? | **yes** | no |

The copy was chosen in 2026-06-16 so pagination and the PowerPoint export "need no special casing". The special casing
moved to every reader of slide position instead. Today it lives in:
- `docs/src/lib/rendered-index.ts`
- `lib/diagnostics/slice-equivalence-core.mjs`
- `lib/core/drill-down.js`
- `lib/core/boundary-parser.mjs`
- `docs/src/components/studio/narration-projection.ts`
- the render-cache note, and the #1387 off-by-one.

Now it has reached the section marks too: a `_focusSteps` divider reads as three sections on the divider marker, the
numeral, the rail and the topic eyebrow (`2026-11-08-dynamic-components.md` §The measurement).

A 3-slide source with one three-step table renders as 5 sections in the HTML and 5 PDF pages.

## The rule this follows

From `2026-11-08-dynamic-components.md` §Dynamic behaviors:
1. One source slide is one slide everywhere.
2. Live surfaces run a behavior as state plus CSS.
3. Still formats show one frame.
4. No mark reads a behavior.

## The design

### 1. One step contract for both directives

The engine only tags, and the CSS draws:
- Each unit carries the step it belongs to: `data-step="2"`. A grouped unit carries its group's step.
- The slide carries its count, `data-steps="3"`, and its kind, `data-step-kind="build"` or `"focus"`.
- The live surface sets the current step on the slide, `data-step-at="2"`. Absent, the slide is at rest.
- The CSS reads those attributes:
  - **build:** units with a step greater than `data-step-at` are hidden. They keep their box, so nothing moves.
  - **focus:** the unit whose step equals `data-step-at` gets the focus treatment, and its siblings recede. The
    treatment (`lib/base/base.focus.css`, `_focusStyle`) is unchanged; only its trigger moves from a per-copy
    `.lat-focus` to the step attribute.

`lib/transformers/build.js` already does the build half. Its `data-build-step` / `data-build-steps` / `data-build-at`
become the shared names, or stay as aliases. `lib/transformers/focus.js` gains a steps mode that tags units the same
way, off the same collection walkers (`lib/core/collections.js`). One slide may carry one stepping directive; a slide
with both is a lint error until someone needs them combined.

### 2. One step cursor, in the one transport

Every Present surface already shares one slide-index kernel, `createTransport` in `lib/core/present-transport.mjs`:
- the Studio's `PresentOverlay`;
- the presenter's `stage-window.js`;
- the Playground;
- the exported HTML player, which inlines the kernel's source.

So the cursor goes there, once: `(slide, step)` instead of `slide`.
- **next:** if the current slide has a step after this one, advance the step; otherwise go to the next slide at
  step 0 (at rest, or the first step: see §4).
- **prev:** the mirror image.
- **Jumping to a slide** (number keys, the outline, a link) lands on that slide at rest.

The kernel stays pure: it is handed each slide's step count and never reads the DOM. Each surface sets `data-step-at`
from the cursor, the way it already shows a slide from the index.

### 3. Still formats show the slide at rest

PDF, PowerPoint, PNG, the Studio preview and the thumbnails render the slide with no `data-step-at`:
- a build shows every unit, as today;
- a focus slide shows every unit, nothing receded.

The still is the slide as written, so a printed or emailed deck reads whole.

### 4. One page per step, only when asked

The printed walkthrough, the one real reason for the copy, becomes an export option (`--steps` on the CLI, a toggle
in the Studio's export sheet). The export renders each stepping slide once per step with `data-step-at` set. It does
this AFTER the deck has rendered, so no mark ever sees the extra pages. Every page of one slide keeps that slide's page
number, the way a split's pages read `4.2`. This is increment 3 of the 2026-06-16 step model, now serving both
directives.

### 5. What goes away

- The parse-time copy (`focusSteps` in `plugins.js`).
- The guards it forced in `rendered-index.ts`, `slice-equivalence-core.mjs`, `drill-down.js`, `boundary-parser.mjs`
  and `narration-projection.ts`, each removed or narrowed to the case that remains (`split: headings`).
- The focus-step divider disagreement, with no change to any of the four section counts.

Export to Marp already keeps a `_focusSteps` slide as one slide, with the directive as an inert comment
(`lib/export/marp-fidelity.js`), so it needs no change.

## What changes for an author

- **A `_focusSteps` deck's PDF goes from N pages per stepping slide to one**, unless the export asks for steps. This
  changes exported bytes, so the before and after PDFs of `examples/focus.md`, in dark and light, go to the owner for
  sign-off before it ships.
- **Present now walks both directives.** A `_build` slide starts with its units hidden and reveals them click by click,
  as `examples/build.md` has always promised and never done.
- **Page numbers stop jumping.** A three-step table is one page number, not three.

## Choices for the owner

| | Question | Options | Recommendation |
|---|---|---|---|
| S1 | What a focus slide shows at rest, in print and the preview | (a) nothing highlighted, every unit even; (b) the first step highlighted | **(a).** The still is the slide as written. (b) highlights one row and hides why, and it differs from build, whose rest shows everything |
| S2 | Where Present lands when entering a stepping slide by "next" | (a) at rest, then the first click moves to step 1; (b) straight on step 1 | **(b) for focus, at step 0 for build.** A build's step 0 is "nothing revealed yet", which is the point; a focus slide at rest followed by a click that only adds a highlight wastes a click |
| S3 | The page-per-step export's page numbers | (a) every page keeps the slide's number; (b) `4.1`, `4.2`, `4.3` | **(a).** It is one slide, and the agenda's page references must still land on it |
| S4 | The attribute names | (a) generic `data-step*` with `data-build*` kept as aliases; (b) keep `data-build*` and give focus its own | **(a).** One contract, one walker, one CSS trigger |

## Not decided here

- **Narration per step** (`lattice video` speaking one line per step). Narration stays per slide.
- **A Studio control for steps.** Issue #1765 covers `_focus`, `_focusStyle`, `_focusSteps` and `_build` together, and
  this design is the model it would control.
- **Motion between steps** (increment 4 of the 2026-06-16 model).

## The work, in order

1. **The contract and the cursor** (one PR): step tags on both directives, the CSS, the `(slide, step)` cursor in
   `present-transport.mjs`, every Present surface setting `data-step-at`, and the parse-time copy retired along with
   its guards. Verified by driving Present on each surface, the exported player included (#23). Demo deck (#9):
   `examples/build.md` and `examples/focus.md` updated to walk live.
2. **The page-per-step export** (one PR): the CLI flag and the Studio toggle, with the before and after PDFs to the
   owner.
