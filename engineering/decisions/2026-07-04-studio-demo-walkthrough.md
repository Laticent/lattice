---
status: shipped
summary: A long-wanted "demo that showcases the Studio" — the owner suggested driving the real UI with @testing-library/user-event since "it runs in a browser." That tool is wrong for a WATCHABLE demo: here it runs under jsdom (no real browser, no cursor), and even in a real browser it dispatches synthetic events that paint nothing a viewer can see. The chosen build is a self-driving in-app walkthrough — a parent-document fake cursor + captions (the "stage") plays a storyboard through the Studio's OWN state setters (the "director"), never synthetic DOM events. Cursor is theater; setters are substance. Because the only real input during a run is the viewer's, the first real click/keystroke unambiguously means "take over" and stops the demo. Verified on the real Studio in headless Chromium (new deck → compose → theme → mode → Coach 10.0 → Present → Share → polish → Present) and on all three exit paths. The walkthrough builds a real, persisted "My First Deck" and leaves it behind for the newcomer — deduped like a test fixture (any prior one deleted first) so a re-run never accumulates duplicates.
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

The demo never touches the viewer's own deck. Instead of typing its sample into whatever
deck is open, its opening beat mints a **fresh, real deck** ("My First Deck") and switches
to it, so everything the cursor types lands there — the viewer's current deck is never the
canvas. Two properties follow, both framed like a unit-test fixture:

1. **The deck is a real, deduped `createDeck` — beforeSetup, not afterSetup.** The "New
   deck" beat calls `createDemoFirstDeck`, which **deletes any existing "My First Deck"
   first** (a beforeSetup clean-up), then `createDeck`s a blank one and switches to it. So
   the flow *always* creates the deck, existing ones get cleaned up, and re-running the
   walkthrough never accumulates duplicates — there is always exactly one. Because it's a
   real deck, StudioShell's autosave persists the typed board content to it normally (no
   `demoActiveRef` gate — there's nothing to protect the viewer *from* anymore).
2. **The deck is left behind; only the global flourishes are restored.** The newcomer walks
   away with "My First Deck" fully built — that's the payoff of the first-time arc. What
   *does* get restored on every exit (completion, Exit, take-over, Escape) is the demo's
   purely-cosmetic global changes: it reskins to Cuoio and flips light/dark for show, so
   `stop()` snapshots the palette *name* (from state, so a saved theme restores correctly —
   not just `data-palette`) and mode, and puts both back. It also closes any stage the demo
   left open (Present / Share / the settings drawer).

`prefers-reduced-motion` collapses the glide/typing animation to instant placement.

## Entry points

A topbar "Watch demo" button (hidden while a demo runs), a primary action on the
first-run welcome banner, and a ⌘K command — all calling one `startDemo()`.

## The shipped shape — arc, cue grammar, drivers (review-evolved)

The demo grew from "compose → coach → ship" into a full ~90-second first-time arc, and
the theater grew a small vocabulary. Both were tuned live against the real preview.

**The arc:** open the deck menu → **New deck** (the "how do I even start?" beat — a *real*
new deck, "My First Deck": deduped, `createDeck`d, switched to, and left behind for the
newcomer) → type a board deck out live → navigate slides → reskin with a theme → flip
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

