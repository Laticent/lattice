---
status: proposed
summary: >
  A diagram slide in the Studio paints its raw ```mermaid source before it paints the
  diagram, and the report that it "didn't use to be that way" is half right. Two mechanisms
  cause it, both older than the report: the runtime hides the fence by writing
  `data-mermaid-state` from a 150ms-DEBOUNCED observer, and nothing hides it before that
  attribute exists; and the Studio's frame signature carries `mermaid` PER SLIDE, so moving
  from a text slide to a diagram slide misses the patch path and REBUILDS THE IFRAME REALM —
  6 of 6 measured — discarding the rendered-SVG cache with it. Both arrive with #1080 (July),
  and before it every render was a full rewrite, so no regressing commit exists; what changed
  is #1614 (2026-08-11), which zeroed the fence's padding so the source now sits flush under
  the title and reads as part of the slide. Measured on the real Studio with a new
  rAF-sampling bench (`docs/scripts/diagram-flash-bench.mjs`): typing one character on a
  diagram slide repaints the raw source for 10 PAINTED FRAMES even unthrottled, with the
  finished SVG in cache the whole time. Seven candidates were priced on that instrument. Two
  results decide it. A faster path shows MORE frames of source, not fewer (a free main thread
  has time to repaint the wrong state), so shortening the window and removing the flash are
  separate fixes. And replaying the cached SVG from the mutation MICROTASK — before the frame
  that write produces — takes every measured arm to zero wrong frames at 15-18ms. Recommended:
  E (same-task replay) + A (withhold the fence's ink, 3 lines of CSS, for the genuinely cold
  render), then D (deck-scope the mermaid flag) as its own change. C (cross-fade) is rejected
  on its own measurement — it leaves the source on screen 50-75% LONGER; F (render in the
  engine) on price — ~700ms idle and ~1.8s busy before anything appears, paid on the Studio's
  own thread; G (anime.js) on 116KB for what one `::before` already does. Nothing is
  implemented: this is the bake-off, awaiting the pick.
---

# The Mermaid fence flashes before the diagram — measured, and seven ways out

**Date:** 2026-09-05 · **Status:** bake-off, awaiting the pick · **Surface:** Studio live preview

A diagram slide in the Studio paints its raw ```mermaid source first, then swaps it
for the diagram. This note reproduces that, measures it, and prices seven candidate
fixes against each other on the same instrument.

Instrument: `docs/scripts/diagram-flash-bench.mjs` — drives the built site at
`/studio/`, types a four-slide deck (text · diagram · text · diagram) into the real
editor, and samples the preview iframe once per `requestAnimationFrame`. A rAF
callback runs immediately before the frame it belongs to composites, so the state
read there *is* what that frame paints. Pictures come from
`Page.startScreencast` over CDP, which hands over the frames the compositor actually
produced (a loop of `page.screenshot` would force paints and report a timeline that
never happened).

---

## 1. What the author sees

Two painted states share the diagram's slot, and the wrong one goes first:

| | what fills the slot | where it sits |
|---|---|---|
| before | the fence's source text, ~13px mono | flush left, directly under the title |
| after | the rendered SVG | centered, filling the slot |

Since #1614 (2026-08-11) the un-rendered `<pre>` carries **zero padding**, so the
source text now shares its left edge with the slide's title and dek. That is why it
reads as *part of the slide* rather than as an indented code block — and it is the
one dated change that alters how this flash reads. It did not create it.

## 2. Where the window comes from

Two independent mechanisms, both older than the reported change:

**The runtime tags the fence on a 150ms debounce.** `lib/runtime/index.js` hides the
`<pre>` through CSS keyed on `data-mermaid-state`, and nothing hides it *before* that
attribute exists. The attribute is written by `wrapFences()`, which the
MutationObserver reaches through `scheduleRun()` — `DEBOUNCE_MS = 150`. Every
re-render of a diagram slide therefore repaints the raw source for at least 150ms,
even when the rendered SVG is already in the runtime's own cache.

**The Studio's frame signature carries `mermaid` per SLIDE.**
`StudioShell.tsx` passes `mermaid={hasMermaid(slide)}` and
`docs/src/lib/single-slide-render.ts` folds that flag into the signature that decides
patch-vs-rewrite. So a text slide and a diagram slide never share a signature:
**every navigation across that boundary tears down the iframe realm and rebuilds it**
— re-parsing ~560KB of CSS, re-executing the 529KB runtime and the 3.16MB Mermaid
bundle, and discarding `mermaidSvgCache` with the realm it lived in. Measured: 6 of 6
such navigations were full rewrites, and a revisit costs the same as a first visit.

