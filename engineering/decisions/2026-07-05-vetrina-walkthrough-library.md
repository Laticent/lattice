---
status: proposed
summary: >
  Extract lattice Studio's self-driving demo walkthrough into Vetrina — a standalone,
  open-sourceable "self-driving UI walkthrough engine": a visible fake cursor narrates over a
  REAL app while state advances through the host's own setters (theater vs. substance), and the
  first real human input seamlessly takes over. Designed by SUBTRACTION (Saint-Exupéry) and
  less-but-better (Rams): the control-flow "graph" the ideation demanded is NOT engine primitives —
  it is the host's own if/while/await inside a Walkthrough function. That function is the TOTAL,
  always-reachable primitive; ergonomic layers compile down to it and interleave with it via the shared
  ctx (a linear Step[] data model, and a fluent recording builder scene() for hand-authoring) — so a
  layer is free to optimize for authoring over completeness because the substrate is the guarantee. ONE
  runner enforces the invariants (abort-guarded actions proxy, host-await racing against abort,
  single-flight, idempotent teardown) so every layer is safe. The only genuinely new primitive is
  awaitUser (cooperative pause -> user acts ->
  resume). Hardened by the adversarial trio (red team + Munger inversion + independent checker),
  whose net effect was to CUT surface (function-valued cues, cursor factory, a dishonest determinism
  seam, an unserializable "serializable" claim) and make safety structural rather than a discipline.
  v1 ships the contract + migrates the Studio demo onto it (behavior-preserving) as the proof.
  A SECOND trio (on the grown design: layers, scene(), gestures/drag, theming) found the growth had
  outrun its proof and reintroduced local holes (a false setProperty security claim, an invisible-accent
  gap, typing state not shared across composed segments, drag on the wrong side of the trust gate,
  scene()/Step[] not actually isomorphic); all folded in (§14-2). Two decisions: KEEP the full v1
  surface and prove it by an exhaustive exemplar + stress battery (not defer); THEMING reconciled to
  CSS-first --vt-* tokens + a JS convenience (light/dark via the host cascade).
---

# Vetrina — a self-driving walkthrough library

> **What it is.** A visible fake cursor glides across a *real* web UI, leads the eye with an
> anticipation cue, clicks, types at a human cadence, and narrates — while the real application
> state advances underneath it. Unlike coach-mark tours (driver.js, Shepherd, intro.js) that
> spotlight *static* DOM and wait for you to click through, Vetrina **drives the app's own state
> over time** and hands the wheel back the instant you touch it. Nothing quite like it exists.

This doc is the **contract**: the semantics, the API shape, what is deliberately left out, and why.
It is the design the four named consumers (Studio demo, show-don't-tell docs, emailed-deck presenter,
narrate-AI-edits) and an open-source audience will depend on. It was designed by subtraction and then
put through the full adversarial trio (HARD RULE #25); §14 is the ledger of what that changed.

---

## 1. The one idea — theater vs. substance (never dilute)

The fake cursor is **theater**: a `position:fixed`, `pointer-events:none` overlay. It **never
dispatches the real action**. Substance always flows through the host's own state setters (an
"actions" bag the host supplies). Two properties fall out, and they are the entire value:

- **Robustness** — no synthetic-event brittleness; the engine drives *your* code, not the DOM.
- **Unambiguous take-over** — because the engine emits no real input, the *only* real
  pointer/keyboard input during a run is the human's. The first one off the stage means exactly one
  thing — "take over" — so we abort instantly and let it fall through to the control they aimed at.

Everything in this contract exists to keep those two true as the engine generalizes.

---

## 2. Design method — subtraction, and less-but-better

Two standards are treated as **law**, not flavor:

- **Saint-Exupéry** — *perfection is reached not when there is nothing left to add, but when there
  is nothing left to take away.* The API is designed by removing: the success metric is the **fewest
  primitives that still express every consumer**.
