---
status: shipped
summary: The live preview traded its 140ms trailing debounce for an ADAPTIVE frame-aligned render loop (the video-game model) — a keystroke marks the preview dirty and schedules ONE render on the next animation frame, with an in-flight guard for backpressure. Adaptive because a cheap patch (typing) renders next-frame instant while a heavy full-write (FinishStudio/Fabricate/LayoutStudio slider-drags) coalesces on a short timer so it can't strobe (red-team fix). Measured on the real built Studio at 4× CPU: keydown→paint 204ms → ~62–88ms; a continuous fast burst renders 38× more than the debounce yet costs only ~40ms more main-thread time over 4s (no editor jank — refutes the Munger inversion). Responsiveness only; per-render engine/FRAME cost unchanged. `DeckPreview`'s `debounceMs?: number` prop became `coalesce?: boolean`. Full adversarial trio (HARD RULE #25) run.
---

# Frame-aligned preview render — delete the debounce wall, borrow the game loop

**Date:** 2026-07-15 · **Status:** SHIPPED
**Trigger:** "this whole business of debouncing the delay between typing and the
rendering… maybe we can borrow from video games where everything is instant?"

## Symptom → root cause

The live preview (`DeckPreview` → `single-slide-render.ts`) coalesced per-keystroke
edits with a **140ms trailing debounce** (`setTimeout(paint, 140)`, added
2026-06-29). That debounce was correct *when it was written*: each keystroke then
cost a full engine render (~38ms) **plus** a full `srcdoc` write that re-parsed the
560KB theme sheet (~485ms on a throttled phone). Coalescing a burst into one trailing
render was the only way to keep the main thread free.

**Two later wins invalidated the premise** (both in `2026-07-11-preview-performance-diagnosis.md`):
- the **patch path** (#913): a warm edit swaps only the `.lattice` body, skipping the
  stylesheet reparse — FRAME ~485ms → **~2ms**;
- the **memoized theme→CSS composition** (#924): RENDER ~141ms → **~9ms** at 4× CPU.

So the actual per-keystroke work fell to **~16ms**, but the 140ms debounce stayed —
now the single largest source of *felt* latency. It was ~140ms of artificial wait
guarding ~16ms of work. Worse than the number: during a *continuous* burst the
trailing timer never fires until you pause, so the preview **freezes while you type**
and only catches up when you stop.

## The model — a render loop, not a timer

A video game never debounces input. It runs a loop on `requestAnimationFrame`: each
frame, sample the *latest* state and draw it. Applied to the preview:

- an edit marks the preview **dirty** and schedules **one** render for the next
  animation frame (~16ms away);
- a burst of keystrokes within a frame **collapses into a single render of the latest
  text** — the same coalescing the debounce bought, but bounded by the frame rate
  instead of a fixed wall;
- an **in-flight guard** applies backpressure: if a render is still resolving, the
  next frame's commit marks dirty and bails; the in-flight render's `finally`
  reschedules, so the newest state paints the moment the previous one settles. A slow
  render degrades to "as fast as renders complete, always latest" — never a backlog,
  never an overlap.

This is the "drop intermediate frames, render the newest" behavior a game loop uses,
expressed with `rAF` + three refs (`dirty`, `inFlight`, a pending-frame handle). It is
**lower memory** than the debounce it replaces — one `rAF` handle and a few booleans,
versus a churn of `setTimeout` closures — and it is genuinely event-driven (edits mark
dirty; the loop consumes).

### Why not the other candidates the trigger floated
- **"Event-based"** — the system already is (`updateListener` → `setSource` → effect).
  Events weren't the problem; the *scheduling policy* reacting to them was. The rAF
  loop **is** the event-driven design done right.
- **"Blackboard architecture"** — a blackboard earns its indirection when many
  independent producers contend over shared state. Here it's one producer (the editor)
  → one consumer (the preview). A central store + a frame scheduler already gives the
  useful part without the ceremony. Rejected as over-engineering for this shape.
- **"Partial updates / patching"** — **already shipped** (`patchSlideBody` /
  `patchSections`) and kept intact; it decides *how cheaply* a render lands, orthogonal
  to *when* the loop decides to render. Going finer (DOM-diff within a section) is a
  micro-opt on a ~2ms op — logged, not built (#18).
- **Off-main-thread / worker** — investigated and rejected on evidence in the
  2026-06-29 doc (DOM injection + Fit-Spine measurement + paint must stay on the main
  thread; the workerable slice is ~1ms). Not re-proposed.

## Implementation

`docs/src/components/DeckPreview.tsx` — the shared single-slide preview wrapper:
- `render()` now **returns its `renderInto` promise** so the scheduler can await it for
  backpressure (never overlap two renders on one host).
- The trailing-`setTimeout` effect is replaced by a **commit + scheduleFrame** pair
  (held in refs, mutually recursive) plus a per-change effect that marks dirty and
  schedules the next frame. The **first paint stays immediate** (the SSG instant-shell
  dismissal timing depends on it), and the per-change effect deliberately does **not**
  cancel the pending frame on re-run — a mid-burst change keeps the single scheduled
  frame rather than thrashing cancel/reschedule per keystroke. A mount-once effect
  cancels a pending frame on unmount.
- The coalesce count the perf overlay's COALESCE chip reads is preserved (stamped on
  the host at commit time, consumed synchronously by `renderInto`).

**Prop change (breaking for the component's internal callers only):** `debounceMs?:
number` → `coalesce?: boolean`. The five interactive hosts (`StudioShell`,
`Fabricate` ×2, `LayoutStudio`, `FinishStudio`) pass `coalesce`; static hosts (landing,
showcases) omit it and stay eager (a one-shot render — their `sample` never changes).
The number is gone because a frame-aligned loop has no millisecond knob: its ceiling is
the frame rate, and its floor is the actual work.

The multi-slide filmstrip (`deck-preview.js`, Playground / Drawing Board) has its own
separate debounce in its callers and is **not** part of this change — logged as an
off-path follow-up (#18); it is a different code path with a different owner and would
widen the blast radius past one feature (#17).

**One behavior nuance:** eager (`coalesce=false`) hosts previously let concurrent
one-shot renders overlap; the in-flight guard now serializes them and coalesces any
intermediates during a slow render (so such a host can stamp `__latticeCoalesce > 1`).
The final state always paints (the dirty reschedule), so this is a strict improvement,
not a regression — but it is a change from strict one-shot-per-change.

### Adaptive scheduling — the loop self-tunes to the render cost (added after the red-team pass)

A pure rAF loop is right *only for the hosts whose edits hit the patch path.* The patch
fast-path (`single-slide-render.ts`) is taken **only when the render signature is
unchanged**, and that sig hashes `extraCss` + `extraTheme.css`. So a host whose *primary
input is those props* — **FinishStudio** (slider/joystick → `previewCss`), **Fabricate**
(color edits → `derived.css`), **LayoutStudio** (component CSS → `extraCss`) — changes
the sig on **every** edit and **never** patches: every render is a full `srcdoc` rewrite
(the iframe reparses the ~560KB theme sheet, ~485ms at 4× CPU). Rendering *that* every
frame during a continuous **slider drag** would strobe the iframe and saturate the main
thread — strictly worse than the debounce it replaced, which rendered once at the pause.
Only **StudioShell** (markdown edits → stable sig → patch) matched the ~2ms premise.

So the scheduler is **adaptive**. `renderInto` now reports its regime
(`RenderStatus.writePath: 'patch' | 'write'`); after each render the loop records whether
it was **heavy** — a full `write`, or one whose engine work exceeded a conservative
`HEAVY_RENDER_MS` (50ms) backstop (a fat table / math slide that renders slowly even on
the patch path). The next schedule branches on it: a **cheap patch → the next animation
frame** (instant live typing); a **heavy render → a short trailing timer**
(`HEAVY_COALESCE_MS` = 120ms, ~the retired debounce) so a drag / audition renders once
per pause, not once per frame. The loop self-tunes: light path stays frame-instant, heavy
path coalesces — the "be smarter" the request asked for, made automatic per-render rather
than per-host. A hung-render **watchdog** (4s) clears the in-flight guard so a stalled
bundle/theme fetch can't wedge the preview forever (red-team Finding 2).

## Maker-checker (HARD RULE, shared component → 5 hosts)

An independent checker traced the scheduler state machine and confirmed it is
**lost-update-free and wedge-free** (the `dirty`/`inFlight` clears are synchronous and
adjacent, so no edit interleaves; `commit` early-returns dirty *only* while a `finally`
is pending to reschedule; external renders never touch `inFlightRef`). One should-fix
and four nits were folded back before commit:
- **should-fix — the palette-observer and active-edge renders bypassed the new
  no-overlap contract.** Both called the render closure directly, so a palette flip or a
  tab re-show *during* an in-flight content render started a second `renderInto` on the
  same host — racing its `__latticePendingLoad` / `__latticeFrameSig` / `onload` state.
  Both now route through `scheduleFrameRef` (independent of the `coalesce` prop, so
  static hosts keep working and gain backpressure for free). This also closes the
  cosmetic COALESCE-attribution race the checker noted.
- **nits (folded):** cancel a queued frame when the immediate branch runs (a future
  dynamic `coalesce` toggle can't double-fire); guard the post-unmount reschedule on the
  host (no engine load into a dead host); `.catch` the commit chain (a `whenReady`
  bundle-load rejection can't surface as an unhandled rejection).

## Evidence (HARD RULE #19 / #23)

Measured on the **real built Studio** (`docs/dist`, `astro build`), headless Chrome at
**4× CPU throttle** (≈ a mid-tier phone), 12 isolated keystrokes each, median — a
keydown→paint probe that stamps `t0` at the real capture-phase `keydown` and records the
wall to the next render sample on `window.__latticeRenderMetrics`:

**Latency (isolated keystrokes, StudioShell patch path):**

| Build | keydown→paint (median) | range |
|---|---|---|
| **Old** — 140ms trailing debounce | **204ms** | 198–226ms |
| **New** — adaptive frame loop | **~62–88ms** | 33–118ms |

**~2.3–3× faster, ~120ms cut** per keystroke. The old samples cluster tightly at ~204ms
(the fixed wall dominates); the new ones track the actual work (CodeMirror + React +
engine ~9ms + patch ~2ms).

**Continuous fast burst (38 keys @ 17/sec — the regime the Munger inversion flagged as
unmeasured), main-thread cost:**

| Build | renders during burst | main-thread long-task | max task |
|---|---|---|---|
| **Old** — 140ms debounce | **1** (preview frozen till pause) | 325ms (8% of burst) | 60ms |
| **New** — adaptive loop | **38** (preview live) | **365ms (9%)** | 76ms |

**The new model renders 38× more yet costs ~40ms more main-thread time across a
4-second burst** — because each patch is ~2–9ms and the dominant cost is CodeMirror's own
keystroke handling (identical in both). Both sit at ~8–9% main-thread occupancy, so the
editor has ~91% headroom either way: **the feared editor-jank from per-keystroke
rendering does not materialize.** Live preview is essentially free on the patch path.

This is a **responsiveness** change, not a throughput one — the per-render engine/FRAME
cost is unchanged, so `npm run bench` and `frame-bench`'s RENDER/FRAME needles neither
move nor should. The probes above are one-offs (scratchpad, not committed); the durable
behavioral coverage is the unit tests in `DeckPreview.test.tsx` (first-paint-immediate,
frame-coalescing to the latest state, backpressure never overlaps, **heavy-host timer
coalescing**, eager default preserved).

**UNVERIFIED (HARD RULE #23):** the full-write hosts' *drag* behavior (FinishStudio
sliders / Fabricate color / LayoutStudio CSS coalescing on the 120ms timer) is covered by
the unit test + the deterministic `writePath` mechanism, but was **not driven on the real
Finish/Fabricate panels** in this sandbox — the strobe-fix's real-surface proof is the
outstanding verification. The patch-path latency + burst numbers above ARE from the real
built Studio.

## Adversarial trio (HARD RULE #25 — owner-requested)

Red team + Munger inversion + a fresh independent checker, run in parallel against the
final shipping diff. Net: the scheduler is sound; the trio surfaced one real regression
(now fixed) and refuted the two headline objections with measurement.

- **Independent checker → mergeable as-is.** Re-traced every invariant after the
  maker-checker fold: lost-update-free, wedge-free, no stale closures, coalesce count
  correct, tests genuinely fail if the feature breaks, consumer split exact. No blockers.
- **Red team → found the strobe regression (Finding 1, fixed).** The patch fast-path is
  sig-gated, so the four `extraCss`/`extraTheme`-driven hosts full-write every edit;
  removing their debounce made a continuous drag strobe full-writes. My original evidence
  covered only StudioShell (the one patch host) — the regression on 4/5 hosts was
  *unverified*, not just unaddressed. **Fixed** by the adaptive backoff above. Finding 2
  (a never-settling render wedging the in-flight guard) → the **watchdog**. Everything
  else it tried to break (no-overlap contract, `onFirstRender`, background-tab rAF,
  unmount) held.
- **Munger inversion → "ship with changes; measure the burst."** Its strongest point —
  the loop renders ~per-keystroke on the main thread, and I'd measured only *preview*
  latency, never *editor* cost — was correct and is now measured (the burst table above:
  +40ms/4s, no jank). Its proposed cheaper alternative (a ~40ms debounce) self-refutes:
  at human typing speed (~80–100ms gaps) a 40ms debounce has the **same** ~1-render-per-
  keystroke cadence as the frame loop, so it carries the same cost without the backpressure
  or the adaptive self-tuning. The genuine residual it named — heavy renders per frame —
  is exactly what the adaptive backoff closes.

## Off-path, logged not done (#18)
- Give the multi-slide filmstrip (`deck-preview.js` callers) the same frame-aligned
  loop — a separate path with its own debounce; out of scope for this one-feature PR.
- Finer-grained DOM-diff *within* a patched section (morphdom-style) — a micro-opt on a
  ~2ms operation; low ROI, recorded so the option is closed with a reason.
