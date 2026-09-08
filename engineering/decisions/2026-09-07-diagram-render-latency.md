---
status: shipped
summary: >
  ABANDONED after measurement — the trade is binary and the price is not worth paying. Read
  §15 first; §1-§14 are the investigation that got there, and three of their headline numbers
  are retracted in §15. The idea: a fixed 150ms debounce sat in front of every Mermaid render,
  larger than a FULL RENDER for any diagram up to about 64 nodes (22ms at 4 nodes, 43 at 16,
  72 at 32, 130 at 64, 239 at 128), so it was waiting rather than coalescing. Dropping it to
  one frame for diagrams cheap enough to redraw live does work — a 4-node fence redraws in
  33-37ms against 89-139ms, measured paired on one host. It costs 26-27% of the main thread
  against 1%, because a live redraw means rendering after EVERY keystroke. And that is not
  tunable: an intermediate 80ms floor is strictly DOMINATED (the old build's latency at
  several times its cost), and splitting the one timer into a throttle plus a debounce fails
  by arithmetic — the trailing timer always wins the race, so the throttle fired zero times in
  24 keystrokes. A fast final redraw REQUIRES rendering after every keystroke, because nothing
  can tell which keystroke is the last one until you wait longer. The 24 renders and the 34ms
  redraw are the same fact. SEVEN independent review passes each found a shipping blocker in a
  head its author had called ready, which is its own lesson: every claim was checked by a
  throwaway probe written by whoever wanted the answer, and two of those probes reported the
  flattering result. What survived is unrelated to latency — `waitForDiagrams` now waits on
  PROGRESS rather than a 4000ms wall clock, because when that constant lost the capture
  proceeded anyway and baked a blank region into a downloaded PDF.
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

## 8. Coalescing on completion does not coalesce, and what replaced it

§2 argued that completion-coalescing "adapts to the diagram instead of guessing at it: a
small graph streams at render speed, a large one throttles itself to one render per render
rather than queueing eight behind a burst." The first half is true. **The second half is
false, and it is false for a reason that was available before any of this was written:**
coalescing can only happen if a keystroke ARRIVES while a run is in flight, and
`mermaid.render` occupies the main thread. The author's next keystroke is blocked behind the
render and lands after it — finding `diagramRuns === 0`, and dispatching. The
`diagramRuns > 0` branch is close to unreachable on the typing path.

Two independent measurements found this, from opposite directions, after the PR was opened
and green. A driven burst on the built Studio (`docs/.scratch/burst-render-count.mjs`, a
throwaway probe, and the numbers below), and an independent checker driving the shipped
bundle with an in-page `setInterval`. They agree, including on the control that rules out a
harness artifact: at 4 nodes the burst takes exactly its nominal duration on both branches.

**8 characters at 120ms into one fence, medians on one machine:**

| nodes | `main` renders / burst wall | before §8 | with the back-off |
|---|---|---|---|
| 4 | 1 / 1086ms | 8 / 1126ms | 8 / 1089ms |
| 16 | 1 / 1087ms | — | 5 / 1099ms |
| 64 | 1 / 1101ms | **8 / 2726ms** | 3 / 1508ms |

The 64-node column is the finding: the burst should take 8 × 120 = 960ms, and this branch
stretched it to 2726ms because every keystroke was waiting on the render the previous one
started. **The jank had not been removed. It had been moved from the diagram into the
editor**, which is the one place an author cannot ignore it.

### The back-off, and the three numbers it needs

The dispatch now waits for the source to settle, sized by what a render of this diagram LAST
COST — the same argument that retired `DEBOUNCE_MS`, applied to a number we measure instead
of guess. Three quantities, and they are deliberately different numbers:

- **The floor (50ms).** Below it there is no back-off at all. A burst on a ~30ms fence
  stretched 1086ms → 1130ms with a render on every keystroke — 44ms across eight, which
  nobody can feel — and the live per-keystroke redraw is what makes a small diagram feel
  instant. The same burst on a ~70ms fence stretched to 1493ms. The boundary is between
  them; 50ms is also about half a typing gap.
- **The wait (2× the last cost, capped at 200ms).** Twice, so the share of the author's
  typing time spent re-rendering is bounded by construction rather than tuned: rendering for
  `c` out of every `c + 2c` is one third. The cap bounds what this can ADD after the last
  keystroke.