- **Rams — "Weniger, aber besser."** Good design is **unobtrusive** (the engine is invisible until
  it performs), **honest** (no knob that looks configurable but isn't), and **as little design as
  possible** (defaults so good most consumers configure nothing).
- **Designed for humans, not machines.** A corollary that governs every customization field (§9):
  **no setting may take a value the human eye can't use.** A cue the eye can't follow is a defect, so
  pacing is a curated set of *followable* presets, never a free numeric a caller can set to `0.02` or
  `40`. A dial where most of the range is useless is a dishonest dial — the tenet forbids it. This is
  the same principle that justified cutting the callback cues and the fake determinism knob (§14).

The ideation surfaced ~45 uses demanding branch, loop, conditional, await, cooperative hand-off,
determinism, streaming, concurrency. The maximalist reading is "build a state-reactive graph engine."
**We reject that.** The whole design is one move (§3), and the adversarial trio's net effect was to
*subtract further*, not add (§14).

---

## 3. The architecture — one total primitive, ergonomic layers over it

> **The control-flow "graph" is not a data structure we invent. It is the host's own
> `if` / `while` / `await`.**

There is **one core, and it is *total*: the runner + a `Walkthrough(ctx)` function** over the raw
`stage`/`actions`. This is the *substrate* — the assembly language of a walkthrough. Anything a
walkthrough can ever do, it can do here; it is **not** the surface you normally hand-author. Above it
sit ergonomic layers that **compile down to it**:

- **The primitive — `Walkthrough(ctx)`.** An async function over `stage`/`actions`/`awaitUser`.
  Branch, loop, wait, react-to-events are plain JavaScript — *no invented primitives*. **Total and
  always reachable** (I9). It is the escape hatch *and* the foundation.
- **The data model — `Step[]`.** A linear walkthrough as data (fixed order say→point→click→act→
  say→(point+click|drag)→act→type→gesture→settle). Serializable and programmatically **generable** — this is
  what the wire / runtime-generation cases use.
- **The fluent builder — `scene()`.** A *recording* builder (it **constructs**, it does not execute)
  that emits the `Step[]` data. The **recommended surface for hand-authoring**: it reads as intent and
  autocompletes the verb order, and because it emits the data model it keeps serialization/generation.

**Everything compiles to the primitive, and everything can interleave with it through the shared
`ctx`** (I9): author the linear 95% with `scene()`, then `await` a built segment inside a raw
`Walkthrough` for the dynamic 5% (a branch, a loop, a hand-off), then return to `scene()` — same mental
model, no seam. You never leave the primitive's reach, which is exactly *why an ergonomic layer is free
to optimize for authoring over completeness*: the substrate is the guarantee, not the DSL. (This is the
JSX→`createElement` / query-builder→raw-SQL relationship.)

The **runner — not the consumer — enforces the invariants** (§5), so every layer is equally safe. This
is the resolution of the graph-engine pull: control flow is subtracted from the *engine* and lives in
the *language*, while the ergonomic default stays declarative data.

**Why three layers is not "more design" (the Rams test — read before proposing to collapse them).**
"As little design as possible" measures **non-essential burden on the person doing a job**, not the
*count* of surfaces. These are not three parallel ways to do one thing — they are **one semantic model
at three altitudes**, each a pure function of the one below (`scene()` *generates* `Step[]` which
*drives* the primitive), and each is the **essential** answer to a *distinct* need that cannot be
collapsed without failing one of them: hand-authoring (the fluent builder), machine
generation/serialization (the descriptor), dynamic control flow (the raw primitive). Crucially **a given
consumer touches exactly one** — a hand-author never sees the descriptor; a generator never sees the
builder — so the *per-user* concept count is low and the layers below are invisible until wanted (the
JSX→`createElement`, SQL-builder→SQL relationship). This passes the Rams test *only because the layers
collapse to one semantics*: `build()` ≡ `storyboard(seed, toData())` with a parity test (§10), so there
is no second interpreter to diverge — remove that identity and the layering *would* become non-essential
design. The layers are **leverage, not burden**; they are load-bearing, so there is nothing to take away
*at the layer level* (§16 scope; the residual subtraction questions are horizontal — gesture count,
recipes — not this vertical stack).

---

## 4. Invariants (non-negotiable; hardened by the trio)

- **I1 — The engine emits no synthetic input.** Vetrina never dispatches a real pointer/keyboard
  event at the host — including every gesture and the `drag` mechanic, which animate but never fire a
  real drag/click event. *(This is why §9 forbids callback-valued cues and §6.1 forbids custom-gesture
  callbacks: a callback that received the live element could call `.click()` and break I1 — §14/C2.)*
- **I2 — Unambiguous, instant take-over.** The first real off-stage input aborts the run and falls
  through. Instant because **every await races the abort signal** (I6). Opt-out per beat only via
  `awaitUser` (§8), which keeps a classifier guard live — it never blinds the engine.
- **I3 — Framework-free core.** `runner` + `stage` + `storyboard` depend on the DOM only. React/Vue/…
  adapters are thin and live outside the core. *(Enforced by an import-boundary gate — §12.)*
- **I4 — Captions are text; color values are validated; no HTML/`url()` injection.** Captions set
  `textContent`, never `innerHTML`. Host rich content reaching a frame is the host's to sanitize (lattice
  HARD RULE #22). Token values are applied via `style.setProperty` (no `cssText` concatenation) AND are
  **validated** — `url(`/`image(`/control chars rejected — because `setProperty` alone does NOT stop a
  `url()` value from being fetched by a `url()`-accepting sink; the engine also keeps **sink discipline**
  (never consumes a `--vt-*` token in `background`/`mask`/`cursor`). `Theme`/token values are
  **host-trusted** — never from wire/shared/AI content (§9; corrected §14-2/F3).
- **I5 — Reduced motion is honored.** `prefers-reduced-motion` collapses glide + typing to instant
  placement; the run still completes and narrates. *(It shortens the **default** settle only — an
  explicit `settle: 3200` is still honored; §14/checker.)*
- **I6 — Idempotent teardown, structurally enforced.** Every terminal path (complete / take-over /
  exit / unmount / error / sync-throw / abort-mid-await) routes through one `stop(reason)`. The
  runner: (a) **races every host await** (`act`, `awaitUser`) against the abort signal, so a
  taken-over run can never resume onto a destroyed stage; (b) wraps `play()` so a **synchronous
  throw** still tears down; (c) **abort is terminal for narration, not just actuation** — after abort,
  every Stage method (`say`/`point`/`press`/`gesture`/`drag`) no-ops AND the next `await` re-rejects
  `AbortError`, so a `Walkthrough` that *catches* the abort and keeps going can neither drive **nor
  narrate** onto a dead stage (§14-2/Munger — the interleave-safety guarantee, tested directly); (d) is
  **single-flight** — a second `run()` while one is active **throws a named error** (never a silent inert
  handle — §14-2/F10; compose with `segment(ctx)`, never a nested `run()`). Teardown removes every node,
  listener, and timer the engine created, and is safe to call twice.
- **I7 — The host owns substance and restore; the engine owns theater + sequencing + take-over.**
  The engine restores nothing it did not create. It calls `onStop(reason)` **after** `stage.destroy()`
  (destroy-then-restore, so a restored palette never flashes under the still-mounted overlay; §14/checker).
- **I8 — After take-over, the actions bag is inert.** The runner hands the walkthrough an
  **abort-guarded proxy** of the host actions: once aborted, every `act` is a no-op. "Drive the app
  after the human took over" is structurally impossible, not a discipline we ask authors to keep
  (§14/H1).
- **I9 — The primitive is total and always reachable; every authoring layer compiles to it and can
  interleave with it.** A `Walkthrough(ctx)` over raw `stage`/`actions` can express anything the engine
  can do. `Step[]` and `scene()` (§3, §10) are ergonomic layers that **compile to** it and emit/return
  a `Walkthrough`, so a built segment is just `await scene(...).build()(ctx)` inside a raw walkthrough —
  and raw `ctx.stage`/`ctx.actions` calls sit freely between built segments. **No authoring layer is a
  walled garden:** whatever a layer can't express, the primitive can, from the same `ctx`, mid-run. This
  is what lets a DSL optimize for ergonomics over completeness without ever trapping the author.
  **For interleaving to be seamless, run-scoped state lives on `ctx`, not per-segment (§14-2/F2, F6):**
  the typed-source baseline + seed (the `commonPrefix` diff basis) and the `TypeOps` capability are
  owned by the run and shared across every segment and raw beat — a composed segment reads the *live*
  document, never its own stale seed, and `ctx.type`'s presence is decided once at `run()` (a
  `run()` given no `TypeOps` rejects a `play` that types, at the type level, on **every** surface — not
  a mid-run throw). The **opening flourish (`intro`) is a runner responsibility, played once per
  `run()`** — never per compiled segment — so composing two segments doesn't replay the wave (§14-2/F7).

---

## 5. The runner — the whole engine

```ts
type Walkthrough<A> = (ctx: RunContext<A>) => Promise<void>;

interface RunContext<A> {
  stage: Stage;               // theater (§6)
  actions: A;                 // abort-guarded proxy of the host bag (I8); engine names NOTHING in A
  signal: AbortSignal;        // aborts on every terminal path
  type(target: Target, text: string, opts?: TypeOpts): Promise<void>; // present only if TypeOps wired (§7)
  awaitUser(opts: AwaitUserOpts): Promise<Event>;                     // the one new primitive (§8)
}

interface RunOptions<A> {
  root: HTMLElement;                       // the app subtree the walkthrough drives
  actions: A;                              // the host's setters (bound to real state)
  play: Walkthrough<A>;                    // usually scene(...).build() or storyboard(seed, [...]) (§10)
  onStop?: (reason: StopReason) => void;   // host restore, called AFTER destroy (I7)
  theme?: Theme;                           // JS convenience over the --vt-* CSS tokens; omit for house look (§9)
  type?: TypeOps;                          // omit if this host never types (§7)
  takeover?: {                             // §8 — defaults are the full-page demo case
    scope?: 'root' | 'window';            // 'window' = Studio default; 'root' for embedded consumers
    ignoreModifierKeys?: boolean;         // don't abort a tutorial on a lone Shift/Cmd/IME key
  };
}

interface RunHandle { readonly active: boolean; stop(): void; }

function run<A>(opts: RunOptions<A>): RunHandle;   // mounts stage, installs guard, plays, tears down
```

`run()` is the entire public engine. There is **no step interpreter in the core** — `storyboard`
(§10) is a library function that returns a `Walkthrough`.

---

## 6. The Stage — the theater vocabulary (the reusable jewel; ~complete today)

```ts
type Target = string | HTMLElement | (() => HTMLElement | null); // selector | node | fn
type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'shake';  // the cursor's body language (§6.1)

interface Stage {
  // MECHANICS — functional cursor ops
  say(text: string): void;              // caption; textContent only; '' CLEARS, undefined LEAVES it
  point(target: Target): Promise<void>; // anticipation cue -> (register beat) -> eased glide
  press(): Promise<void>;               // click burst at the cursor (theater; pair with act)
  drag(from: Target, to: Target): Promise<void>; // demonstrate a move/reorder: glide to `from`,
                                        // pick-up, glide to `to`, release (theater; real move via act)
  // GESTURES — expressive choreography that carries MEANING (pure theater; never actuates)
  gesture(kind: Gesture, target?: Target): Promise<void>;
  intro(): Promise<void>;               // opening flourish = cursor materializes + gesture('wave')
  // INTROSPECTION / LIFECYCLE
  resolve(target: Target): HTMLElement | null; // scoped to root by DEFAULT; portals opt-in (§12)
  readonly reduced: boolean;
  contains(node: EventTarget | null): boolean; // is this the stage's own chrome (Exit)?
  destroy(): void;                      // idempotent; methods no-op afterward (I6)
}
```

