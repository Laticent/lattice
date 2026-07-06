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
  type→circle→settle). Serializable and programmatically **generable** (you `.map()` data) — this is
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

---

## 4. Invariants (non-negotiable; hardened by the trio)

- **I1 — The engine emits no synthetic input.** Vetrina never dispatches a real pointer/keyboard
  event at the host. *(This is why §9 forbids callback-valued effects: a cue that received the live
  element could call `.click()` and break I1 — see §14/C2.)*
- **I2 — Unambiguous, instant take-over.** The first real off-stage input aborts the run and falls
  through. Instant because **every await races the abort signal** (I6). Opt-out per beat only via
  `awaitUser` (§8), which keeps a classifier guard live — it never blinds the engine.
- **I3 — Framework-free core.** `runner` + `stage` + `storyboard` depend on the DOM only. React/Vue/…
  adapters are thin and live outside the core. *(Enforced by an import-boundary gate — §12.)*
- **I4 — Captions are text; the engine injects no host HTML.** Captions set `textContent`, never
  `innerHTML`. Host-supplied rich content that reaches a frame is the host's to sanitize (lattice
  HARD RULE #22). The `accent` token is applied via `style.setProperty('--accent', v)` — **never**
  concatenated into `cssText` (which would be a CSS-injection / `url()`-exfil sink; §14/H3).
- **I5 — Reduced motion is honored.** `prefers-reduced-motion` collapses glide + typing to instant
  placement; the run still completes and narrates. *(It shortens the **default** settle only — an
  explicit `settle: 3200` is still honored; §14/checker.)*
- **I6 — Idempotent teardown, structurally enforced.** Every terminal path (complete / take-over /
  exit / unmount / error / sync-throw / abort-mid-await) routes through one `stop(reason)`. The
  runner: (a) **races every host await** (`act`, `awaitUser`) against the abort signal, so a
  taken-over run can never resume onto a destroyed stage; (b) wraps `play()` so a **synchronous
  throw** still tears down; (c) makes **Stage methods no-op after `destroy()`**; (d) is
  **single-flight** — a second `run()` while one is active is refused. Teardown removes every node,
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
  play: Walkthrough<A>;                    // usually storyboard([...]) (§10)
  onStop?: (reason: StopReason) => void;   // host restore, called AFTER destroy (I7)
  theme?: Theme;                           // JS token values; omit for the house look (§9)
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

