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

## The shipped shape — arc, cue grammar, drivers (review-evolved)

The demo grew from "compose → coach → ship" into a full ~90-second first-time arc, and
the theater grew a small vocabulary. Both were tuned live against the real preview.

**The arc:** open the deck menu → **New deck** (the "how do I even start?" beat — a *faked*
new deck: it blanks the canvas and toasts, but never calls `createDeck`, so nothing
persists) → type a board deck out live → navigate slides → reskin with a theme → flip
light/dark → Architect Coach scores it board-ready → Present → Share → **closing flourish**
(polish the title via its own settings drawer: a Nimbus finish + a WIP bracket status —
one changed `_class` line — then slam into Present full-screen on the glowing hero).

**Cue grammar (two primitives).** A soft *ping* + a *streak* anticipate where the cursor is
headed (leading the eye before it moves); a sharp *burst* confirms each click; a
*circle-and-glow* marks the "look what rendered" beats. Every ring pairs the brand accent
with a white co-stroke so it reads on the navy preview AND the light chrome. Sizes and
speeds are tuned to be *followable* — the same call we made for the typing.

**Typing drives CodeMirror natively.** The director types through
`EditorHandle.typeTail` (a real tail-insert transaction that scrolls to follow), not a
full-doc `setSource` per keystroke — so the caret + scroll behave like real typing and the
change flows back through the editor's own `onChange`. A periodic "render breath" (a pause
past the preview's ~140 ms debounce) keeps the preview repainting mid-slide, so editor and
preview stay in sync instead of the preview freezing on the prior slide during a burst.

**New drivers, all real.** The storyboard reaches the deck switcher (a controlled Radix
menu), the per-slide settings drawer (`setNotesOpen` + the drawer's own `mutateActiveSlide`
funnel, applying the real `setFinish` / `setGroupToken` / `setStampStyle` transforms), and
`notify`. The stage resolves selectors against the whole document (Radix menus/sheets
portal to `<body>`, outside the Studio root).

## Why not the surviving `driver.js` tour engine

`guided-tour.js` (which survives for the Playground) spotlights static DOM by selector
and is production-gated (it fails closed on dev/preview so its overlay can't trap input).
A *self-driving* demo needs the opposite: it must *change* state over time, animate a
cursor between controls, and run everywhere (including where we verify it). Different job,
different machine.

## Verification (HARD RULE #23)

Driven on the **real** Studio in headless Chromium (puppeteer, 1440×900) against the dev
server — not a jsdom harness:

- **Full run (~82 s, motion enabled via `emulateMediaFeatures` — the earlier
  `--force-prefers-reduced-motion` flag forced reduce *on*, so it must be set explicitly):**
  opened the deck menu → New deck (deck list stays 3, no persistent create) → typed the
  6-slide board deck (preview repainting each slide mid-typing) → navigated → Cuoio → dark
  → Coach **10.0 / 10 board-ready** → Present → Share → **polished the title via the drawer**
  (`_class: title finish-nimbus wip stamp-bracket` — Nimbus glow + `[ WIP ]` bracket render)
  → **Present full-screen on the polished hero** → **completed and restored**.
- **Take-over:** a real click mid-run removed the stage and left the deck ("you have the
  deck — build away").
- **Exit:** the Exit button removed the stage and restored the deck.

The director's sequencing, typing-to-target, abort, and no-synthetic-keystroke guarantees
are also covered by unit tests (`demo-director.test.ts`) and a real-surface e2e
(`e2e/demo.spec.ts`, runs in CI where Playwright is installed).

*Not verified here:* a full recorded video clip — `ffmpeg` (puppeteer's screencast
backend) isn't installed in this sandbox; the run was captured as frame stills instead.

## Known limitations

- **Desktop + tablet only; phone is backlogged (#758).** The demo choreographs a cursor
  across the **side-by-side editor + preview** layout. A phone (≤699px) renders a single
  swappable Edit ⇄ Preview pane, where the storyboard's targets (`#studio-pane-editor`, the
  `data-demo` Present/Share buttons) don't exist — so the Watch-demo button is `!mobile`-gated
  (hidden on phone). iPad falls in the tablet band and gets the side-by-side layout, so it
  works. A phone-native storyboard (drive the pane-swap + the sheets) is tracked in **#758**;
  it must be verified on a **real iPhone** (HARD RULE #23 — 390px Chromium emulation isn't iOS).
- **Portaled targets are reachable.** The stage resolves selectors against the whole document
  (`root.ownerDocument`), so Radix menus/sheets/dialogs that portal to `<body>` (the deck
  switcher, the Inspector/settings sheets) are found — no longer scoped to the Studio subtree.