- **The idle threshold (2× the last cost, UNCAPPED).** "Has this person paused?" and "how
  long may we make them wait?" are different questions, and using the capped wait for both
  leaked the whole throttle: at 64 nodes the cap holds the wait at 200ms while a render costs
  ~248ms, so a 240ms gap measured from the end of a render read as idle and fired. Every
  ~240ms, which is 4 renders across an 8-character burst.

A **leading edge** sits in front of all three: the first change after a pause dispatches at
once, because a back-off is for a burst and a click onto a cold diagram slide is not one.
Charging it one put `nav` cold back to 195ms from 94ms. Idleness is measured from when the
last render FINISHED, not when it was dispatched — measured from dispatch the interval
includes the render itself, which is longer than the cap, so the pause question answered YES
on every keystroke.

### What is still short, stated plainly

**At 64 nodes and a 120ms cadence this is still 3 renders and 1508ms against `main`'s 1 and
1101ms.** That is ~50ms per keystroke of input lag that `main` does not have, and it is not
yet understood: the fire-time idle re-check that should have closed it moved the number by
40ms, so the remaining renders are not coming from the timer this section describes.

**`main`'s "1 render" is not a general property**, and the comparison is unfair in the other
direction at any other cadence. Its 150ms debounce simply exceeds a 120ms typing gap, so it
never fires mid-burst *at that cadence*. At 200ms gaps `main` renders 8 times and stretches
the same burst to 3442ms, where this branch renders 4 and takes 2045ms. Neither build is
uniformly better; this one is better where the author types faster than the debounce and
worse in one band where they type just slower than it.

That band is real and it is a regression, so it is named here rather than filed.

## 9. Never worse than the build before it — the ledger that decides

§8 shipped a back-off that was still behind `main` in one cell, and recorded it rather than
fixing it. That was the wrong call and the instruction back was blunt: we do not ship a build
that is slower than the one it replaces. This section is the full comparison that answers it,
because the earlier ones were not full — three claims in §8 rested on cells nobody had
measured.

### What the leading edge was asking, and what it should have asked

The regression had one cause. The leading edge dispatched immediately when the author had
been IDLE — and idle is true at the first keystroke of a burst exactly as it is on a click,
so a 248ms blocking render started the moment somebody began typing.

An edit and an arrival are not told apart by timing. They are told apart by **what is on the
screen**: an empty slot means the reader has nothing, so waiting costs them everything and
buys nothing; a slot already holding a drawing means they have something valid to look at, and
blocking a keystroke to refresh it is never worth it. `anyFenceWithoutInk()` asks that
directly, and the whole 64-node/120ms cell moved from 3 renders and 1508ms to 1 and 1092ms.

### The cadence term, and why a fixed wait is always wrong somewhere

A wait only helps if it EXCEEDS the gap between two keystrokes: longer and the trailing timer
is re-armed while somebody types, shorter and it fires in every gap and buys a blocking render
per character. So any fixed number is good at one cadence and bad at another — including
`main`'s. Its 150ms debounce collapses an 8-character burst to 1 render at a 120ms cadence and
to 8 renders at 200ms, on the same diagram. It was never the better policy; it exceeded the
gap it happened to be measured at, and §8's comparison at a single cadence is what made this
branch look uniformly behind.

So the wait also beats the author's own measured rhythm. Two details are load-bearing, both
found by instrumenting rather than reasoning:

- **One keystroke is about four mutation batches.** The runtime cannot tell its own DOM writes
  from the host's, so the author's pause arrives split: `36, 1, 185, 263` at a 350ms cadence.
  Samples under 100ms are the echo and are ignored — and a cadence under 100ms is already
  beaten by the cost cap, so dropping them cannot change the answer.
- **A gap that spans a render is blocked time, not idle time.** 350ms of typing plus a 260ms
  render reads as ~610ms and looked like a pause, which cleared the rhythm on every render.
  Subtracting the render was tried and measured WORSE (8 renders / 4107ms against 3 / 2445ms),
  because the discount was consumed by the first tiny batch and `36 - 260` is negative, which
  read as no gap at all. Scaling the pause threshold by the render cost needs no bookkeeping
  about which sample owns the render and cannot go negative.

### The ledger

8 characters into one fence, medians on one machine, `main` = `95223749`. Renders / burst wall
time; the burst should take `8 x cadence`.

