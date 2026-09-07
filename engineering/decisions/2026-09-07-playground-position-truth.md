---
status: shipped
summary: The Playground's Explore mode is a free-scrolling filmstrip with a stepper bolted on that never observed the scroll, so the walk index was write-only and the chrome routinely named a slide the reader was not looking at. A randomized metamorphic walk over the real built site found nine defects with three root causes - no scroll-to-index observer at all; the walk position landed during the in-iframe FIT window and thrown away when FIT rescaled the deck (so every shared ?s= link, every reload and every Explore-Edit-Explore opened on the title slide while naming another); and input verbs owned per surface instead of read from lib/core/present-transport.mjs, which is the #1294 root cause repeated in the one surface the #1294 fix never reached. Fix - readingSlideIndex (greatest visible overlap plus hysteresis) drives the bar, caption, Step list and URL from the reader's own scroll; landWalk polls for the FIT reveal before scrolling; the keymap comes from shellKeyAction and the swipe rule from swipeAction, both bound to the frame document as well as the page; and the component picker opens on the current component instead of silently replacing the deck on Enter. Guarded by docs/e2e/playground-stress.spec.ts.
---

# Position truth in the Playground: the chrome must never name a slide you cannot see

**Date:** 2026-09-07 · **Issue:** #2103 · **Status:** shipped

## The surface, and why it is worth this much attention

`/playground/` is the front door for a visitor who has never written a line of
Markdown. Explore mode — a deck, a `‹ Prev · N / M · Next ›` bar, a caption — is
the only part of Lattice most of them will ever drive. It is also the surface no
stress tier had ever been pointed at.

## What was actually wrong

**One defect wearing nine faces.** Explore is a **filmstrip the reader scrolls
freely**, with a **stepper bolted on that never observed the scroll**. The walk
index was write-only: the bar, the caption, the Step dropdown and the `?s=` URL
were all set by a step and never corrected. Everything below follows from that.

Measured on the real built site at 1440×900 unless noted.

| # | What the reader does | What the chrome said |
|---|---|---|
| 1 | wheel from the title to slide 7 | `1 / 13`, slide 1's caption, `s=` unset |
| 2 | presses Next after that scroll | jumps **backwards** to slide 2 |
| 3 | clicks the slide, then presses → | nothing, ever again |
| 4 | presses PageDown / PageUp / Home / End | nothing |
| 5 | swipes left on a phone | nothing |
| 6 | opens a shared `?s=variant:trajectory` link | `6 / 13` over the **title slide** |
| 7 | reloads mid-walk | `7 / 13` over the title slide |
| 8 | Explore → Edit → Explore | `6 / 13` over the title slide |
| 9 | resizes the window mid-walk | `3 / 8` with slide 4 on screen |

Face 1 is the one to hold on to. On a phone, one flick puts three unrelated
slides on screen while the bar reads `1 / 13` and the caption describes a slide
that scrolled past several seconds ago — and then the only obvious control on the
surface throws the reader backwards. Every readout the surface has is wrong at
once, which is why it reads as "jank" rather than as a bug with a name.

## Three root causes

**A. Nothing read the scroll back.** There was no observer, at all. The index
only ever moved when the stepper moved it.

**B. The position was landed during the FIT window.** `render()` called
`scrollWalk` the moment `renderInto` resolved. Traced on a cold
`?c=kpi&s=variant:trajectory`: at t=908ms the frame was still
`visibility:hidden`, `scrollHeight` 9432, slide 5 at 3636; by t=1114ms the
in-iframe FIT agent had rescaled the deck to 8739 / 3376 **and the scroll was back
at 0**. The one scroll the surface performed was thrown away every time. That is
faces 6, 7 and 8 — every path that renders a fresh deck.