interface Stage {
  say(text: string): void;              // caption; textContent only; '' CLEARS, undefined LEAVES it
  point(target: Target): Promise<void>; // anticipation cue -> (register beat) -> eased glide
  press(): Promise<void>;               // click burst at the cursor (theater; pair with act)
  circle(target: Target): Promise<void>;// frame glow + orbit — the "look what rendered" confirm
  intro(): Promise<void>;               // opening flourish (cursor materializes, waves)
  resolve(target: Target): HTMLElement | null; // scoped to root by DEFAULT; portals opt-in (§12)
  readonly reduced: boolean;
  contains(node: EventTarget | null): boolean; // is this the stage's own chrome (Exit)?
  destroy(): void;                      // idempotent; methods no-op afterward (I6)
}
```

Semantics pinned against the shipping code so a port can't silently regress:
- **A null-resolving `point`/`circle` is a NO-OP** — no wait, no throw, no hang (selectors *do* miss
  on portal timing). *(§14/checker.)*
- **`point` preserves the register beat** — the ~480 ms pause between the anticipation cue and the
  glide that lets the eye lead the cursor. Fused into `point()` but not dropped; asserted by a
  *timing* test, not just an order test (§14/M3).
- Every Stage animation races the run's `AbortSignal` and rejects `AbortError` on take-over.

---

## 7. Typing — an optional capability, not a core verb

"Type into a CodeMirror tail" is host-specific. Typing = drive a target string through host ops at a
human cadence, honoring reduced motion:

```ts
interface TypeOps { set(text: string): void; append(text: string): void; }
```

- The cadence, whitespace-chunking, ±40% jitter, and the **"render breath"** (a longer pause every
  ~38 chars, past a preview's ~140 ms debounce, so editor and preview stay in sync) live in the
  engine. *How text lands* is the host's `TypeOps`. Preserves Studio's native-editor-insert exactly.
- **Typing is coupled to `TypeOps` at the type level**: a `play` that uses `type` is only accepted by
  a `run()` given `TypeOps`. No mid-run "throws if called" bomb (§14/M4).
- The `commonPrefix` diff keys prior text **per target**, so an imperative walkthrough may type into
  two fields without cross-contamination (§14/checker).

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

## 9. Customizable effects — the Rams seam (smaller after the trio)

Zero config = the house look. Every field is **description, never a callback, and never a free
numeric a caller could set to a useless value** (the human-not-machine tenet, §2). Customization is
exactly this:

```ts
interface Theme {
  // COLOR — token VALUES passed via JS (never CSS you author). `accent` is the one-line shortcut
  // (both modes); `light`/`dark` are full per-mode overrides. Vetrina writes these into its own
  // custom properties for you — you never touch a stylesheet, class, or @media block.
  accent?: string;                          // brand hue for pointer + cues + glow (both modes)
  light?: Partial<ColorTokens>;             // per-mode overrides, as VALUES
  dark?: Partial<ColorTokens>;
  // NON-COLOR — curated, human-not-machine (no free numerics)
  speed?: 'slow' | 'moderate' | 'fast';     // guaranteed-followable pacing (default 'moderate')
  pointer?: 'arrow' | 'ring' | 'dot';       // curated cursor SHAPE (default 'arrow')
  cues?: Partial<Record<'anticipate' | 'press' | 'circle' | 'intro', false>>; // SILENCE a cue
  // MOUNTING
  portalRoot?: HTMLElement;                 // where the overlay mounts (default document.body)
  zIndex?: number;
}
interface ColorTokens {                     // the token CONTRACT — the names Vetrina defines
  accent: string; cursorFill: string; cursorStroke: string;
  captionBg: string; captionInk: string; ringHalo: string;
}
```

A token value may itself be a CSS-var reference — `accent: 'var(--brand-accent)'` — so a host with
existing design tokens can point at them without Vetrina ever reading their stylesheet. Still JS, still
one surface.

**Palette-blind under the hood (carries lattice's DNA), but JS is the only surface.** Internally the
engine renders every color through a `var(--vt-*)` role token with a sensible default — **no hex
literals in its own theater CSS** (HARD RULE #3 applied to itself), named by role not scheme (HARD RULE
#11): `--vt-accent`, `--vt-cursor-fill`, `--vt-cursor-stroke`, `--vt-caption-bg`, `--vt-caption-ink`,
`--vt-ring-halo`. But those properties are a **mechanism, not a public authoring surface** — Vetrina
writes your JS `Theme` values into them via `setProperty` (never string concatenation — I4). **The
consumer's only surface is the JS `Theme` object; there is no CSS to author, no class, no `@media`
block.** Configure nothing → the house look; pass `accent` → one line; pass `light`/`dark` value sets
→ full control.

**Light/dark: you supply both palettes as JS values; Vetrina switches.** Vetrina ships sensible
defaults for both modes; you override by passing `light` and/or `dark` value sets on the `Theme`
object — **as data, not CSS.** Vetrina applies whichever set matches the active mode. The one pinned
decision — **what counts as "dark":** an app's mode ≠ the OS's (the Studio flips its own mode
independent of `prefers-color-scheme`), so the active mode is **host-authoritative** — Vetrina reads
it from a signal the host controls (a `data-vt-mode` on the overlay root, or the host tells the
engine), falling back to `prefers-color-scheme` **only when the host gives no signal.** Beneath it
sits a **legibility floor**: the baseline defaults read on either ground (accent + white co-stroke +
dark caption scrim — proven by the Studio demo flipping light↔dark mid-run without washing out), so a
missing or wrong mode signal never makes the overlay illegible. The **host owns the app's palette** —
Vetrina drives the mode toggle via a host action (the demo's `toggleMode` beat), never managing the
app's theme itself.

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

Result: house look → pass nothing; brand → set `accent` (one line); slower/faster → `speed: 'slow'`;
a different cursor → `pointer: 'ring'`; drop a cue → `cues: { intro: false }`. Every field optional,
honest, and human-followable by construction.

---

## 10. Authoring — the data model and the fluent builder

**The data model — `Step[]`** (the serializable/generable representation):

```ts
interface Step<A> {
  say?: string; point?: Target; click?: boolean;
  act?: (a: A) => void | Promise<void>;   // async allowed; the runner awaits it (races abort — I6)
  type?: string; cadence?: number;         // per-step ms/char (load-bearing: 7 vs 24 drives the pace)
  circle?: Target; settle?: number;
}