| nodes | cadence | `main` | this branch |
|---|---|---|---|
| 4 | 120ms | 1 / 1086ms | 1 / 1082ms |
| 4 | 200ms | 8 / 1731ms | 8 / 1726ms |
| 4 | 350ms | 8 / 2929ms | 8 / 2923ms |
| 16 | 120ms | 1 / 1087ms | 1 / 1084ms |
| 16 | 200ms | 8 / 2135ms | **3 / 1882ms** |
| 16 | 350ms | 8 / 2918ms | *7 / 3091ms* |
| 64 | 120ms | 1 / 1101ms | 1 / 1078ms |
| 64 | 200ms | 8 / 3442ms | **3 / 2194ms** |
| 64 | 350ms | 8 / 3773ms | **5 / 3702ms** |

Latency, `bench:flash`, medians of 5:

| arm | `main` | this branch |
|---|---|---|
| `edit` warm | 194ms | **62ms** |
| `edit` cold | 198ms | 185ms |
| `edit-burst` warm | 1117ms | **61ms** |
| `edit-burst` cold | 1146ms | 1169ms |
| `nav` cold | 240ms | **98ms** |
| `edit-broken` raw-source frames | 97 | **75** |

Two of those rows are worth reading twice. `edit-burst` **warm** is 61ms against 1117ms —
that is the case an author is in constantly, and it is the whole point of the work. And
`edit-burst` **cold** at ~1.1s is not a regression and was very nearly recorded as one: it is
cold-start cost, and `main` pays 1146ms for it. Three separate fixes were attempted against
that number before anyone measured the baseline.

### What is still behind, and it is one cell

**16 nodes at a 350ms cadence: 7 renders / 3091ms against 8 / 2918ms** — 173ms across eight
characters, about 22ms per keystroke, while doing one fewer render. It is reproducible, not
noise: three runs each, 3084-3097 against 2913-2925.

The cause is known and is the same one that made every other cell hard: **the runtime cannot
distinguish its own DOM writes from the author's**, so the cadence is systematically
under-reported (~227ms observed for a real 350ms) and the wait lands under the gap. Widening
the margin to cover the bias was tried and reverted — it fixed this cell and cost `edit-burst`
cold, trading the case an author is in constantly for one they are in occasionally.

The real fix is to stop counting our own writes as source changes, and there is precedent for
it a few lines away: `burstIsMarkerChromeOnly` already drops mutation bursts that are entirely
the marker watcher's. Extending that to the transform pass would make the cadence exact and
this cell would follow. It is a separate piece of work and it is named here, not filed as done.

## 10. What an independent pass found in §9's own design, and the metric §9 did not measure

§9 declared the work done bar one cell. A checker reading `756ac707` cold found two defects
that invalidate that claim, and a third that explains why neither was caught.

### The ceiling was dead, and a diagram froze for 14 seconds

`DIAGRAM_MAX_WAIT_MS` existed because a trailing debounce with no ceiling is only as reliable
as the quietest moment in the document, and steady typing never provides one. It was tested
**only inside the timer callback** — while every pass that re-arms cancels that callback
first. The runtime's own transform writes echo back through the observer about four times per
keystroke, so the timer was reset faster than it could fire and the ceiling was never reached.

Measured on the built Studio, 64-node fence, typing at a 350ms cadence: the diagram showed 3
typed characters and **did not change again for 14166ms**, against a nominal 1200ms ceiling.
It scaled with how long the author kept typing (20 characters → 6816ms; 40 → 14166ms). The
build before this work redrew on every keystroke. §9's own docblock named this exact failure
as the thing the ceiling prevents.

**The fix is where the question is asked**, not what it asks: `backoffExpired()` is now
consulted at the arm site, which every pass reaches, so no amount of re-arming outruns it.
The same 40-character burst now redraws on every keystroke with a 102ms post-keystroke
redraw, against `main`'s 97ms.

### §9 measured renders and burst wall time; the author feels neither

The number somebody actually experiences is **last keystroke → the diagram showing what they
typed**. The probe §9 was built on never recorded it. On that metric the cadence term put the
branch behind `main` in every cell the checker measured — 610ms against 281, 696 against 522,
899 against 525, 1111 against 903 — while §9's table, measuring renders and burst wall time,
reported the branch ahead in eight cells of nine. Both sets of numbers were real. Only one of
them was about the author.

The cause was arithmetic: `RENDER_COST_CAP_MS` capped only the cost term, and the cadence term
was applied with `Math.max` *outside* the cap, so any observed gap over ~120ms put the wait
past 150ms. The docblock's claim that the cap "bounds what this can ADD to the wait" was false
as shipped.

**The cadence term is retired.** Beating the author's own typing gap is the right idea, but
the runtime cannot attribute mutations — it counts its own DOM writes as the author's — so the
estimate is structurally low, and buying it cost both the slower redraw and the freeze above.
Doing it properly means teaching the runtime to ignore its own writes; `burstIsMarkerChromeOnly`
is the precedent, and that is separate work.

