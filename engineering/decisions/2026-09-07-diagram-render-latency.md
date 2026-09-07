---
status: shipped
summary: >
  Editing a Mermaid fence took 209ms to redraw, and 150ms of that was a timer. The fixed
  debounce in front of every diagram render was larger than a FULL RENDER for any diagram up
  to about 64 nodes — measured 22ms at 4 nodes, 43 at 16, 72 at 32, 130 at 64, 239 at 128 —
  so it was waiting, not coalescing. It is replaced by coalescing on COMPLETION: at most one
  diagram run in flight, and if the source moved while it ran, another starts immediately
  with the latest text. That adapts to the diagram instead of guessing at it, which no
  constant can do: a small graph streams at render speed while a 128-node one self-throttles
  to one render per render rather than queueing one per keystroke. A keystroke inside a fence
  goes 209ms -> ~60ms and arriving at a cold diagram slide 240ms -> ~99ms, with 0 blank
  frames, 0 layout shift and 0 wrong ink on every arm. Removing the timer alone would have
  made things worse in one place, and the two halves ship together: a diagram that does not
  parse WHILE THE AUTHOR IS TYPING is a half-written diagram, not an error, and clearing the
  slot for it on every keystroke painted 155 frames of raw source where the timer painted 97.
  So `mermaid.parse` gates the render — ~1.8ms to reject against 22-239ms to draw, at a flat
  ~14% tax on every SUCCESSFUL render because Mermaid re-parses inside `render` — and a fence
  that fails it keeps its previous drawing until 450ms of quiet, when the error surfaces for
  real. The gate needed a FOURTH `data-mermaid-state`, and that is the whole mechanism rather
  than a detail: its first version parked deferred fences in `pending`, which is the state the
  walk SELECTS, so every pass re-took the fence, failed the gate, deferred again and re-armed
  the quiet timer roughly every 16ms. The timer measures whether the author has stopped
  typing; the deferral itself was what stopped it elapsing, and the fence showed stale ink
  indefinitely with all 9,158 tests green. Three hypotheses missed it and an instrumented
  trace found it in one run.
---

# The 150ms in front of every diagram was the wait

## 1. What the number actually was

The report was that editing a diagram is "absolute dog shit" at 1141ms. That number was the
bench's fault, not the engine's: `edit-burst` measures from the FIRST keystroke of an
eight-character burst, so ~840ms of it is the author still typing. The felt latency — last
keystroke to redrawn diagram — was **209ms**.

Which is still too slow, and the decomposition says why:

| | |
|---|---|
| `DEBOUNCE_MS` | **150ms** |
| `mermaid.render`, 4-node flowchart | ~22ms |
| engine + sanitize + patch + fit + rAF | ~37ms |

**72% of the wait was a timer.** The patch path itself was never the problem — it is ~2ms
(`RenderSample.writePath`), which is why "the slide is re-rendered on every keystroke" is
the wrong suspect.

## 2. Why no constant is right

Render cost against diagram size, measured against our vendored Mermaid v11, medians of 5:

| flowchart | render | | sequence | render |
|---|---|---|---|---|
| 4 nodes | 22ms | | 4 messages | 21ms |
| 8 nodes | 26ms | | 16 messages | 27ms |
| 16 nodes | 43ms | | 40 messages | 43ms |
| 32 nodes | 72ms | | | |
| 64 nodes | 130ms | | | |
| 128 nodes | 239ms | | | |

A 150ms timer is **larger than a full render** up to about 64 nodes. Any fixed value is
wrong at one end or the other: small enough to be invisible on a four-node diagram is large
enough to queue eight renders behind a burst on a large one, and vice versa.

**Coalescing on completion has no constant to get wrong.** At most one run is in flight; if
the source moved while it ran, the next starts the moment it lands, reading the DOM as it is
then rather than as it was when the run began. A burst therefore costs one render per
render, never one per keystroke, and the last keystroke is never queued behind a render it
already superseded. The only remaining floor is one frame (`COALESCE_MS = 16`), which
collapses a single host write's several mutation records and the runtime's own re-entrant
transforms; zero worked in the experiment but leaves no margin for records arriving across
two ticks.

## 3. The half that cannot ship alone

Removing the timer and nothing else was measured, and it is worse in one place:

| arm | 150ms timer | 0ms, no gate |
|---|---|---|
| `edit` ×1 cold | 209ms, 11 blank | **61ms**, 0 blank |
| `nav` cold | 240ms | **96ms** |
| `edit-broken` | 97 source frames, **1 render** | **155 source frames, 8 renders** |