function storyboard<A>(seed: string, steps: Step<A>[]): Walkthrough<A>; // data → primitive
```

- Fixed interpretation order per step: **say → point → click → act → type → circle → settle** — so a
  storyboard reads top-to-bottom as intent.
- **`act` runs (awaited) BEFORE the `circle` confirm**, and a **rejected `act` suppresses the
  success narration** and routes to `onStop('error')` — the theater must never circle "look what
  rendered" around a change that failed (§14/Munger, the trust invariant).
- `seed` and per-step `cadence` are **first-class** (the candidate dropped them; both are load-bearing
  for the migrated Studio demo — §14/checker).
- Type inference: annotate once — `storyboard<StudioActions>(seed, [...])` — or let `A` bind from
  `run({ actions })`; without it, `act` params fall back to `any` (§14/checker).

**The fluent builder — `scene()`** (the recommended hand-authoring surface). A **recording** builder:
each verb call appends a step and returns `this`; nothing executes until the built `Walkthrough` is
passed to `run()`. It emits the same `Step[]`, so serialization/generation survive.

```ts
function scene<A>(): SceneBuilder<A>;
interface SceneBuilder<A> {
  say(text: string): this;
  point(t: Target): this;  click(): this;  circle(t: Target): this;
  act(fn: (a: A) => void | Promise<void>): this;
  type(t: Target, text: string, opts?: { cadence?: number }): this;
  hold(ms: number): this;                 // = a step's `settle`
  build(): Walkthrough<A>;                 // → primitive; compose via `await scene(...).build()(ctx)`
  toData(): Step<A>[];                     // → the data model (wire / inspection / generation)
}
```

- **`scene()` is sugar over `Step[]`, which is sugar over the primitive** — three views of one thing,
  not three semantics. `scene().build()` and `storyboard(seed, steps)` both return a `Walkthrough`.
- It stays **linear by construction** (a recording chain can't hold an `if`). That is deliberate: the
  moment a walkthrough needs branch/loop/`awaitUser`, you drop to the primitive `Walkthrough(ctx)` and
  `await` built `scene` segments between the raw beats (I9). The builder never has to be complete
  because the primitive always is.
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
| **Studio demo (v1 migration)** | `storyboard(seed, [...])` + actions + `TypeOps` | none |
| **Show-don't-tell docs** | `storyboard([...])` + a docs actions bag | none |
| **Emailed-deck presenter** | `storyboard([...])`, no `TypeOps`, host loops via `loop` recipe | none |
| **Narrate AI edits** | `Walkthrough` fn; `act` awaits the real edit (runner races abort) | none |
| Guided support / tutorial | `Walkthrough` fn + `awaitUser` + `takeover.scope: 'root'` | `awaitUser` |
| Trust-preview "confirm before commit" | `Walkthrough` fn + `awaitUser` + host `if` | `awaitUser` |
| Kiosk attract-loop | `loop` recipe + `storyboard`; reset in `onStop` | none |

The four named consumers need only `storyboard` + async `act`. The hardest wild cases need at most
`awaitUser`. None needs a graph engine.

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
  visibility-pause; a "lifecycle torture" test asserting I6 across unmount/background/resize/double-start/
  abort-mid-await.

---

## 15. Migration plan — behavior-preserving, the proof of the seam

1. Land `docs/src/lib/vetrina/` with the API above; port `demo-stage`→`stage`, `demo-director`→
   `runner`+`storyboard`+`scene`, `theme`, `recipes`. Behavior byte-identical where it should be.
2. Rewrite `use-studio-demo.ts` as a thin `react.ts` consumer of `run()`: pass the Studio actions bag,
   `TypeOps` (`typeTail`/`resetDoc`), `takeover: { scope: 'window' }`, and `onStop` (palette/mode
   restore + close stages) — **after** destroy.
3. `demo-storyboard.ts` becomes `storyboard(seed, [...])` input — the data is unchanged.
4. Tests: `e2e/demo.spec.ts` (3 exit paths leave "My First Deck" behind, dedup) rides the real Studio —
   **unchanged**. `demo-director.test.ts` is **retargeted** (honestly: fusing anticipate+glide into
   `point()` changes its literal-log assertion) and gains **timing** assertions for the register beat +
   render breath. New engine tests: await-races-abort, `awaitUser` classifier + timeout + no-double-act,
   abort-guarded actions proxy, single-flight, reduced-motion, effects silence, and the lifecycle torture.
5. Add the non-Studio vanilla reference tour + the import-boundary gate + isolated build job.

---

## 16. Open forks for the human

1. **Name** — `Vetrina` is the working name (chosen). Lock it, or revisit before anything is published.
2. **The builder verb — `scene()`?** The fluent authoring layer needs a name; `scene()` fits the
   theater metaphor and doesn't collide with `run`/`storyboard`. Alternatives: `flow()`, `walkthrough()`,
   `tour()`. *(Recommendation: `scene()`.)*
3. **Ship `awaitUser` in v1, or defer it?** It is the one new primitive and the Studio demo doesn't
   exercise it; shipping it means also shipping the vanilla reference consumer that does (so it isn't
   unproven). Deferring keeps v1 to exactly the Studio migration. *(Recommendation: ship it with the
   reference tour — the seam is the point of the whole exercise, and an unexercised primitive rots.)*
4. **First-party recipes in v1, or wait for a second consumer to prove the need?** *(Recommendation:
   ship `waitFor` + `loop`; hold `retry` until asked — subtract until needed.)*
5. **Publish now or later?** v1 lands the package in-repo, decoupled and gated, but does not `npm
   publish`. *(Recommendation: prove it in-repo through the Studio migration + the reference tour,
   publish once a second real consumer exists.)*