### The tests were theater, and the mutation record proves it

Eight mutations to the shipped policy survived all 9179 tests, including inverting the leading
edge (which restores the regression the policy exists to remove) and dropping `backoffElapsed`
from the timer's re-entry (after which **the diagram never redraws at all**). The arms tested
pure arithmetic while the behavior lived in the scheduling, and the cadence half was never
exercised because no arm called `recordSourceGap`.

The decision, the arm, the ceiling and the re-entry now live inside the lifted block together,
and the arms drive them against a controllable clock and timer. All eight mutations are killed,
each by 1-4 arms:

| mutation | arms failing |
|---|---|
| invert the leading edge | 4 |
| drop `backoffElapsed` from the re-entry | 1 |
| delete the ceiling | 2 |
| ceiling 1200 → 120000 | 3 |
| cap 150 → 400 | 3 |
| median takes the upper of two | 1 |
| reset the ceiling budget on every re-arm | 3 |
| drop the slot's class guard | 1 |

### Where this actually lands, on the right metric

Post-burst redraw — last keystroke to the diagram showing it — against `95223749`:

| nodes | cadence | `main` | this branch |
|---|---|---|---|
| 16 | 120ms | 169ms | *297ms* |
| 16 | 200ms | 57ms | 60ms |
| 16 | 350ms | 40ms | *62ms* |
| 64 | 120ms | 489ms | *575ms* |
| 64 | 200ms | 113ms | **109ms** |
| 64 | 350ms | 112ms | **104ms** |
| 64 | 40 chars @350ms | 97ms | 102ms |

Latency, `bench:flash`, medians of 5:

| arm | `main` | this branch |
|---|---|---|
| `edit` warm | 194ms | **78ms** |
| `edit` cold | 198ms | 194ms |
| `edit-burst` warm | 1117ms | **77ms** |
| `edit-burst` cold | 1146ms | **208ms** |
| `nav` cold | 240ms | **119ms** |
| `edit-broken` raw-source frames | 97 | **75** |

**The honest summary: small diagrams are far faster, large diagrams are at parity once you
stop typing at a 200-350ms cadence and about 90-130ms slower at a brisk 120ms one.** That
residue is the parse gate and the settle floor being paid on top of the same 150ms wait
`main` already paid. It buys not strobing raw source at the author while they type (75 frames
against 97) and holding the previous drawing instead of blanking. It is a deliberate trade,
and it is the one thing in this work that is worse than the build it replaces.

## 11. Verified on a real iPad, which is the surface none of this could reach

Every number in §8-§10 comes from headless Chromium on a developer machine driven by
synthetic keystrokes. That is a proxy twice over: the CPU is not a tablet's, and Playwright
delivers each keystroke fully processed before the next, so it never produces the queued
input a real finger does. HARD RULE #23 says a claim names its surface, and the surface these
measurements name is not the one an author uses.

**A human drove the branch on an iPad Air 4 — real Safari, real typing — and reported the
performance excellent.** That closes the caveat this work carried from the beginning: iOS and
touch were marked UNVERIFIED in every report, because they cannot be reached from the
sandbox. It is the strongest single piece of evidence the change has, and it is worth more
than the nine-cell table, because a tablet's main thread is far weaker than the machine those
cells were measured on — the regime where a blocking render hurts most.

**What it does NOT close, stated so nobody reads it as more than it is:**

- It is one device, one session, and a subjective judgement. No number came back with it.
- It exercises the **Studio** path, which stamps `data-lattice-swap`, so adoption chains and
  the back-off engages. It says nothing about a host that does NOT stamp — marp-vscode, a
  third-party embedder, the `marp --html` bundle — where a checker reasoned the back-off is
  bypassed entirely and every keystroke buys a blocking render. That remains open.
- A touch keyboard is slower than the 120ms cadence where the post-keystroke redraw sits
  behind `main`, so the one cell that is worse is probably not reachable by hand on a tablet.
  Not being able to reach a regression is not the same as not having one.

Recorded here rather than left in a chat transcript, because the next person to touch this
will find "iOS: UNVERIFIED" in three other places and should know it was answered.

## 12. The leading edge only works where the host speaks, and most hosts do not

A third independent pass drove the one surface the previous two could only reason about, and
it was a regression this branch caused.