The last row is the whole reason the parse gate exists. Most of the time spent building a
diagram from scratch is spent in a state that does not parse, `attachError` clears the slot
and un-hides the `<pre>`, and without a timer that happens on every keystroke. The author
gets their raw source strobing at them.

So `mermaid.parse` gates the render. It rejects a broken source in **~1.8ms** against
22-239ms to draw — the "~9ms" an earlier draft of this note quoted was a cold first call, and
a checker measured the warm figure.

**IT IS NOT FREE ON THE HAPPY PATH, and that belongs here rather than in the win column.**
Mermaid re-parses inside `render`, so a fence that parses cleanly pays the parse twice.
Measured, medians of 7 in real Chromium: 3.0ms against 21.5ms at 4 nodes, 11.5 against 82.3
at 32, 50.8 against 390.6 at 128 — **a flat ~14% on every successful render**. The trade is
14% of a render against not buying a whole doomed one, and against the strobe in §3's table;
it is worth it, but it is a tax and it is paid on the common case.

**The first version of the gate was inert**, and the reason is worth recording: it answered
synchronously, and Mermaid v11's `parse` returns a PROMISE. It saw a thenable, could not
decide, and passed everything through — the broken arm still bought eight renders and 147
source frames. A gate that cannot fail is not a gate.

## 4. `deferred` is not `pending`, and that is the mechanism

A fence whose source does not parse goes to a fourth `data-mermaid-state`, `deferred`, and a
450ms quiet timer surfaces the real error once typing stops.

**Its first version never surfaced anything.** `deferUntilQuiet` handed the fence back to
`pending` — which is exactly what the walk selects (`pre[data-mermaid-state="pending"]`,
one literal in the source). So the next pass took the fence, failed the gate, deferred
again, and **re-armed the quiet timer, roughly every 16ms**. The timer measures "has this
person stopped typing"; the deferral itself was what kept it from ever elapsing. Driven on
the built Studio, the fence sat `pending` with stale ink **four seconds** after typing
stopped — strictly worse than the blank it replaced, because there is no signal at all.

Every step in that loop was individually correct, which is why 9,158 tests were green.