Semantics pinned against the shipping code so a port can't silently regress:
- **A null-resolving `point` / `gesture(..., target)` is a NO-OP** — no wait, no throw, no hang
  (selectors *do* miss on portal timing). *(§14/checker.)*
- **`point` preserves the register beat** — the ~480 ms pause between the anticipation cue and the
  glide that lets the eye lead the cursor. Fused into `point()` but not dropped; asserted by a
  *timing* test, not just an order test (§14/M3).
- Every Stage animation races the run's `AbortSignal` and rejects `AbortError` on take-over.

### 6.1 Gestures — the cursor's body language (a first-class, curated concept)

A **gesture** is a small piece of cursor choreography that the viewer **reads as meaning something** —
the theater metaphor taken to its end: the cursor is an actor, and gestures are its body language. This
unifies motions that were ad-hoc special cases (the hello `wave` buried in `intro`, the `circle`) under
one concept — *more* Saint-Exupéry, not less. The **curated alphabet** (v1):

| Gesture | Meaning |
|---|---|
| `wave` | greeting / hello (the opening flourish) |
| `circle` | "look here / this just rendered" — a rounded-rect glow on the element's **bounding box** + the cursor orbiting it in an ellipse **proportional to the element** (clamped), so it reads on a big pane or a small control |
| `check` | success / done / correct |
| `cross` | wrong / rejected / deleted |
| `shake` | "no — careful / try again" (universal negation) |

Greet, direct attention, confirm, reject, negate — the semantic range a silent narrator needs. This
lights up real consumers: `check` on a completed guided-support step; `check`/`shake` for
correct-vs-try-again in a teach-then-test tutorial; `check`/`cross` for approve-vs-reject in the
trust-preview beat (§12).

The rules that keep it an alphabet, not a sticker pack:
- **A gesture earns its place by carrying a distinct MEANING the eye can read** — not by being a
  different motion (the human-not-machine tenet, §2). `wave`/`circle`/`check`/`cross`/`shake` each
  *say* something; `spin`/`bounce`/`wiggle` don't — they stay out. Extend the set only when a genuinely
  missing *meaning* appears, never for a new animation.
- **A gesture is pure theater (I1).** `check` does not mark anything done in the app — it only *shows*
  success; the `act` did the deed. Gestures never dispatch a real action.
- **No custom-gesture callbacks.** Same hole the trio closed on cues (§14/C2): a custom gesture that's a
  *function receiving the target element* could call `.click()` and break take-over. If gestures ever
  become extensible, a custom one is a **rendered motion description** (a keyframe/path spec the engine
  draws), never a callback with DOM access. v1 ships the curated set, no custom-gesture API.
- Pace follows the `speed` preset (no per-gesture dials); reduced motion collapses a gesture to an
  instant cue or skips it. `intro` = materialize + `gesture('wave')`; `circle:`/`.circle()` in the data
  model & builder (§10) are sugar for `gesture('circle', target)`, so the Studio demo migrates unchanged.

**`drag(from, to)` is a MECHANIC, not a gesture** — it *demonstrates a UI operation* (a move/reorder),
takes **two** targets, and sits with `point`/`press` outside the expressive alphabet. Pure theater (I1):
the cursor animates pick-up → glide → drop; the **real** move flows through the paired `act`, dispatching
no drag/pointer events, so a taken-over run never actually drags. Pinned after the second trio
(§14-2/F5, F9):
- **Slot & exclusivity:** `drag` occupies the *positioning* phase — a step has **either** `point`(+`click`)
  **or** `drag`, never both (enforced). Canonical order: `say → (point+click | drag) → act → type →
  gesture → settle`.
- **Success-gated drop (the trust invariant):** pick-up + glide play *before* `act`, but the **drop is
  gated on `act` succeeding** — the real move fires through `act`, and only on success does the item
  settle at `to`; a rejected `act` snaps it back, which is exactly where a `cross`/`shake` is honest.
  The theater never shows a completed move that didn't happen.
- **Rects re-read at glide time** (and `to` scrolled into view): drag runs *before* the reorder reflow,
  so a one-shot early rect would land on a stale/off-screen slot (§14/D4.1). A null `from`/`to` = no-op.