**Only two things in the tree stamp `data-lattice-swap`** — `single-slide-render.ts` (the
Studio) and `deck-preview.js` (the Playground). Everything else the runtime ships to does
not: marp-vscode, third-party embedders, the `marp --html` bundle. There
`adoptOutgoingDiagrams` returns early, so the arriving fence's slot is empty, so
`anyFenceWithoutInk()` answers "arrival" on **every keystroke**, so the back-off never
engaged.

Measured against the DOM contract of a non-stamping host, 64 nodes, 8 characters at 120ms:

| host | build | renders | typing took |
|---|---|---|---|
| no stamp | before this work | 1 | 1006ms |
| no stamp | this branch, before the fix | **8** | **3333ms** |
| **stamped** (control) | this branch, before the fix | 1 | 1129ms |

The control is what makes it airtight: one attribute is the only difference, and it flips 8
renders to 1. Deleting the policy outright produced numerically identical results to the
un-stamped arm — an un-stamped host disabled the back-off exactly as removing it does.

**The fix is to ask the question only where it can be answered.** `hostStampsSwaps` records
the first time any host stamps; the ink leading edge is consulted only then. Where no host
speaks, the cost back-off applies unconditionally — which is what the build before this work
did for every host, so those consumers are no worse off, and first paint stays immediate
regardless because the back-off is 0 until a render has been timed.

After the fix, same harness: **1 render, 997ms** against a 960ms nominal. The Studio is
unaffected — 1 render at 120ms on 64 nodes, `nav` cold 129ms.

**Why the ink signal is kept at all**, rather than always backing off: dropping it makes
arrival pay the wait, and `nav` cold goes from ~119ms to ~270ms, which is worse than the
240ms this work started from. It earns its place where it is answerable.

**One honest limit.** A synthetic *stamped* arm in my own probe showed 8 renders, because a
hand-built section does not satisfy adoption, so no SVG is transplanted and the slot reads
empty. That is the probe being unfaithful, not the product — the real Studio measures 1
render — but it does show the shape of the dependency: **if adoption ever fails on a stamping
host, the back-off silently disables itself there too.** That dependency predates this work
(it is what #2113's hold rests on), and nothing here makes it worse, but it is the failure
mode to look for if the Studio ever starts rendering per keystroke again.

### What the same pass found in the tests, and what is still uncovered

Eight mutations survived all 9211 tests — the hole had **moved one line outside** the lifted
block when the policy moved inside it. The two lines that USE the policy were still
unreachable by any arm, so dropping the `backoffElapsed` argument (which holds the render
forever) and deleting `clearDiagramBackoff()` (which leaves the ceiling measuring a stretch
that ended) both passed. `admitDiagramPass()` now owns the whole gate inside the sentinels
and all four are killed.

The wiring that SETS `hostStampsSwaps` lives in `adoptOutgoingDiagrams`, which no unit arm
can lift — it needs a live host, a real swap and adoption. It is pinned by a text census
instead, which is deliberately the weakest arm in the file and is named as such: without it,
a mutation that never sets the flag survives everything, and the Studio would quietly fall
back to a back-off on every navigation with nothing going red.

Still uncovered, and named rather than fixed: `COALESCE_MS` 150 -> 16 makes the whole content
pass — Form composition, masthead, charts, fit berth, section numbering — run **16 times per
burst instead of 2**, on every deck including ones with no diagram at all (9ms -> 27ms on a
trivial slide). That buys text edits appearing ~134ms sooner, which is most of the felt win
for non-diagram editing, so it is a trade rather than a defect; but it scales with deck
complexity and inversely with CPU, it is unmeasured on a tablet, and nothing in the ledger
priced it until now.

## 13. The adversarial trio, and cutting the design down to what it actually bought

§12 ended with the work looking done. The trio — red team, Munger inversion, independent
checker — found three more blockers and one argument that changed the design rather than
patching it. That argument is the important part.

### The machinery was only ever operative for diagrams of 20 to 33 nodes

`2 * cost` capped at 150 and floored at 50 returns something other than 0 or 150 **only while
a render costs between 50 and 75ms**. Against this note's own size table (22ms at 4 nodes, 43
at 16, 72 at 32, 130 at 64, 239 at 128) that is a band of roughly 20 to 33 nodes. Everywhere
else the "adaptive" back-off was already a step function, and the arithmetic dressed it up.

Worse, the headline came from outside the band entirely. `bench:flash`'s deck is a
**five-node** flowchart at ~22ms — under the floor — so `edit warm 194ms -> 78ms` and `nav
cold 240ms -> 119ms` were measured where `diagramBackoffMs()` returns 0, the leading edge is
never called, the latch is never read, the timer never arms and the ceiling never engages.
**The flagship number was the deleted debounce and nothing else.**