**C. Input verbs were owned per surface.** This is the
[#1294 root cause](./2026-08-10-input-verb-parity.md) exactly, in the one surface
that note never reached. The keyboard was a hand-written two-key map (`←`/`→`) on
`window` only, so PageUp/PageDown — what a presentation clicker emits — and
Home/End were never wired (face 4), and **clicking the deck moved focus into the
`<iframe>`, after which the parent listener never saw another keystroke** (face
3). Touch had no horizontal rule at all (face 5).

## Why the existing tests were green throughout

`playground-explore.spec.ts` covers this surface and asserts the walk bar's text,
the Step dropdown's label and the URL — **the three readouts that were lying.** A
test written against the chrome cannot see the chrome disagree with the deck.

That is the transferable lesson, and it is not "write more tests". It is: when a
surface has a *position*, the oracle has to come from the thing being positioned.
`docs/e2e/playground-stress.spec.ts` derives the geometry from the frame itself
and holds the chrome to it.

## The model: scroll is the source of truth

Two coherent resolutions existed and the choice matters, so it is recorded rather
than assumed.

**(A) The stepper is truth** — lock Explore to one slide at a time like Present,
and route wheel and swipe through `createWheelGate`. Rejected: it deletes free
scrolling from a filmstrip the reader skims, and that iframe is shared with the
editor's live preview, where scrolling is the whole point.

**(B) The scroll is truth, and the chrome follows it.** Taken. It removes no
behavior — it makes the readouts honest — and it is what the surface already was.

So the wheel is deliberately **not** gated into discrete steps here, which is this
surface's one departure from Present. The parity rule asks that no reader find an
input the surface ignores; a vertical wheel that scrolls the filmstrip *and moves
the counter with it* satisfies that, and gating it would take free scrolling away
to satisfy the letter of a rule against its purpose.

## The rule, and the clause that a phone forced

`readingSlideIndex` (`docs/src/lib/playground-controller.ts`) is
**greatest visible overlap, ties to the lower index** — the slide filling most of
the pane is the slide you are reading. Two cheaper rules were tried and rejected:
an **anchor line** (`last top <= scrollY + k`) is exact for the scroll the stepper
performs and arbitrary everywhere else, since `k` must be guessed against a slide
height that changes with the pane width; the **viewport centre** (the
`rootMargin: -45%` rule `deck-preview.js` uses) is stable only while a slide is
about as tall as the pane, and reports i+1 for a jump to i when one is shorter.

Then **hysteresis**, which the phone forced and which is the more interesting
half: *while the slide the caller is already on is at least half as visible as the
winner, it keeps the position.* At 390×844 this deck lays out **three slides to a
pane**, and the filmstrip cannot scroll far enough to put the last one at the top
— so pressing End clamps the scroll with slides 11, 12 and 13 all fully on screen
and pure overlap names **11**. Hysteresis also stops the counter twitching under a
small nudge of the wheel, which is the same defect one frame wide.

**The invariant both clauses serve is not "the index equals the dominant slide".**
At three-to-a-pane that question has no single right answer. It is: **the chrome
never names a slide the reader cannot see** — false for all nine faces above, true
at every width for a correct surface, and it is what the e2e oracle asserts.

## Two measurement traps, both paid for

**`offsetHeight` is not the slide's height.** The in-iframe FIT agent gives every
section a fixed 720px layout box and scales it with a transform, so at 390px
`offsetHeight` reads **720** where the slide is really **179**. `offsetTop` is
unaffected — the transform has a top-left origin, so layout positions already
carry the scale — which is exactly why the discrepancy is easy to miss: half your
geometry is right. Both `frameBands` and the e2e oracle read height from
`getBoundingClientRect()`.

**`iframe.contentWindow` identity survives a navigation.** It is a `WindowProxy`.
A rebind guard written as `if (frame.contentWindow === bound) return` binds once
to `about:blank`, loses every listener to the first srcdoc write, and then
**declines to rebind for the rest of the session** — silently, with the guard
reading true the whole time. The first cut of this change shipped exactly that and
looked correct in the diff. Key the guard on `contentDocument`, which is a fresh
object per navigation.

## What changed

- **`readingSlideIndex`** — the pure rule above, in the DOM-free controller kernel
  with the phone and desktop geometries as unit fixtures.
- **`onDeckScroll`** — an rAF-coalesced observer on the frame window driving the
  walk index, gated shut until `landWalk` has placed the first position and
  deferring to an in-flight programmatic scroll until it *arrives* (a smooth
  `scrollTo` crosses every slide on the way).
- **`landWalk`** — polls for the FIT reveal plus two frames of identical geometry
  before scrolling, with a bounded fallback so a frame whose FIT never settles
  still lands somewhere honest.
- **A `ResizeObserver` on the preview wrap** re-fits and re-lands, covering the
  window, the split drag, a collapse and an orientation change in one place.
- **The keymap comes from `shellKeyAction`** (`SHELL_KEYMAP`) and the swipe rule
  from `swipeAction` — not a fourth hand-written list — and every listener is
  installed on **both** the page and the frame document.
- **The URL sync went trailing-edge.** With the index following the reader's
  scroll, a flick was six `replaceState` calls in two frames; Safari rate-limits
  that outright at 100 per 30s.
- **The component picker opens on the current component.** It fed cmdk no `value`,
  so on a 69-row catalog in a 300px window it opened on the first row with the
  reader's own component 2376px out of view — and **Enter replaced their deck**
  (measured: `wifi` → `closing`). It also recomputed a full Fuse + BM25 search on
  every parent render, which with the new observer would have meant one per
  animation frame while scrolling; now memoized.

## Verification

`docs/e2e/playground-stress.spec.ts`, on the real built site (HARD RULE #23): six
named reproductions, four selection/keymap oracles, three `@parity` verbs across
`desktop-touch` / `tablet-touch` / `mobile-touch`, and a seeded 24-step randomized
walk over thirteen op families asserting, after **every** op, that the named slide
is on screen, that the index is inside the deck, that nothing threw, and that the
toolbar and walk bands never change height.

`readingSlideIndex` additionally carries 12 unit cases over the two real measured
geometries, including the phone-clamp case and a sweep asserting that every step
at 390px lands on a slide the reader can see.

**Not verified here, and stated as such:** real iOS/Android Safari. The swipes are
genuine CDP touch sequences in headless Chromium, which is not a physical phone.