Neither is new. The patch fast path, the signature's `mermaid` term, and the 150ms
debounce all arrive together in #1080 (2026-07-19), and before it *every* render was
a full rewrite — so the flash predates the machinery that was supposed to remove it.
No single regressing commit was found; what changed on 2026-08-11 is how the flashed
frame is typeset, not whether it happens.

## 3. Baseline — what it costs today

Chromium, built site, median of 3 runs. "raw-source frames" counts frames the
compositor produced with the fence's ink on screen; `--cpu N` throttles through CDP,
because a race measured only on an idle machine is measured at its most flattering.

| scenario | CPU | raw-source frames | time to diagram | realm rewrites |
|---|---|---|---|---|
| navigate text → diagram, first visit | ×4 | **4** | 448ms | 2/2 |
| navigate text → diagram, revisit | ×4 | **4** | 368ms | 4/4 |
| navigate diagram → diagram | ×4 | **10** | 171ms | 1/4 |
| **typing on a diagram slide** | ×1 | **10** | 156–165ms | 0 |
| **typing on a diagram slide** | ×4 | **10** | 172ms | 0 |

Two things this table says that the report did not:

- **Typing is the worst case, and it happens on an idle machine.** Every keystroke on
  a diagram slide blinks the diagram back to source for ~160ms — the debounce,
  deterministically — with the finished SVG sitting in cache the whole time.
- **A faster path shows MORE frames of source, not fewer.** Diagram → diagram is
  twice as fast to the diagram (171ms) and paints 2.5× more source frames, because a
  free main thread has time to paint the wrong state repeatedly. Shortening the window
  is not the same as removing the flash; they are separate fixes.

Layout shift is 0 in every arm: `mermaid.css` already sizes the un-rendered `<pre>`
to the rendered slot. The "jump" is a *content* swap — small top-left text becoming a
large centered figure — not a reflow.

## 4. The candidates

Each measured on the same instrument, at ×4 CPU, medians. CSS candidates were injected
into the preview frame at document-start (the same moment a rule shipped in
`lattice.css` would apply); cascade position differs from shipping, so the winner is
re-measured from a real build before it lands.

### A — withhold the fence's ink until it is tagged  (3 lines of CSS)

`visibility:hidden` on the `<code>` of an untagged mermaid fence. The `<pre>` keeps
its box, so the slot stays reserved and nothing moves.

| | raw-source | slot state | time to diagram |
|---|---|---|---|
| navigate, revisit | **0** | 4 frames empty | 367ms |
| typing | **0** | 10 frames empty | 181ms |

**Pro** — the smallest possible change; kills the flash outright; zero layout shift;
works before any JavaScript runs, including during the realm rewrite.
**Con** — it converts the flash into a *blank*: on a keystroke the diagram vanishes
and returns 160ms later, which reads as a blink rather than a glitch but is still
motion. And if the runtime never loads (JS blocked, a CSP that stops the script) a
diagram slide shows nothing where it used to show its source.

### B — A, plus a drawn placeholder in the reserved slot  (~20 lines of CSS)

Three node boxes and the rules between them, in `--diagram-stroke`, breathing on a
1.6s cycle, silent under `prefers-reduced-motion`.

| | raw-source | slot state | time to diagram |
|---|---|---|---|
| navigate, first visit | **0** | 5 frames skeleton | 454ms |
| navigate, revisit | **0** | 4 frames skeleton | 366ms |

**Pro** — everything A gives, and the empty slot now says "a diagram is coming"
instead of "something is broken"; costs nothing (no library, no JS, one `::before`).
**Con** — on a keystroke it is a *pulsing* blink rather than a quiet one, which is
worse for the case that hurts most; and a placeholder that appears for four frames is
its own kind of noise. Pairs badly with C-class fixes that already remove the wait.

### C — keep the fence and cross-fade it into the diagram  (~15 lines of CSS)

Stack the SVG over the `<pre>` in the same slot and dissolve between them over 240ms.

| | raw-source | time to diagram |
|---|---|---|
| navigate, first visit | **7** (was 4) | 488ms |
| navigate, revisit | **6** (was 4) | 356ms |