### So the policy is now two answers

    cheap render (<= 50ms)  ->  draw on every keystroke
    costly render           ->  wait 150ms — the exact debounce this work removed

The second arm is deliberately byte-for-byte the old behavior, which is what makes the large
diagram unable to regress. Everything else went: the doubling, the cap-versus-floor
arithmetic, the ink query and the host latch. What remains that is genuinely NEW is the
ceiling — the old debounce had none, so steady typing starved the redraw entirely.

### Three blockers, and why two of them were the same mistake

**One broken fence disabled the back-off for the whole slide.** `attachError` clears the
`.mermaid` slot, so a fence in `error` has no ink — and `anyFenceWithoutInk()` was
DOCUMENT-scoped, so any inkless fence made every fence on that slide dispatch immediately: 9
renders and 4320ms of blocked typing against the old build's 2 and 1244ms. That is the same
error as §12's, one layer along: **asking about the document to decide something per-fence.**
Both are gone with the query itself.

**An export could bake a blank slot.** A deck of 8 diagram slides with one broken fence
stopped settling inside `waitForDiagrams`' 4000ms, and the capture proceeds anyway;
`mermaid.css` hides the source `<pre>` for every state but `error`/`unavailable`, so what
lands in the PDF is an empty region — the #2092 regression its own comment warns about.
Settle time was up 19-47% from the parse tax. The budget now means **"no progress for
4000ms"** rather than "4000ms total": give up on a diagram that is stuck, never on one that is
merely slow.

**The error box strobed.** With a broken fence beside the one being edited it blinked roughly
every 600ms. The release marker was a WeakSet keyed on the `<pre>` NODE, and both hosts
replace that node every keystroke, so each release survived one pass. Keying it on the fence
TEXT was necessary but not sufficient — consuming it on use let the next keystroke re-defer
the same unchanged broken source. The fix is to remember the FAILURE the way `mermaidSvgCache`
remembers a success: replay it, no render, no deferral. Measured on the same probe, branch
**18-19 of 24** samples showing the box against `main`'s **5 of 24** — better than the build
being replaced, not merely restored.

### The measurement that stopped a fix from shipping