*The seed-append race (iPad).* `typeTail` appends at the doc's current end. "My First Deck"
is created via `createDeck`, which seeds `NEW_DECK_TEMPLATE` (a `<!-- _class: title -->`
starter); `createDemoFirstDeck` then blanks the canvas with `setSource('')`. But `setSource`
reaches the editor only through the async `value`-prop sync — and on a slow surface (real
iPad Safari) that can lag the first `typeTail`, which then appends the board deck AFTER the
seed. Two `_class: title` comments land in slide 1 → `readClassDirective` sees a duplicate →
the slide's settings drawer goes read-only (only Notes/Comments; no Look/Status/Decoration/
Chrome), so the closing flourish can't show finishes at all. Fixed by adding
`EditorHandle.resetDoc(text)` — a SYNCHRONOUS whole-doc replace via a direct view dispatch —
and calling `resetDoc('')` in `createDemoFirstDeck`, so the canvas is provably empty before
the first keystroke regardless of the value-sync's timing. Reproduced-clean in headless
Chromium at desktop / tablet / mobile on dev AND the production build (every slide keeps a
single `_class`, all six drawer tabs render); the failing surface itself — iPad/iPadOS
Safari — is **UNVERIFIED** here (not reachable from the sandbox, HARD RULE #23), so the
on-device confirmation is owed.

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

- **Full run (motion enabled via `emulateMediaFeatures` — the earlier
  `--force-prefers-reduced-motion` flag forced reduce *on*, so it must be set explicitly):**
  opened the deck menu → New deck (a **real** "My First Deck" `createDeck`d + switched to —
  deck list goes 3 → 4) → typed the 6-slide board deck INTO it (preview repainting each slide
  mid-typing) → navigated → Cuoio → dark → Coach **10.0 / 10 board-ready** → Present → Share →
  **polished the title via the drawer** (`_class: title finish-nimbus wip stamp-bracket` —
  Nimbus glow + `[ WIP ]` bracket render) → **Present full-screen on the polished hero** →
  **completed**. On completion the stage tore itself down, the persisted "My First Deck" held
  the **full 6-slide** deck (title → closing), and the palette + mode flourishes were restored
  (Cuoio → Indaco, dark → light).
- **No duplication (beforeSetup dedup):** ran the walkthrough **twice** back-to-back; after
  each run the deck index held **exactly one** "My First Deck" (the second run deleted the
  first before recreating). The deck is left behind both times — never doubled.
- **Take-over:** a real click mid-run removed the stage and **left "My First Deck" behind**
  with what had been typed so far; palette + mode restored.

The director's sequencing, typing-to-target, abort, and no-synthetic-keystroke guarantees
are also covered by unit tests (`demo-director.test.ts`) and a real-surface e2e
(`e2e/demo.spec.ts`, runs in CI where Playwright is installed).

*Not verified here:* a full recorded video clip — `ffmpeg` (puppeteer's screencast
backend) isn't installed in this sandbox; the run was captured as frame stills instead.

## Phone-native (single-pane) demo — the preview-first rethink (#758)

The desktop demo's engine is **simultaneity**: editor left, preview right, *watch the slide
render as you type*. That is the whole "look how easy" beat — and it **does not survive** a
phone. A phone (≤699px) shows **one pane at a time** (`mobilePane: 'edit' | 'preview'`,
default `preview`), so simultaneity is physically impossible. You cannot port the
choreography; you replace simultaneity with a **rhythm**.

**The chosen model — per-slide alternation, preview as the star.** The demo taps the real
Edit/Preview toggle (a real setter, `setMobilePane` — theater stays honest, no synthetic
input, no new Vetrina primitive) and the viewer's attention **alternates** instead of
splitting: *type a slide on Edit → swap to Preview to reveal it → repeat.* The owner picked
per-slide alternation over a two-act cut (type once, then preview-only) for the maximal
"you write it, it renders" authoring feel; each swap is a **narrated reveal beat** with a
**fast** typing burst so the Edit dwell is brief and the flip reads as intentional, not a
flail.

**A tighter, phone-specific deck — 4 slides, each a showpiece.** A phone viewer's patience
is short and nobody thumb-types a 6-slide board deck, so the mobile "My First Deck" is its
own tight deck, not the desktop 6-slider: **title → `big-number` (one punchy metric) →
`radar` (a chart — the strongest "wait, that came from *Markdown*?" moment, chart-family so
it's deterministic with no key spend) → `closing`.** Four slides ≈ eight pane-swaps, and
each slide earns its screen time. (Swap the `radar` for a `matrix-2x2` if a 2×2 reads better
on a given device — a one-line change.)

**The load-bearing constraint — the editor UNMOUNTS on swap.** The mobile pane is
conditionally rendered (`mobilePane === 'edit' ? editorPane : previewPane`), so `#studio-pane-editor`
and its CodeMirror view are **absent while Preview is showing**. Two consequences drive the
beat grammar:

1. **Typing happens only while Edit is mounted.** After a swap *back* to Edit the editor
   remounts and re-inits its doc from `value` (the `source` state, which `typeTail`'s
   `onChange` has been keeping current) — so the accumulated slides survive the unmount. But
   `editorRef.current` is null until the remount effect runs, so each type beat is gated by
   **`until(() => editor is mounted)`** (a parent-DOM probe for `#studio-pane-editor .cm-content`)
   before it calls `typeTail`. This is the exact consumer `until` was built for.
2. **The reveal must wait for the real PAINT, not a settle.** The pane swap REMOUNTS the
   preview (a fresh iframe that reloads + re-renders), and a fixed settle races that reload —
   you swap to Preview, it's still blank, and you swap away before the slide paints (you never
   see it render). So each reveal is gated by **`until(() => previewPainted())`** — a probe of
   the preview's own document (`[aria-label="Live deck preview"] iframe` → `.lattice` has
   content). The preview is a SAME-ORIGIN srcdoc frame (component-transformer threat model
   §5.1), so it's readable from the parent; this is a deliberate, justified exception to the
   desktop storyboard's "no preview-iframe coupling" rule, because on mobile the iframe genuinely
   reloads on every swap and only its own paint is the truth. A ~1.6s linger settle then holds on
   the rendered slide so it registers. (Desktop's build beats keep `railReady(k)` — its preview
   never remounts, so parse + a linger is enough.)