**Pro** — nothing on the slide ever moves abruptly; the transition reads as
deliberate.
**Con** — **it makes the measured complaint worse, by design.** Softening the swap
means the source is on screen 50–75% *longer*, and the thing the report objects to is
seeing the source at all. It also needs the SVG absolutely positioned over the `<pre>`,
which puts a `position:absolute` into the diagram slot that the Fit spine and the
overflow probe both measure. Measured and rejected, not dismissed.

### D — give the frame signature a DECK-scoped mermaid flag  (1 line in the Studio)

`hasMermaid(editorSample)` instead of `hasMermaid(slide)`, so moving onto a diagram
slide patches the resident document instead of rebuilding the realm.

| | raw-source | time to diagram | rewrites |
|---|---|---|---|
| navigate, revisit | 10 (was 4) | **175ms** (was 368ms) | **0/6** (was 6/6) |

**Pro** — halves time-to-diagram, ends the realm churn, and keeps the runtime's SVG
cache alive across navigation — which is what makes E possible at all.
**Con** — on its own it makes the flash *look worse* (10 painted source frames
instead of 4, per §3), and it injects the 3.16MB Mermaid bundle into every full write
of any deck that contains a diagram anywhere, including its text slides.

### E — replay the cached SVG in the SAME TASK as the swap  (~30 lines in the runtime)

A MutationObserver callback is a microtask: it runs after the parent's `innerHTML`
write and *before* the frame that write produces. Doing the cache lookup there means
the first painted frame of the new slide already carries the diagram.

| | raw-source | blank | time to diagram |
|---|---|---|---|
| typing (with the SVG cached) | **0** | **0** | **18ms** |
| navigate, revisit (with D) | **0** | **0** | **15ms** |
| navigate, first visit | 10 | 0 | 367ms |

**Pro** — the only candidate that removes the transition rather than restyling it:
on a revisit and on every keystroke the diagram never leaves the screen. Needs D to
help *navigation* (without it the cache dies with the realm each time); helps typing
on its own.
**Con** — does nothing for a genuinely cold diagram, which is why it wants A or B
beside it. The replay must key on the palette scope exactly as the runtime's cache
does, or a theme change replays a stale-colored SVG — the prototype keyed on source
text alone and would have.

### F — render the diagram in the engine, ship the slide with its SVG

Measured cost of the diagram itself, in a real page:

| | CPU ×1 | CPU ×4 |
|---|---|---|
| load + parse + execute Mermaid (3.16MB, warm HTTP cache) | 630ms | 1487ms |
| `mermaid.render()`, 5-node flowchart, first | 85ms | 290ms |
| `mermaid.render()`, same source again | 33ms | 152ms |

**Pro** — one render path for preview and export; no swap to hide because there is
nothing to swap.
**Con** — the whole slide waits on the diagram: **~700ms on an idle machine and up to
~1.8s on a loaded one** before *anything* appears, on the first diagram of a session.
And the render would run on the Studio's own thread, so it is the typing loop that
pays it, not the preview. This is the trade the report already names, priced.

### G — an anime.js placeholder

**Rejected before measurement, on cost.** anime.js is 116KB minified and is not in
the preview frame today (Anima loads it lazily, for figures). The placeholder in B is
one `::before` and one `@keyframes` — a library buys nothing here, and a JS-driven
animation in the frame competes for the same main thread that is late tagging the
fence.

## 5. Recommendation

**E + A, then D.** In that order, and they are one change each:

1. **E** removes the flash where the author actually lives — every keystroke on a
   diagram slide, every revisit. 0 frames, 18ms, nothing moves.
2. **A** covers what E cannot: the first, genuinely uncached render. Three lines.
3. **D** halves time-to-first-diagram and stops the realm churn, which is also what
   lets E cover navigation. It is the one with a real cost to weigh (the bundle on
   text slides of a diagram deck) and it belongs in its own change.

Stacked, measured: first visit **0** source frames / 388ms; revisit and keystroke
**0** source frames, **0** blank frames, **15–18ms**.

C is rejected on its own measurement; F is rejected on the 700ms–1.8s it charges the
slide; G is rejected on 116KB for what CSS does for free.

## 6. What is not yet verified

- The CSS candidates were injected into the frame, not shipped in `lattice.css`;
  cascade position differs. Re-measure the winner from a real build.
- One machine, Chromium only, one deck, 3–4 runs per arm. The numbers are medians,
  not a distribution.
- Candidate B was not measured under the typing scenario; it differs from A only in
  what fills the reserved slot, so its source-frame count is A's by construction —
  but that is an argument, not a measurement.
- A's failure mode with the runtime absent (JS blocked / a CSP that stops the script)
  was reasoned about, not driven.