Discarding the cold first render sample (Mermaid's one-time init is in it) makes `nav` cold
~126ms instead of ~225ms. It was reverted: with no sample on record the first EDIT render is
also unthrottled, so an extra ~370ms render lands mid-burst and the typing wall goes from
~1145ms to ~1515ms against the old build's ~1157ms. A once-per-visit gain on arrival paid for
by a once-per-visit regression while typing — and only one of those is worse than what we
replace.

### Where it lands

| | `main` | this branch |
|---|---|---|
| keystroke -> diagram (warm) | 194ms | **80ms** |
| burst -> diagram (warm) | 1117ms | **78ms** |
| navigate to a cold diagram slide | 240ms | **223ms** |
| 64-node burst, 8 chars @120ms | 1 render / 1157ms / 585ms redraw | 1 / ~1136 / ~594 |
| 64-node + a broken sibling fence | 2 / 1140 / 562 | **1** / 1159 / 659 |
| raw-source frames while typing a broken fence | 97 | **76** |
| error box steady while editing a sibling | 5 / 24 | **18 / 24** |
| stamping vs non-stamping host | — | **identical** |

Host-uniformity is the property four rewrites kept failing to have, and it is now a
consequence of the design rather than a patch: nothing in the policy asks the host anything.

**What is still not verified:** real marp-vscode, real touch beyond one iPad report, and the
export finding one step short of a downloaded file — the capture-proceeds-un-settled half is
measured, the human-opens-a-blank-PDF half is inferred from `mermaid.css`.

---

## 14. Two timers cannot be made to sum, and that is why there is one

§13 shipped a policy with two answers and an independent pass measured both of them wrong.
The claim it rested on — *"a costly diagram still waits that same 150ms, so it cannot be
slower than before"* — was false by an amount the ledger never looked for, because the
ledger only ever ran an 8-character burst and the effect needs a longer one.

### What the sixth pass measured

64-node fence, 24-character burst at 120ms, `main` against `20ec5c7f`, n=3 each, with only
`lattice-runtime.js` swapped between runs and the md5 checked before every run:

| | `main` | `20ec5c7f` |
|---|---|---|
| redraw after the last keystroke | 464 / 468 / 489ms | 590 / 600 / 605ms |
| main thread busy during the burst | ~10% | ~30% |
| renders during the burst | 1 | 3 |
| the harness's own fixed-delay typing | 3331-3341ms | 4119-4188ms |

The last row is the one that settles it. Playwright injects keystrokes on a fixed 120ms
delay; when that takes 4188ms instead of 3341ms, **the keystrokes were queued behind our own
renders.** A change that makes typing slower is the worst thing this file can do, and no
redraw win pays for it.

### The cause was one thing wearing three hats

The cheap/costly question decided the *wait* and nothing else. A `mermaid.parse` in front of
every render (45-61ms on that fence, against a build that parses not at all) and a 1200ms
redraw ceiling (two extra ~376ms blocking renders mid-burst) stayed on for every diagram
whatever it cost. So the costly arm was never the old behavior it claimed to be — it was the
old behavior plus two additions, and the doc asserting otherwise had never been checked
against a burst long enough to show it.

### Three designs, measured, in order

**Hang everything off one `diagramIsCheap()` and delete the ceiling.** 64-node went to
483/502/521ms against `main`'s 484/505/532, 10-11% against 10-11%, one render each. It also
took the small-diagram win with it: on a 4-node fence the burst ran the costly arm end to
end (`parses 0`, 159-192ms against `main`'s 102-139ms), because the cost record's only entry
at burst time is the **cold** render, which carries Mermaid's per-diagram-type lazy init and
reads as costly. **The ceiling had been the accidental learning mechanism** — its mid-burst
renders recorded cheap costs, the median flipped, and the rest of the burst ran live.

**Net the coalescing floor out of the dispatch's back-off.** Defensible on paper: the
document has already been still for `COALESCE_MS` by the time the wait is armed. It fixed
the 4-node case (105-113ms) and broke the 64-node one, because it drops the effective wait to
150ms from the last *keystroke* against a ~120ms typing cadence, and a costly render supplies
exactly the jitter that closes that 30ms of margin — 2 renders in 2 of 3 runs, 18-19% main
thread, typing back to 3717-3767ms. **Two serial timers cannot be made to sum**: charged in
full they overcharge the small case, netted they undercharge the large one.

**So there is one timer.** `contentFloorMs()` answers `COALESCE_MS` for a cheap diagram and
`DEBOUNCE_MS` for a costly one, `scheduleRun` is the only place a pass is scheduled from, and
the dispatch's own back-off — timer, ceiling, arm/clear and admit gate — is deleted rather
than left inert. A costly diagram is then the old build's single-timer shape exactly, with no
margin left to lose. The coalescing the second timer was really for is `diagramRuns`, which
is not a clock.

### Where it lands

| | `main` | this branch |
|---|---|---|
| 4-node, first burst after load | 102-139ms | 115-130ms |
| 4-node, every burst after that | 102-139ms | **41-56ms**, when the live arm engages |
| 64-node, redraw after last keystroke | 484-532ms | 535-580ms |
| 64-node, renders / main thread / typing | 1 / 10-11% / 3331-3341ms | 1 / 11-12% / 3364-3397ms |

### Why 32% of the main thread is fine here and 30% was not on the ceiling

The figure that matters is not the busy fraction, it is whether one render fits inside a
keystroke gap. The live arm draws 24 times across a 24-character burst at ~38ms each — 31-33%
busy, and typing measured 3310-3418ms against `main`'s 3331-3341, i.e. untouched. The
ceiling's renders were ~376ms into a ~120ms cadence, so each one directly displaced a
keystroke. That is what `CHEAP_RENDER_MS` is really bracketing, and it is a better statement
of the constant than "cheap".

### What is still short, stated plainly

**The live arm engages from the second burst, not the first**, because one cold sample is all
the record holds after a load. The first burst is `main`'s behavior, so this is a delayed win
rather than a regression — but it is not what §13 claimed.

**Engagement is not reliable at 4 nodes on this machine.** `CHEAP_RENDER_MS = 50` straddles a
4-node render here (38-57ms across runs), so the second burst took the live arm in roughly one
run in three; the other runs sat at parity. The *consequence* is now benign — a mis-latched
diagram gets `main`'s behavior rather than something worse, which was not true before this
section — but the wobble is real and the constant is not re-tuned on a single machine's
readings.

**Three other findings from the same pass are fixed here**: a transient render failure was
remembered for the life of the document (the 20s settle cap and any `mermaid.render` rejection
both recorded, and the replay ran before the cache and before any render, with no way back on
Present, a read-only embed or an export capture frame); `forceRender` and `deferredSince` did
not guard the empty key that `erroredSources` documents at length; and `waitForDiagrams`'s hard
cap had zero coverage — mutating it to `while (true)` left all fifteen cells green.

**The export ceiling was NOT tightened, and the first attempt to tighten it was wrong.** 2x
looked right — an export waits twice, so 5x stacks to 80s — until the test written for it
showed that shrinking the ceiling re-opens the blank-PDF defect the progress budget exists to
close. The real bound is the progress rule (at most N new lows for N fences, so N x budgetMs),
and the ceiling is a loose backstop over it.

**Still unverified**: real marp-vscode, real touch beyond one iPad report, and a real
end-to-end export artifact. The 80s worst case is reasoned from the call graph, not reproduced.

---

## 15. Abandoned — the trade is binary, and the live arm is not worth its price

The render-latency work does not ship. What follows is the measurement that ended it, kept
because the next person to look at this will have the same idea.

### The frontier has exactly two points

One 4-node fence, 24 characters at 120ms, paired A/B in a single session with only
`lattice-runtime.js` swapped and the md5 checked each way:

| floor | renders in the burst | main thread | redraw after the last keystroke |
|---|---|---|---|
| 16ms (live) | 24 | **26-27%** | **33-37ms** |
| 80ms | 2-7 | 3-10% | 105ms |
| 150ms (shipped) | 1 | **1%** | 89-139ms |

The middle row is the one that settles it: **80ms is strictly dominated.** It has the shipped
build's latency at several times its cost, and an unstable render count between runs. There is
no value of the constant that wins on both axes.

### And no second timer rescues it

The obvious escape is to split the one timer into two — throttle the refresh *during* the
burst, debounce the final one *after* it — so the live picture costs half as much while the
final redraw stays fast. It was built and measured. **The throttle fired zero times in 24
keystrokes.** The trailing timer is armed 16ms after each mutation, the gap is 120ms, so the
trailing timer always comes due first and always wins the race; the throttle was dead code.

That is not a tuning failure, it is arithmetic, and it generalizes to the whole family:

> A fast final redraw REQUIRES rendering after every keystroke. At the moment a keystroke
> lands, nothing can tell whether it is the last one — the only thing that distinguishes
> "mid-burst" from "finished" is waiting longer. So redrawing 16ms after the FINAL keystroke
> means redrawing 16ms after EVERY keystroke.

**The 24 renders and the 34ms redraw are the same fact, not two facts to trade off.**

### What was retracted along the way

Three claims in the sections above did not survive re-measurement on the final head, and are
left standing there with this correction rather than quietly edited:

- **"a burst in ~78ms where it took ~1.1s"** — measured on a bench deck below the size where
  any of the machinery ran. The honest figure is the table above.
- **"the error box holds steady, 18 of 24 samples against 5"** — does not reproduce. The
  shipped build measures 4/24, 4/24, 4/24; the branch measured 3, 7, 16, 3. The two-strike rule
  added in §14 to stop a transient failure being remembered for ever almost certainly undid it.
- **the anti-flash win** — a fence broken mid-word shows raw source on 5/24 samples in the
  shipped build and 4/24 on the branch, inside run-to-run noise. The parse gate buys about one
  frame, and only on a warm cost record.

### The structural finding worth keeping

**The live arm's reach is a property of the machine, not of the code.** The classifier admits a
diagram whose render measures under 50ms. On one host a 4-node fence measured 38-57ms and the
arm engaged on roughly one burst in five; on a faster one it engaged 6 of 6; a 16-node fence was
already too costly on the slower box. Any design keyed on a fixed millisecond threshold inherits
this, and no amount of care in the policy removes it.

### What survived

One thing, and it is unrelated to latency: **`waitForDiagrams` waits on progress rather than a
wall clock.** A fixed 4000ms budget prices a whole deck against a constant, and when it loses
the capture proceeds anyway — baking a blank region into a downloaded PDF, permanently. The
latency work is what exposed it (a parse gate in front of every render pushed an 8-slide deck
past the constant every time), but the hazard is in the constant and a big enough deck on a slow
enough machine reaches it unaided. That fix ships on its own branch.

The two-tier regression guard built for this work — metamorphic relations over the policy plus a
nightly counts-based Playwright pair — is NOT ported, because it describes a policy that no
longer exists. The shape is worth rebuilding if diagram scheduling is ever revisited: assert on
integer COUNTS rather than milliseconds, because counts survive a change of machine and the
numbers in this document did not.