**Selectors — mostly already there.** The pane toggle exposes `aria-label="Edit"` /
`"Preview"`; the deck switcher (`data-demo="deck-switcher"`) and New-deck item
(`data-demo="new-deck"`) are not mobile-gated; Present / Share / Toggle Architect / Slide
settings all carry aria-labels on the mobile pane bar; the theme picker
(`aria-label="Choose theme"`) renders inside the Inspector **sheet** and is reachable because
the stage resolves against the whole document. The reskin / mode / Coach / Present / Share
beats therefore reuse the same setters as desktop — only the pane-swap beats and the deck are
new.

**Entry point.** The `!mobile` gate on the Watch-demo affordance is lifted for phone (welcome
banner + pane bar), still hidden while a run is active. `useStudioDemo` selects the mobile vs
desktop storyboard by breakpoint and resets `mobilePane` on start/stop.

**Verification (HARD RULE #23).** Mount/unmount, typing, pane-swap, and render are **not**
iOS-specific, so headless Chromium at 390px is *valid* verification of the mechanics — and is
where the editor-remount timing was nailed down. What Chromium can **not** stand in for is
real **touch**, iOS sheet behavior, and the nested transform-scaled iframe traps
(`engineering/gotchas.md`); that sign-off is **owed on a real iPhone** and ships marked
**UNVERIFIED** until someone drives it on a device — the same standing debt as the iPad
value-sync race above.

## Known limitations

- **Phone sign-off is owed on a real device.** The phone-native demo (above) is verified for
  *mechanics* in 390px Chromium; **touch + iOS-layout behavior is UNVERIFIED** until driven on
  a real iPhone (HARD RULE #23). iPad falls in the tablet band and gets the side-by-side
  layout, so it uses the desktop storyboard.
- **Portaled targets are reachable.** The stage resolves selectors against the whole document
  (`root.ownerDocument`), so Radix menus/sheets/dialogs that portal to `<body>` (the deck
  switcher, the Inspector/settings sheets) are found — no longer scoped to the Studio subtree.
