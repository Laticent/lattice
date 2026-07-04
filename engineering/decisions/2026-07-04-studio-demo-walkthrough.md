---
status: shipped
summary: A long-wanted "demo that showcases the Studio" — the owner suggested driving the real UI with @testing-library/user-event since "it runs in a browser." That tool is wrong for a WATCHABLE demo: here it runs under jsdom (no real browser, no cursor), and even in a real browser it dispatches synthetic events that paint nothing a viewer can see. The chosen build is a self-driving in-app walkthrough — a parent-document fake cursor + captions (the "stage") plays a storyboard through the Studio's OWN state setters (the "director"), never synthetic DOM events. Cursor is theater; setters are substance. Because the only real input during a run is the viewer's, the first real click/keystroke unambiguously means "take over" and stops the demo. Verified on the real Studio in headless Chromium (compose → theme → mode → Coach 10.0 → Present → Share → restore) and on all three exit paths.
---

# Studio demo walkthrough — the app drives itself

**Ask (2026-07-04):** "one feature we talked about but never worked out is a demo
walkthrough that really showcases the Studio… a real walkthrough with mouse movement,
keystrokes and clicks using Testing Library's user-event — it's for testing but it runs
in the browser, so why not?"

## Why `@testing-library/user-event` is the wrong lever

The instinct — drive the real UI — is right; the tool is not.

1. **It doesn't run in a real browser here.** In this repo `user-event` runs under
   **vitest + jsdom**: a simulated DOM with no rendering, no cursor, no visible anything.
   It's built for assertions, not for showing.
2. **Even in a real browser it paints nothing.** `user-event` dispatches *synthetic DOM
   events* — a handler fires and state flips instantly. A viewer sees no cursor glide, no
   typing cadence, no click. There is nothing to *watch*.

What's needed for a showcase is the opposite: a *visible* cursor gliding, a typing
rhythm, a click ripple, narration — theater, not event simulation.

## The fork (owner chose "live in-app autoplay")

Three products hide under "demo walkthrough": a **recorded film** (cheapest, canned), a
**live in-app autoplay** (the real Studio drives itself, viewer can take over), and a
**click-through tour** (driver.js coach-marks — which the `2026-06-30` / `2026-07-03`
onboarding decisions deliberately chose *against* for the Studio). The owner picked the
live in-app autoplay: the most "true" surface, and — being a first-visitor *showcase*,
not onboarding for a committed user — it doesn't conflict with those decisions.

## Architecture — cursor is theater, setters are substance

StudioShell has **no external seam**: no `forwardRef`, no imperative handle, no context;
every state setter lives in the component closure. So the demo is **born inside**
StudioShell, via a hook (`use-studio-demo.ts`) that closes over the real setters. Three
framework-free pieces do the work:

- **`demo-stage.ts`** — the parent-document theater layer (mirrors the `video-overlay.js`
  singleton idiom): a `position:fixed`, `pointer-events:none` fake cursor that glides with
  an eased tween, a click ripple, a narration caption, and the "▶ Demo · click anywhere to
  take over · Exit" chrome. The only pointer-interactive node is the Exit button.
- **`demo-director.ts`** — a framework-free sequencer over a storyboard of steps,
  interpreted in a fixed order: **say → point → click → act → type → settle**. `act`
  closures poke the Studio's real setters; `type` animates the deck by calling `setSource`
  with a growing string (which, by design, does *not* trip the Studio's first-user-edit
  reveal — Editor line ~277 only fires `onUserEdit` on genuine keystroke transactions).
- **`demo-storyboard.ts`** — the script (data). Reuses the exec-board-update journey (a
  Q4 board deck the Coach scores board-ready), so the demo showcases a **real,
  deterministic** success path with **no AI call and no key spend** (HARD RULE #24).

**The load-bearing decision:** the cursor NEVER dispatches the action. It only shows
*where* an action lands (a selector locates the element to point at); the real change
always happens through `act` (a setter). This is what makes the whole thing robust *and*
makes "take over" unambiguous — see below.

## Take-over, safety, and restore

Because the director drives state through setters (never synthetic input), the **only**
real pointer/keydown events during a run come from the viewer. So a capture-phase
`pointerdown`/`keydown` listener that isn't on the demo chrome means exactly one thing:
the viewer wants to drive. It stops the demo instantly, the click falls through to the
control they aimed at.

The demo types its sample deck into the **real** `source`, which means two things had to
be handled so it never eats the viewer's work (both caught in maker-checker review):

1. **Persistence stands down for the run.** StudioShell autosaves `source` to
   `localStorage` on a 400 ms debounce (and on the backup/unload flush). Left alone, the
   demo's board deck would be written over the viewer's stored deck — permanently if they
   reloaded mid-demo. A `demoActiveRef` gates both save paths for the duration; it's
   cleared inside `stop()` *before* the restore write, so the healing `setSource` re-saves
   the viewer's own deck.
2. **Every exit restores.** The run snapshots `source`, the active palette *name* (from
   state, so a saved theme restores correctly — not just `data-palette`), and mode.
   **Completion, Exit, take-over, AND Escape** all restore them. There is no "keep the
   sample" path: leaving the demo deck behind would let it persist over the viewer's real
   deck the moment they typed. Escape is the instinctive cancel, so it restores rather
   than stranding the sample.

`prefers-reduced-motion` collapses the glide/typing animation to instant placement.

## Entry points

A topbar "Watch demo" button (hidden while a demo runs), a primary action on the
first-run welcome banner, and a ⌘K command — all calling one `startDemo()`.

## Why not the surviving `driver.js` tour engine

`guided-tour.js` (which survives for the Playground) spotlights static DOM by selector
and is production-gated (it fails closed on dev/preview so its overlay can't trap input).
A *self-driving* demo needs the opposite: it must *change* state over time, animate a
cursor between controls, and run everywhere (including where we verify it). Different job,
different machine.

## Verification (HARD RULE #23)

Driven on the **real** Studio in headless Chromium (puppeteer, 1440×900) against the dev
server — not a jsdom harness:

- **Full run:** typed the title slide → typed the full 6-slide deck → navigated slides →
  switched theme to Cuoio → flipped to dark → opened the Coach (**10.0 / 10 board-ready**)
  → opened Present → opened Share → closing caption → **completed and restored** to the
  original welcome deck in Indaco/Light.
- **Take-over:** a real click mid-run removed the stage and left the deck ("you have the
  deck — build away").
- **Exit:** the Exit button removed the stage and restored the deck.

The director's sequencing, typing-to-target, abort, and no-synthetic-keystroke guarantees
are also covered by unit tests (`demo-director.test.ts`) and a real-surface e2e
(`e2e/demo.spec.ts`, runs in CI where Playwright is installed).

*Not verified here:* a full recorded video clip — `ffmpeg` (puppeteer's screencast
backend) isn't installed in this sandbox; the run was captured as frame stills instead.

## Known limitations

- **Tablet theme beat is cursor-less.** At the `compact` breakpoint (tablet, where the
  Watch-demo button is still offered) the Inspector is a Radix `Sheet` portaled to `body`
  — outside `rootRef` — so the "reskin the deck" step can't resolve its cursor target. The
  director handles the null gracefully (it skips the move and still runs the theme change),
  so the beat degrades to "theme changes without a cursor glide," never a crash. The demo
  is a desktop-first showcase; a tablet-aware target is deferred.