**Three hypotheses missed it.** The first was a real bug and got fixed (a one-shot boolean
the run's completion hook could clear before the pass it was set for ever started); the
second was a promise tail that could strand the in-flight flag, also real, also fixed.
Neither restored the error path. The third guess was never made: instrumenting the four
decision points found it in ONE run, and the trace was unambiguous —
`initAndRun -> walk.take pending -> job.defer -> scheduleRun`, repeating, with `timer.fire`
never once appearing. Three build-and-probe cycles at ~9 minutes each went on guesses; one
went on measurement. That ratio is the lesson.

A state the walk does not select ends the loop, the document goes quiet, and the timer
fires. It inherits almost all of its appearance: the sheet hides the `<pre>` for every state
except `error`/`unavailable` and collapses the `.mermaid` slot only for those two, so a
`deferred` fence keeps showing the SVG it already has — which is precisely the hold the gate
exists to provide.

**One rule of its own was needed, and only measurement found it.** `display:flex` on the
slot comes from the `rendered` arm or from `section.diagram > .cell-stage > .mermaid`; on a
fence NOT on a diagram slide, a `deferred` slot fell back to `display:block` and the held
drawing jumped 473x186px the moment the gate engaged. The `pending` hold had the same gap for
the length of one render, which is why nobody had seen it; stretching it across a whole
typing pause is what made it visible. `deferred` now takes the `rendered` arm's `display:flex`.
The bench could not have caught this — every one of its arms puts `_class: diagram` on the
slide, where the more specific rule wins for all states.

## 5. Measured, on the built Studio

`cd docs && npm run build:e2e && npm run bench:flash -- --scenario <s>`, medians of 5.

| scenario | `main` | + this change |
|---|---|---|
| `edit` ×1, cold | 209ms, 11 blank | **66ms**, 0 blank |
| `edit` ×1, warm | 204ms, 10 blank | **59ms**, 0 blank |
| `edit-burst` (8 chars @120ms) | settles after the timer | **~60ms**, 0 blank, streams |
| `nav` cold | 240ms | **99ms** |
| `edit-broken` | 1 render | **1 render** |
| layout shift / wrong ink, every arm | 0 / 0 | **0 / 0** |

The error path is driven directly rather than inferred, because it is the half that was
broken: during typing the probe reads `fence=deferred, svg visible, no error box`; ~450ms
after the last keystroke it reads `fence=error, source visible, error box up`.

## 6. What the independent pass found, and what changed

A tier-1 checker (HARD RULE #25 — `lib/runtime` reaches both preview hosts and two exported
artifacts) drove the shipped bundle in real Chromium and found one blocking defect plus a
set of real ones. All are fixed here; the two worth reading are the first and the last.

**The coalescing froze the whole preview, not just diagrams.** `scheduleRun` early-returned
while a diagram run was in flight — but that callback also runs every content transform and
every `contentSettledListener`, so the Form composition, the masthead, the charts, the fit
berth and section numbering stopped updating too. A `mermaid.render` that STALLS rather than
rejects (the case `RENDER_SETTLE_CAP_MS` exists for) froze the preview for the whole 20s cap,
and `parsesCleanly` awaited a third-party promise with **no cap at all**, so a hung parse
froze it indefinitely. Coalescing now happens at the DISPATCH point inside `initAndRun`,
after the transforms have run, and the parse carries its own `PARSE_CAP_MS` — an
unanswerable parse resolves `true` and lets the already-capped render own the failure.
The lesson generalizes past this change: *a flag named for one subsystem gated a function
that serves several.*

**Three of the five mechanisms could be deleted with the whole suite green** — the parse
gate made inert, the completion re-run removed (which silently LOST the last keystroke), and
the `forceRender` bypass removed (which reinstated the stranding defect this branch already
fixed once). The new arms lift `renderDiagramJob` itself rather than only the helpers, and
all three mutants now die.

Also fixed: `parseDeferred`/`forceRender` were strong `Set`s of `<pre>` nodes, and both
preview hosts replace the `<pre>` on every keystroke — measured retaining one detached
subtree per character of every broken-diagram episode, permanently. The deferred set is gone
entirely (which fences are waiting is written on the fences, so the timer asks the document)
and `forceRender` is a `WeakSet`. `diagramRuns` is a counter rather than a boolean, because
one pass opens a run per consecutive scope-key change and the first tail was clearing the
flag while later runs were still queued. And a `deferred` fence now gets the `rendered` arm's
`display:flex`, because the held drawing was jumping 473x186px on a fence outside
`section.diagram`.

**One finding was fixed and then un-fixed, on measurement.** The checker showed that a
diagram broken at FIRST PAINT blanks for the quiet window instead of showing its error at
once, and the obvious guard is to gate only fences that currently hold ink. That guard was
written, measured, and reverted: once an error surfaces the slot is empty, so every further
keystroke skipped the gate and bought a doomed render — `edit-broken` went to **146 frames
of raw source and 8 renders**, against 97 and 1 before any of this work. The unconditional
gate costs a first-paint break its error for one quiet window; the ink guard costs a strobe
on the state an author spends most of their time in. The strobe is worse, so the gate is
unconditional and the first-paint delay is the accepted price. `edit-broken` now measures
**76 source frames, 1 render**.

## 7. What this does not do

- **The render itself is untouched.** 22-239ms is Mermaid's own layout and measurement, and
  no worker can take it — it needs the DOM to measure text. What is gone is the waiting.
- **A burst on a valid diagram costs one render per keystroke when renders are faster than
  typing** (8 renders for 8 characters at 120ms on a 4-node graph). That is the design
  working: each render is ~22ms, they are spread across the burst, and the author sees
  continuous updates. Coalescing only bites when renders are slower than typing, which is
  when it is needed.
- **Fence-only patching is not here.** When the only delta is inside a fence, the engine
  still runs over the slide and the `.lattice` body is still rewritten — ~15-25ms of the
  original 209ms, the smaller half. It is blocked on `lib/core/mermaid-fences.js` being
  CommonJS: the docs bundler will not do named-export interop on CJS in shipped browser
  code, so it needs converting to ESM or the detection moving into the runtime. Do not
  hand-roll a second fence scanner — that file's own header is about exactly that mistake.
- **This makes the hold from #2113 less load-bearing**, and that is worth saying plainly
  rather than discovering later. It was built to fill a ~200ms window that is now ~60ms:
  held frames in the burst arm went from 67 to 2. It still earns its place on slower
  diagrams and on the residual gap, but its headline number was measured against a wait
  this change removes.