`nod`/`pulse`/`underline` remain *unbuilt* until a consumer needs the meaning — and the alphabet is
frozen by a build-failing gate (§14-2/Munger): a `SANCTIONED_GESTURES` registry (each entry a required
*meaning* string, budget 5), the same `check-ownership` pattern this repo already trusts for margins /
hex / tokens (HARD RULE #15). Adding a gesture is an allowlist edit that forces the "what meaning?"
question — not a drive-by feature PR.

---

## 7. Typing — an optional capability, not a core verb

"Type into a CodeMirror tail" is host-specific. Typing = drive a target string through host ops at a
human cadence, honoring reduced motion:

```ts
interface TypeOps  { set(text: string): void; append(text: string): void; }  // how text LANDS (host)
interface TypeOpts { cadence?: number; }                                      // per-call ms/char (§14-2: was undefined)
```

- The cadence, whitespace-chunking, ±40% jitter, and the **"render breath"** (a longer pause every
  ~38 chars, past a preview's ~140 ms debounce, so editor and preview stay in sync) live in the
  engine. *How text lands* is the host's `TypeOps`. Preserves Studio's native-editor-insert exactly.
- **Typing is coupled to `TypeOps` at the type level on EVERY surface (§14-2/F6):** a `play` that types
  is only accepted by a `run()` given `TypeOps` — and because the requirement is carried on the
  `Walkthrough`/builder type, `scene().type(...).build()` and composed segments propagate it too, so the
  "throws if called" bomb can't be laundered away through the new layers (§14/M4, hardened).
- **The typed-source baseline is run-scoped, on `ctx` (§14-2/F2):** the `commonPrefix` diff basis (and
  `seed`) is shared across every segment and raw beat, so a composed segment types against the *live*
  document — never its own stale seed. Route all typing through `ctx.type` (which keys prior text per
  target); a raw `actions.typeTail` that bypasses it is the author's own to reconcile.

---

## 8. Take-over — resolved by subtraction, then hardened

The ideation's loudest demand: "abort is too binary." Resolution — three behaviors, **one** new
primitive:

- **(a) hard abort** — the default (I2). Free.
- **(b) point-but-never-actuate** — *already free*. A beat with `point` and no `act` points without
  doing anything. "Never-drive zones" (payment, consent) are enforced by the host simply not wiring
  an `act` — the engine cannot actuate what it was never handed.
- **(c) cooperative hand-off** — `await ctx.awaitUser(opts)`. The one genuinely new primitive,
  because suspending take-over is the one thing the host cannot do itself. **Fully specified** (the
  trio found the naive version deadlocks — §14/C1, M1):

```ts
interface AwaitUserOpts {
  match: (e: Event) => boolean;   // the expected gesture (e.g. a click on #next)
  timeout?: number;               // REQUIRED-in-spirit: without it a wrong-input user can hang
  onTimeout?: 'abort' | 'resume'; // default 'abort'
}
```

- The guard is **never removed.** One classifier listener stays live: **match → resolve + resume;
  non-match → still take-over** (a keyboard user pressing Enter while we await a tap is a legitimate
  take-over, not a silent fall-through into the raw app). This closes the "neither" hole.
- `awaitUser` **rejects on the run's signal**, so Exit/unmount tear down even mid-wait. The Exit
  chrome stays interactive throughout.
- `awaitUser` **means the user performs the action for real** — the script must **not** also `act`
  that beat (no double-actuation), and the runner swallows the tail of the resolving gesture (a short
  suppress window) so a double-tap's second half isn't read as immediate take-over.
- v1 **ships and tests** `awaitUser` against a real exercised consumer (the vanilla reference tour's
  "your turn — click here" beat, §12) — a primitive no consumer drives is an unproven liability
  (HARD RULE #23 in spirit; §14/scope).

---

## 9. Theming & effects — CSS-first `--vt-*` tokens, JS convenience (the Rams seam)

Zero config = the house look. **Two surfaces, one token contract** — a CSS surface (first-class, the
repo's palette-blind doctrine) and a JS convenience over it — and every field is **description, never a
callback, and never a free value the eye can't use** (the human-not-machine tenet, §2). *(Reconciled
after the second trio — §14-2: JS-only was the wrong bet for CSS-design-system hosts, shipped a false
security claim, and its per-mode value sets reintroduced a mode-switch race. CSS-first fixes all three.)*

**Surface 1 — the `--vt-*` token contract (first-class CSS).** The engine renders every color through a
`var(--vt-*)` role token with a sensible default — no hex literals in its own theater CSS (HARD RULE #3
applied to itself), named by role not scheme (HARD RULE #11). These are a **documented, public** surface:
a host styles them in its own stylesheet, and its **existing light/dark cascade re-resolves them for
free** — no JS, no mid-run mode-switch mechanism, no flip race.

```css
:root                     { --vt-accent: #2b6ef2; /* … sane defaults … */ }
:root[data-theme="dark"]  { --vt-accent: #4b82ff; --vt-caption-bg: #0c0e13cc; }  /* the HOST's cascade */
```

The set covers **every color the stage draws**, so a host can fully rebrand. *(Consolidation, §16
"dock redesign" 2026-07-06: the top "Live demo" strip and the bottom caption merged into ONE persistent
narration DOCK — live-dot + narration + Exit — so the retired `--vt-chrome-bg/ink` tokens are gone and
the hint color is now `--vt-caption-hint`. Exit stays always-reachable because the dock never fades out.)*

```
--vt-accent                                   brand hue: pointer + cues + glow + live dot
--vt-cursor-fill  --vt-cursor-stroke          the cursor
--vt-caption-bg   --vt-caption-ink            the narration dock surface + text
--vt-caption-hint                             the idle "take over" fallback text (dimmed)
--vt-caption-radius                           the dock corner shape (999px pill default; a LENGTH, CSS-only)
--vt-ring-halo    --vt-glow-halo  --vt-tick-halo   cue co-strokes (legibility floor; sane fixed defaults)
--vt-exit-bg      --vt-exit-ink                the Exit control
```

`--vt-caption-radius` is the one non-color token — a length, so it's CSS-first only (a host sets it in
CSS; it is NOT a JS `Theme` color). "Shape" here means corner rounding, nothing more (a pill by default,
a smaller radius for a rounded rectangle). The dock's **edge** is a curated JS choice: `placement:
'top' | 'bottom'` (default `bottom`) — a discrete option, not a free coordinate (the human-not-machine
tenet, §2).

**Surface 2 — the JS `Theme` object (the zero-CSS convenience).** For hosts that would rather not touch
CSS, a small object that *writes the tokens for you*. It is **mode-agnostic** — it sets tokens once;
light/dark stays the host's cascade job (Surface 1), so the engine needs no per-mode value sets and no
mode-switch mechanism.

```ts
type Color = string;                          // a CSS color; VALIDATED (see below) — not a raw sink
type VtToken = 'accent' | 'cursorFill' | 'cursorStroke' | 'captionBg' | 'captionInk' | 'captionHint'
             | 'ringHalo' | 'glowHalo' | 'tickHalo' | 'exitBg' | 'exitInk';

interface Theme {
  accent?: Color;                             // brand hue → --vt-accent (validated)
  speed?: 'slow' | 'moderate' | 'fast';       // guaranteed-followable pacing (default 'moderate')
  pointer?: 'arrow' | 'ring' | 'dot';         // curated cursor SHAPE (default 'arrow')
  placement?: 'top' | 'bottom';               // which edge the narration dock sits at (default 'bottom')
  cues?: Partial<Record<'anticipate' | 'press' | 'circle' | 'intro', false>>; // SILENCE a cue
  tokens?: Partial<Record<VtToken, Color>>;   // escape hatch: set any --vt-* value directly, in JS
  portalRoot?: HTMLElement; zIndex?: number;
}
```

**Color values are VALIDATED — the human-not-machine tenet applied to color (§14-2/F3, F4).**
- **Legibility floor:** `accent` (and cursor/cue colors) are checked against a luminance/contrast bound,
  and the cue co-stroke is chosen to contrast with the *accent*, not always white — so a pale or
  same-hue `accent` can never render the cursor invisible. A color the eye can't use is exactly what §2
  forbids for `speed`; color gets the same discipline (normalize or reject, never silently invisible).
- **No exfiltration sink:** any value containing `url(` / `image(` / control chars is **rejected**.

**Light/dark: the host's CSS cascade owns it — no mode-switch mechanism in the engine (§14-2/F8, D).**
Because every color resolves through `--vt-*`, a host that themes for dark just redefines those tokens
under its own dark selector (`[data-theme="dark"]`, `prefers-color-scheme`, whatever it already uses).
When the host flips mode mid-run (the Studio's `toggleMode` beat — the flagship migration does exactly
this), the cascade re-resolves the tokens **automatically and atomically** — no `data-vt-mode` signal to
wire, no observer, no value-set swap, no flip race. (The JS per-mode `light`/`dark` value sets that
*reintroduced* that race are **cut**.) Beneath it sits the **mode-agnostic legibility floor**: the
default `--vt-*-halo` co-strokes + dark caption scrim keep the theater readable on either ground even if
a host themes neither mode (proven by the Studio demo flipping light↔dark mid-run). The **host owns the
app's palette**; Vetrina only reads what the cascade resolves.

**Security (I4, corrected — §14-2/F3).** `setProperty('--vt-*', v)` prevents CSS *rule/selector* escape,
but does **NOT** stop a `url()` value from being fetched by a `url()`-accepting sink
(`background`/`mask`/`cursor`) — the exfil happens at the sink regardless of how the property was set.
The real defenses, now the contract: **(1) sink discipline** — the engine never consumes a `--vt-*`
token in a `url()`-accepting property; **(2) value validation** — reject `url(`/`image(`/control chars;
**(3) trust boundary** — `Theme`/token values are **host-trusted** and must never be populated from
wire / shared / AI-generated content. Captions stay `textContent`-only (I4 unchanged).

**Pointer & glow ARE customizable — as shape + color, from curated choices:**
- **Color** — the pointer, the cue rings, and the `circle` glow all tint from `accent`. One token
  brands the whole theater. (Applied via `setProperty`, never concatenated into `cssText` — I4.)
- **Pointer shape** — a small hand-designed set (`arrow` / `ring` / `dot`), each kept legible; you
  pick one, you can't draw an illegible cursor. A truly bespoke brand cursor (a logo) stays a
  documented future seam that would render a *sanitized* description into a `pointer-events:none`
  node — never a v1 callback.
- **Glow** — color via `accent`; presence via silencing `circle` (`cues: { circle: false }`). No free
  radius/intensity dial — same human-not-machine reason as `speed`.

**Pacing is `speed`, a curated preset — this is the headline of the human-not-machine tenet.** `slow`
/ `moderate` / `fast` each map to hand-tuned internal timings that the eye can always follow; there is
no value in the set that produces an un-watchable run, because there is no free "set."

What the trio (and this refinement) **cut**, and why it's *more* Rams:
- **No callback-valued cues, no `cursor` factory.** They received the live target element and could
  emit real input → break I1/I2 (§14/C2). A cue can be **silenced**; it cannot be **replaced by
  arbitrary code with DOM access**.
- **No free numeric `speed`/`scale` multipliers.** A pacing dial whose useful band is a sliver is a
  dishonest dial (§2). `speed` is a preset; cue *size* is automatic and relative to the target it
  points at (a display-density preset returns only if a real need proves it — never a raw number).
- **No `clock`/`random` determinism knob.** It governed none of the real timing (rAF / WAAPI /
  `setTimeout`) — a dishonest "looks configurable but isn't" (§14/H3). Added *with* the record
  consumer (out of v1, §11), done honestly (all time through one injected clock), not a decoy now.
- **No JS per-mode `light`/`dark` value sets, no `data-vt-mode` signal (§14-2/F8).** They reintroduced
  a mode-switch race the mode-agnostic design didn't have; the host's CSS cascade owns light/dark instead.

Result: house look → pass nothing; brand via **CSS** → style `--vt-accent` (light/dark for free via your
cascade); brand via **JS** → `theme: { accent }`; slower/faster → `speed: 'slow'`; a different cursor →
`pointer: 'ring'`; drop a cue → `cues: { intro: false }`. Two honest surfaces, one token contract, every
color legible by construction.

---

## 10. Authoring — the data model and the fluent builder

**The data model — `Step[]`** (the serializable/generable representation):

```ts
interface Step<A> {
  say?: string;
  // POSITIONING — a step has EITHER point(+click) OR drag, never both (§6.1)
  point?: Target; click?: boolean;
  drag?: { from: Target; to: Target };
  act?: (a: A) => void | Promise<void>;    // async allowed; the runner awaits it (races abort — I6)
  type?: { target: Target; text: string; cadence?: number };  // typing carries its TARGET (§14-2/B) + per-step ms/char
  gesture?: Gesture | { kind: Gesture; target?: Target };      // §6.1 body language; gated on act success
  circle?: Target;                         // sugar for gesture: { kind: 'circle', target } (§6.1)
  instant?: boolean;                       // NO theater: act/type apply now, cursor/typing/gesture/settle skipped
  until?: () => boolean;                   // advance GATE: hold (abort-safe poll) until true, then settle
  settle?: number;                         // fixed pause after the beat; honored with `instant` too
}

function storyboard<A>(seed: string, steps: Step<A>[]): Walkthrough<A>; // data → primitive
```

- Fixed interpretation order per step: **say → (point+click | drag) → act → type → gesture → settle** —
  a step reads top-to-bottom as intent. A step sets **either** `point`(+`click`) **or** `drag`, never
  both; `drag`'s drop and the outcome `gesture` are both gated on `act` success (§6.1).
- **`act` runs (awaited) BEFORE the `gesture` confirm**, and a **rejected `act` suppresses the
  success narration + any outcome gesture** and routes to `onStop('error')` — the theater must never
  play `check`/`circle` "look what rendered" around a change that failed (§14/Munger, the trust
  invariant). *(A failed `act` is exactly where a `cross`/`shake` is honest, if the author wants it.)*
- `seed` and per-step `cadence` are **first-class** (the candidate dropped them; both are load-bearing
  for the migrated Studio demo — §14/checker).
- **`instant` + advance control (2026-07-06 follow-up; hardened by TWO adversarial trios — §14-3, §14-4).**
  Not every beat should be *performed*: setup, closing an overlay, jumping ahead are plumbing. `instant`
  applies a beat's `act`/`type` with **no cursor move, no typing animation, no gesture, no settle** — the
  declarative equivalent of a raw `Walkthrough` calling `ctx.actions.foo()` with no `stage.*` motion
  (`say` still shows; the trust invariant holds — `act` is still awaited). It **ignores** any `point`/
  `click`/`drag`/`gesture` on the same step and **warns at build time** (they'd be silently dropped).
  **Advance is gated by what the app exposes** — the three-flavor rule: a fixed pause is **`settle`**; a
  **promise** readiness is an **async `act`** (already awaited — reach for this first); a **non-async /
  pollable** readiness (a DOM flag with no promise) is **`until: () => boolean`**. `until` is the
  DESCRIPTOR-layer gate — deliberately declarative so an author never drops to the raw API for a wait (the
  DSL > descriptor > raw layering: raw is the last resort, not the home of a common need); its internal
  engine is the **un-exported** `holdUntil` (the one PUBLIC poll-wait is `waitFor`). It is **throw-safe** (a
  predicate that throws while its element is null = "not ready yet") and on a ~15s timeout it **ADVANCES
  with a `console.warn`** (naming the last predicate error, if any) — never silent (the author gets a
  signal), never fatal (a backgrounded tab or slow app must not self-destruct the run — ENDING it was a
  worse regression than the silent advance it replaced; §14-4/red-team). This stays within the human-not-machine tenet (§2): `instant` is a discrete "skip the
  theater" choice (not a free speed dial), and `until` is a readiness predicate (not a raw millisecond
  knob). **Authoring tenet:** a walkthrough that is *mostly* `instant` is a defect — it's a silent state
  machine, not a walkthrough; `instant` is for the plumbing *between* the taught beats. *(Dogfood: the
  Studio demo uses BOTH — `instant` for its silent close-overlay beats, and `until(railReady(k))` for the
  "watch it build" beats, replacing fixed settles that raced the ~400ms editor→deck parse debounce.)*
- Type inference: annotate once — `storyboard<StudioActions>(seed, [...])` — or let `A` bind from
  `run({ actions })`; without it, `act` params fall back to `any` (§14/checker).

**The fluent builder — `scene()`** (the recommended hand-authoring surface). A **recording** builder:
verbs set slots on the *current* step and return `this`; nothing executes until the built `Walkthrough`
runs. It emits the same `Step[]`, so serialization/generation survive.

```ts
function scene<A>(seed?: string): SceneBuilder<A>;   // seed = the typing baseline (default '')
interface SceneBuilder<A> {
  say(text: string): this;
  point(t: Target): this;  click(): this;  drag(from: Target, to: Target): this;
  act(fn: (a: A) => void | Promise<void>): this;
  type(t: Target, text: string, opts?: TypeOpts): this;          // carries the TARGET (matches Step.type)
  gesture(kind: Gesture, target?: Target): this;                 // §6.1 body language
  wave(): this;  circle(t: Target): this;  check(): this;  cross(): this;  shake(): this; // sugar
  hold(ms: number): this;                 // sets the current step's `settle` AND closes it
  step(): this;                           // explicit step boundary (rarely needed — see rule)
  build(): Walkthrough<A>;                 // ≡ storyboard(seed, this.toData()) — ONE interpreter (§14-2)
  toData(): Step<A>[];                     // → the data model (wire / inspection / generation)
}
```

- **Step-boundary rule (§14-2/F1, B — the ambiguity the second trio caught).** A verb fills its slot on
  the *current* step; a **new step opens** when you would overwrite a filled slot (a second `say`, a
  second positioning verb) or call `.hold()` / `.step()`. So `.say().point().click().act().hold(900)` is
  **one** fused step with a single `settle` — identical pacing to the equivalent `storyboard` step — and
  the next `.say()` begins the next. This makes "emits the same `Step[]`" precise and testable (it was
  undefined before, so the round-trip claim was unverifiable).
- **One interpreter, provably no drift.** `build()` is **defined as** `storyboard(seed, this.toData())` —
  never a second interpreter — and a **parity test** asserts `scene(...).build()` and
  `storyboard(seed, scene(...).toData())` produce byte-identical run traces (§14-2/Munger). Every `Step`
  field has a builder verb and vice versa (type-derived: a new `Step` field is a compile error until the
  builder covers it), so `scene()` and `Step[]` cannot diverge.
- It stays **linear by construction** (a recording chain can't hold an `if`) — deliberate: the moment a
  walkthrough needs branch/loop/`awaitUser`, drop to the primitive `Walkthrough(ctx)` and `await` built
  segments between the raw beats (I9). The builder never has to be complete because the primitive is.
- Docs **lead with `scene()`** for hand-authoring; reach for `Step[]` directly when *generating* a
  walkthrough from data; reach for the raw `Walkthrough` when control flow is dynamic.

---

## 11. First-party recipes, future seams, and what's truly OUT

**Recipes (shipped as ordinary abort-aware helper functions over the runner — NOT primitives).**
"branch/loop/await is just JS" is true, but if every consumer hand-rolls `loop`/`waitFor`/`retry`
the ecosystem fragments and gets abort-safety *wrong* (§14/Munger D3.1). So Vetrina ships them as
first-party functions — subtract *primitives*, keep *recipes*:

```ts
waitFor(target | (() => boolean), opts?): Promise<HTMLElement | void>; // the real recurring need
loop(body, { until, signal }): Promise<void>;                          // kiosk / kata, abort-aware
retry(body, { times, signal }): Promise<void>;
```

**Documented future seams (NOT built in v1; the shape leaves room):**
- **Declarative, serializable `act`** (`{ do: string; args? }` resolved by name) for walkthroughs that
  cross a wire (streamed / remote-support). v1's presenter ships its script as *code* and reads the
  *deck* as data, so it does not need this — and we **drop the false "storyboard is serializable"
  claim** rather than ship the machinery early (§14/H2).
- **Determinism + capture** (record-to-video/GIF/WebVTT) — added with that consumer, honestly (§9).
- **`when?` conditional sugar** on `Step` — if a real branching-tutorial consumer proves the array
  needs one pinch of conditionality before dropping to the escape hatch.

**Truly out of scope (not precluded, but not ours):** concurrent/multiple cursors, networked
multi-viewer sync, seek-to-arbitrary-state, record-from-interaction authoring, an assertion/axe/
network-matcher framework (the host writes assertions in `act`; a throw routes to `onStop('error')`).
The test for every one: *can the host express it with `act` + normal code + a recipe?* If yes, it is
not a primitive. Only `awaitUser` failed that test.

---

## 12. Consumer mapping (each expressible — the contract's proof)

| Consumer | Front door | New primitive? |
|---|---|---|
| **Studio demo (v1 migration)** | `scene(seed)` / `storyboard(seed, [...])` + actions + `TypeOps` | none |
| **Show-don't-tell docs** | `scene()` + a docs actions bag | none |
| **Emailed-deck presenter** | `storyboard(seed, [...])` (data), no `TypeOps`, host loops via `loop` recipe | none |
| **Narrate AI edits** | `Walkthrough` fn; `act` awaits the real edit (runner races abort) | none |
| Guided support / tutorial | `Walkthrough` fn + `awaitUser` + `takeover.scope: 'root'` | `awaitUser` |
| Trust-preview "confirm before commit" | `Walkthrough` fn + `awaitUser` + `drag` (gated drop) + `cross`/`check` | `awaitUser` |
| Kiosk attract-loop | `loop` recipe + `scene()`; reset in `onStop` | none |

The named consumers need only `scene()`/`storyboard` + async `act`; the wild cases need at most
`awaitUser`. None needs a graph engine. **Every surface (incl. `scene()`, `drag`, all five gestures,
the theming tokens) is exercised by the v1 exemplar + stress battery (§15) — proof by exhaustive
exemplar, not by waiting for an outside consumer** (the scope decision, §16).

---

## 13. Package shape (open-source-ready, zero host deps)

This repo is **not** a monorepo (no root workspaces, no `packages/`); `docs/` is the ESM+React
package that consumes the engine. So Vetrina is a **self-contained folder**:

```
docs/src/lib/vetrina/
  stage.ts        theater: cursor, cues, chrome, reduced motion   (framework-free)
  runner.ts       run() + take-over + await-racing + teardown     (framework-free)
  storyboard.ts   Step[] data model → Walkthrough (storyboard())   (framework-free)
  scene.ts        the fluent recording builder scene() → Step[]    (framework-free)
  theme.ts        Theme token defaults + resolution (both modes)  (framework-free)
  recipes.ts      waitFor / loop / retry                          (framework-free)
  index.ts        the public surface (the tables above)
  react.ts        useWalkthrough(rootRef, opts) — the thin adapter (peer dep react)
  README.md       leads with scene() on a NON-slide, buildless page
```

**Decoupling is mechanical, not aspirational** (§14/Munger D2, the coupling-death antibody):
- an **import-boundary gate** (CI): `vetrina/**` may import nothing outside itself — no `../`, no
  lattice, no docs path. The equivalent of this repo's `check-ownership.js`.
- an **isolated build/test** job: it builds and tests with no repo root, proving "standalone" every
  commit.
- a **non-Studio "generic host" fixture** in the suite (different action names, two widgets on one
  page, a shadow root) so `resolve`'s scoping and any host-specific leak fail a test on day one.
- `resolve` is **root-scoped by default**; portalled targets (Radix menus/sheets) are reached via an
  explicit opt-in, not a blanket whole-document query (§14/Munger D2.1).

---

## 14. What the adversarial trio changed (the ledger)

The trio's net effect was to **subtract and harden** — exactly the Saint-Exupéry/Rams direction.

**Cut (bloat / dishonesty / invariant risk):**
- **C2 (red team)** — callback-valued `cues` + `cursor` factory: could emit real input → break I1/I2.
  **Removed.** Effects can be silenced or token-tuned, never replaced by DOM-touching code.
- **H3 (red team)** — `clock`/`random` "determinism" seam governed none of the real timing → dishonest.
  **Removed**; ships with the record consumer, done properly.
- **H2 (red team)** — the "storyboard is serializable/emailed" claim was false (`act` is a closure).
  **Claim dropped**; declarative-act is a documented future seam, not v1 surface.

**Hardened (safety made structural, not a discipline):**
- **C1/M1 (red team)** — `awaitUser` fully specified: guard never removed (non-match still takes over),
  mandatory timeout, Exit always live, replaces the beat's `act`, suppresses the resolving gesture's tail.
- **B-hole (checker)** — the runner **races every host await against the abort signal**; without it a
  taken-over run resumes onto a destroyed stage. Now an explicit engine mechanism (I6).
- **H1 (red team)** — the actions bag handed to `play` is an **abort-guarded proxy** (I8); `play()` is
  wrapped so a sync throw still tears down. The imperative escape hatch is no longer a downgrade of I2/I6.
- **Munger** — the **trust invariant**: `act` is awaited and the "look what rendered" circle + the
  completion toast are **gated on its success**; the theater may never confirm what substance didn't do.
- **checker** — restored `seed` + per-step `cadence`; pinned null-target-no-op, `say('')`-clears,
  reduced-motion-shortens-default-only; `onStop` after `destroy`; per-target type diff; type-coupled `TypeOps`.

**Refined (owner, post-trio):**
- The **human-not-machine tenet** (§2): pacing became a curated `speed: 'slow'|'moderate'|'fast'`
  preset instead of a free numeric, the `scale` multiplier was dropped (auto sizing), and pointer/glow
  customization was pinned to **shape + color from curated choices** — no dial may take a value the eye
  can't use.

**Reshaped (adoption / longevity):**
- **Munger D1/D3** — **lead with `storyboard`, escape-hatch the `Walkthrough`**; ship a **buildless,
  non-slide, framework-free** reference tour; ship **first-party recipes** so control-flow patterns
  don't fragment across userland.
- **Munger D2 / D4 / D7** — the coupling gate + isolated build + generic-host fixture (§13); root-scoped
  `resolve`; injectable `portalRoot`/`zIndex`; single-flight; SSR-safe (no DOM at import);
  a "lifecycle torture" test asserting I6 across unmount/background/resize/double-start/abort-mid-await.
  *(NB: a `visibilitychange` pause was DESIGNED here but is NOT implemented — corrected in §14-4. With
  the `until` timeout advancing-not-ending, the acute backgrounded-tab harm is defused; a real
  visibility-pause remains a future item, §16.)*

### §14-2 — the SECOND trio (on the grown design: layers, `scene()`, gestures/`drag`, theming)

A second red-team + Munger-inversion + independent-checker pass ran after the design grew. Verdict: the
**core held; the growth had outrun its proof and reintroduced holes** — but the fixes were local, not
architectural. The owner chose to keep the full surface and prove it by an **exhaustive exemplar + stress
battery** (§15.6, §16) rather than defer. What it changed:

**Correctness / safety (hardened structurally):**
- **F3 (security, was FALSE): I4 corrected.** `setProperty` does *not* stop `url()`-exfil at a sink → real
  defense is sink discipline + value validation + a host-trusted `Theme` trust boundary (I4, §9).
- **F4: `accent` validated to a legibility floor** — a pale/same-hue value can't render the cursor
  invisible (the co-stroke contrasts with the accent). The human-not-machine tenet applied to color (§9).
- **F2/F6: run-scoped typing state on `ctx`.** The typed-source baseline + `seed` + the `TypeOps`
  requirement live on the run, shared across segments — so I9 interleaving can't corrupt the type diff and
  the `TypeOps` coupling can't be laundered away through `scene()`/composition (I9, §7).
- **Munger: abort is terminal for NARRATION, not just actuation** — a caught `AbortError` can neither
  drive nor narrate onto a dead stage (I6c).
- **F5/F9: `drag` pinned** — its slot (positioning phase, `point`+`click` XOR `drag`), a **success-gated
  drop** (a failed `act` snaps back — the trust invariant), rects re-read at glide time (§6.1, §10).
- **F7: `intro` is a runner responsibility** (once per `run()`), so composition doesn't replay the wave (I9).
- **F10: nested `run()` throws a named error** (never a silent inert handle) (I6d).
- **F1/B: `scene()` step-boundary rule defined + `build()` ≡ `storyboard(seed, toData())` (one interpreter)
  + a parity test** — `scene()` and `Step[]` are now *provably* isomorphic; `Step.type` carries its
  target; `scene()` takes a seed (§10).
- **Battery-caught (the exemplar proof did its job): CSS-first was BROKEN by inline defaults.** The stage
  wrote every `--vt-*` default as an INLINE style on the overlay, and inline beats any selector — so a
  host's documented `:root { --vt-accent }` (§9) was silently ignored, defeating the whole CSS-first
  contract. **Fixed:** defaults are injected once per document in a low `@layer vetrina-defaults` on
  `:root`, which un-layered host CSS overrides for free (and the overlay inherits the resolved token);
  only the explicit JS `theme.tokens` stay inline. Proven by the theming exemplar reading computed
  `--vt-accent` off the live stage across a light→dark host mode flip. (Also folded in from the migration:
  the overlay is no longer `aria-hidden` wholesale — the Exit button reaches the a11y tree, the caption is
  a polite live region.)

**Structure / longevity:**
- **Munger: a build-failing `SANCTIONED_GESTURES` gate** freezes the alphabet at 5 (each entry a required
  *meaning*), the same `check-ownership` pattern the repo trusts for margins/hex/tokens (§6.1; HARD RULE #15).
- **Theming reconciled to CSS-first `--vt-*` + JS convenience** (§9): the token contract is a first-class
  CSS surface, the host cascade owns light/dark (dissolving the mode-switch race F8 and the chrome-color
  gap), the JS `Theme` stays as convenience. Matches the repo's own palette-blind doctrine (#3/#11).
- **Consistency sweep** — `storyboard` two-arg call sites, `effects`/`cues`/`theme` naming, an undefined
  `TypeOpts`, the `drag`-in-order gap, `scene()` added to the §12 coverage table.

### §14-3 — the THIRD trio (on the `instant` + `until` follow-up)

A red-team + Munger-inversion + independent-checker pass ran on the `instant`/`until` addition (it had
gone straight to code — the process miss that prompted the trio). Verdict: **the invariants held** (red
team + checker both traced I1/I2/I6/I8 through both new paths — take-over stays live during an `until`
poll, abort is terminal, the trust gate survives; no import cycle — `recipes` imports `runner`
*type-only*). `instant` was sound and earns its declarative slot. The findings were on `until`'s
robustness and `instant`'s ergonomics; all folded in:

- **`until` advanced SILENTLY on a hardcoded timeout** (red team #1) → desync onto an unready app. **Fixed:**
  `until` now uses a new STRICT `holdUntil` recipe that **throws on timeout** → `onStop('error')`, never a
  silent advance.
- **A throwing `until` predicate KILLED the run** (red team #2) — the idiomatic `() => el.dataset.ready`
  throws while `el` is null, exactly the state it waits through. **Fixed:** `holdUntil` (and `waitFor`) are
  **throw-safe** — a throwing predicate = "not ready yet".
- **`instant` silently voided `point`/`gesture`** (red team #3) → authored intent dropped with no signal.
  **Fixed:** the interpreter **warns** when an `instant` beat carries a positioning/gesture verb.
- **Munger: `until` duplicates `waitFor` / defer-until-a-consumer (§11).** Resolved by the owner's layering
  law — DSL › descriptor › **raw is the last resort**: a common need ("wait for a NON-async pollable
  condition") belongs in the descriptor so authors never reach for the low-level API. `until` is kept as the
  declarative surfacing of `holdUntil`; the "duplication" is the layering doing its job. The **non-async
  case is the justifying consumer**: an async `act` covers promise-readiness, but only polling covers a DOM
  flag with no promise.
- **Munger: a mostly-`instant` walkthrough betrays the "learn by watching" thesis.** Named as an **authoring
  tenet** (§2/§10): mostly-instant is a defect. (No gate — judgment.)
- **Coverage (checker):** added the normal-path `until` test, the throw-safe + timeout-throws tests, and the
  `instant`-warn assertion. Config knobs (custom `until` timeout / `onTimeout`) are **deferred** until a
  consumer needs them — the same §11 discipline, applied honestly this time.

### §14-4 — the FOURTH trio (re-verifying the §14-3 hardening)

A FINAL red-team + Munger-inversion + independent-checker pass ran on the §14-3 fixes themselves (the
user's call: re-verify the hardened winner). The **checker** found the code correct, tests non-vacuous, no
regression. But red team + Munger converged on the fact that the §14-3 *policy* choices, though correctly
implemented, were wrong — a case of fixing the bug and mis-choosing the default:

- **The `until` timeout policy was flipped again — this time to the right endpoint.** §14-3 made it THROW
  (end the run). Red team: that is **strictly worse** than the original silent-advance for the commonest
  real case — a viewer switches tabs for 15s (wall-clock elapses while polls are throttled), the gate
  throws, and the demo **self-destructs**; a legitimately slow/CI render also dies with no author escape.
  **Fixed:** on timeout `until` now **ADVANCES with a `console.warn`** — not silent (the original bug), not
  fatal (the §14-3 over-correction). The stable endpoint: advance + name the reason.
- **Throw-safety was misdiagnosing broken predicates.** The blanket `catch` swallowed a real `TypeError`
  as "not ready" → a 15s hang then a message blaming app-readiness. **Fixed:** the timeout warning now
  **names the last predicate error**, so a typo is diagnosed, not misattributed.
- **`holdUntil` was public — contradicting the very layering law used to keep `until`.** Munger: "keep
  `until` so authors don't reach for the low-level API," then the same commit EXPORTED a low-level poll-wait,
  leaving THREE public spellings (`until`, `waitFor`, `holdUntil`). **Fixed:** `holdUntil` is **un-exported**
  — the one public poll-wait is `waitFor`; `until` is the descriptor face; the layering claim is now true.
- **The `instant` verb-warn moved to BUILD time** (was per-play) — a kiosk attract-loop no longer spams it
  forever in the shipped bundle (red team).
- **Ordering:** on the normal path `until` now runs BEFORE the confirm gesture — a "look what rendered"
  gesture can't play before the thing it confirms exists.
- **Doc-drift corrected:** §14/D-family listed a "visibility-pause" as shipped; it was never implemented.
  With advance-on-timeout the backgrounded-tab harm is defused, so visibility-pause is recorded as a **real
  future item, NOT a shipped one** (see §16). `instant` stays ungated (a runtime instant-ratio warn would
  false-positive on legitimately setup-heavy kiosk paths — Munger's own counter-inversion); the "mostly-
  instant is a defect" tenet stays prose, to be surfaced in the visual-review report, not a runtime alarm.

---

## 15. Migration plan — behavior-preserving, the proof of the seam

1. Land `docs/src/lib/vetrina/` with the API above; port `demo-stage`→`stage`, `demo-director`→
   `runner`+`storyboard`+`scene`, `theme`, `recipes`. Behavior byte-identical where it should be.
2. Rewrite `use-studio-demo.ts` as a thin `react.ts` consumer of `run()`: pass the Studio actions bag,
   `TypeOps`, `takeover: { scope: 'window' }`, and `onStop` (palette/mode restore + close stages) —
   **after** destroy. Theming: the Studio's existing `--accent`/mode cascade feeds the `--vt-*` tokens
   directly (CSS-first), so the `toggleMode` beat re-resolves them for free — no mode-switch code.
3. `demo-storyboard.ts` becomes `storyboard(seed, [...])` input (data unchanged) — plus a parallel
   `scene(seed)…build()` authoring of the same deck with a **parity test** (byte-identical run trace)
   proving the `scene`↔`Step[]` isomorphism (§14-2).
4. **Engine test suite — each guarantee gets a direct test:** await-races-abort; abort-**terminal
   narration** (a `Walkthrough` that catches `AbortError` can neither drive nor narrate); `awaitUser`
   classifier + timeout + no-double-act; abort-guarded actions proxy; single-flight **named throw** +
   nested-`run()` refusal; reduced motion; cue silence; `accent` **validation** (invisible → normalized/
   rejected, `url()` → rejected); `drag` **success-gated drop** (failing `act` → snap-back); the
   `SANCTIONED_GESTURES` gate; and the **lifecycle + interleave torture** (unmount / background / resize /
   double-start / abort-mid-await, AND an interleaved raw `Walkthrough` + built segment + mid-run take-over).
5. Existing tests: `e2e/demo.spec.ts` (3 exit paths leave "My First Deck" behind, dedup) rides the real
   Studio — **unchanged**. `demo-director.test.ts` is **retargeted** (fusing anticipate+glide into
   `point()` changes its literal-log assertion) + **timing** assertions (register beat, render breath).
6. **The exemplar + stress battery — the v1 PROOF (the scope decision, §16).** v1 ships the full surface,
   so every surface is proven by a comprehensive in-repo exemplar with edge cases + stress — not by
   waiting for an outside consumer (HARD RULE #23: the exemplar *is* the exercising artifact):
   - **`scene()` linear demo** (+ the parity test, step 3).
   - **`Walkthrough` interleave** — branch + loop + built segments + a mid-run take-over.
   - **`awaitUser` hand-off** — the buildless, non-slide, framework-free vanilla reference tour: correct
     input, wrong input (still take-over), timeout.
   - **`drag` reorder** — portalled + scrolled targets, and a **failing `act`** (gated drop → snap-back + `cross`).
   - **gesture alphabet** — all five with their meanings, plus the reduced-motion collapse.
   - **theming** — a full CSS `--vt-*` rebrand across light/dark via the host cascade; the JS `Theme`
     convenience; an **invalid** `accent` (pale/same-hue + `url()`) proving validation + the legibility floor.
   - **generic-host + stress** — a non-Studio host (two widgets + a shadow root) proving decoupling; rapid
     take-over, backgrounding, resize, a long deck.
7. Ship the import-boundary gate + isolated build job + the `SANCTIONED_GESTURES` gate.

**Test tiers & what gates (the exemplar/stress battery is Playwright suites — but only the deterministic
ones block per-PR).** The repo's own discipline forbids flaky wall-clock gates in the merge train (why
`bench:check` is on-demand, why live-key E2E is nightly — HARD RULE #19/#24). So:
- **Unit tier (`node --test`, fast, always blocking):** the framework-free logic needing no browser —
  `scene()`≡`storyboard` parity, `accent` validation, the abort-guarded proxy, single-flight throw, the
  step-boundary rule, `TypeOps` coupling, the `SANCTIONED_GESTURES` registry.
- **Playwright e2e tier (real browser — HARD RULE #23):** the exemplars + stress. **Blocking per-PR = the
  DETERMINISTIC ones** that assert cause→effect on *state* (the `demo.spec.ts` idiom): the Studio
  migration, the `awaitUser` tour (correct/wrong/timeout), `drag` reorder + failing-act snap-back, gesture
  *presence*, the theming rebrand (assert computed `--vt-*`), generic-host decoupling, take-over paths,
  and the interleave+take-over torture. **Nightly / on-demand, NOT per-PR blocking = the timing/pixel
  stress** (exact cadence, tab-backgrounding, visual appearance) — made deterministic where possible
  (assert state, not pixels/wall-clock), else run off the merge train so it can't thrash the queue.
- **build:check ownership gates (blocking):** import-boundary, `SANCTIONED_GESTURES`, isolated-build.

---

## 16. Decisions & open forks

**Decided (after the second trio):**
- **v1 scope — keep the FULL surface, prove by exhaustive exemplar.** `scene()`, `drag`, all five
  gestures, `awaitUser`, the recipes, and the theming tokens **all ship in v1**; each is proven by the
  exemplar + stress battery (§15.6), not deferred. The owner's call — *"build it even if they won't come;
  prove it with comprehensive exemplars, edge cases, and stress tests"* — over the trio's
  defer-until-a-consumer recommendation. It satisfies the same standard (HARD RULE #23) a different way:
  the exemplars *are* the exercising artifact. The correctness fixes the trio found are folded in
  regardless (§14-2).
- **Theming — CSS-first `--vt-*` + JS convenience** (§9): the token contract is a first-class documented
  CSS surface; the JS `Theme` object is the zero-CSS convenience; light/dark rides the host's cascade.

**Still open (genuinely the human's):**
1. **Name** — `Vetrina` is the working name (chosen). Lock it, or revisit before publishing.
2. **The builder verb — `scene()`** (recommended; fits the theater metaphor, no collision with
   `run`/`storyboard`). Alternatives: `flow()`, `tour()`, `walkthrough()`. Worth locking before the
   exemplars are written — they use it throughout.
3. **Publish now or later?** v1 lands the package in-repo, decoupled and gated, but does not `npm
   publish`. *(Recommendation: prove it in-repo through the migration + the exemplar battery; publish once
   the API has settled under real use.)*
4. **Visibility-pause (future item, §14-4).** A `visibilitychange` pause — freeze the run's timers while
   the tab is hidden — was designed (§14/D7) but never built; with the `until` timeout advancing-not-ending
   the acute harm is gone, but a long backgrounded run still burns wall-clock. Worth adding when a real
   consumer runs long unattended (a kiosk/attract-loop). Config knobs for `until` (`timeout`/`onTimeout`)
   are deferred with it, per §11.
