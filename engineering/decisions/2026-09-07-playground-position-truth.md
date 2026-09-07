---
status: shipped
summary: The Playground's Explore mode is a free-scrolling filmstrip with a stepper bolted on that never observed the scroll, so the walk index was write-only and the chrome routinely named a slide the reader was not looking at. A randomized metamorphic walk over the real built site found fourteen defects with four root causes - no scroll-to-index observer at all; the walk position landed during the in-iframe FIT window and thrown away when FIT rescaled the deck (so every shared ?s= link, every reload and every Explore-Edit-Explore opened on the title slide while naming another); input verbs owned per surface instead of read from lib/core/present-transport.mjs, which is the #1294 root cause repeated in the one surface the #1294 fix never reached; and a set of races where the machinery outranked the reader - a wheel during the landing was swallowed or undone, a scroll inside the programmatic guard's own window was dropped for good, and a fit rescale changed the deck's geometry under a settled scroll with no event to announce it. Also: clicking the tab you were already on destroyed the deck, because both branches of setViewMode copy one source over the other and neither checked whether the mode was changing. Fix - readingSlideIndex (greatest visible overlap plus hysteresis) drives the bar, caption, Step list and URL from the reader's own scroll; landWalk polls for the reveal, verifies the target slide is on screen and retries, and the frame's reveal waits on it; the keymap comes from shellKeyAction and the swipe rule from swipeAction, both bound to the frame document as well as the page; a ResizeObserver inside the frame re-aims a scroll aimed at geometry that has since changed; and the component picker opens on the current component instead of silently replacing the deck on Enter. Three of the oracles used to find all this were themselves wrong - offsetHeight is the unscaled layout box, a settle that watches only the index and the scroll returns inside the fit window, and dominance is too strong an invariant where three slides share a pane. Guarded by docs/e2e/playground-stress.spec.ts.
---

# Position truth in the Playground: the chrome must never name a slide you cannot see

**Date:** 2026-09-07 · **Issue:** #2124 · **Status:** shipped

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
height that changes with the pane width; the **viewport center** (the
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

## What the wider walk found afterwards

The first fix passed its own six reproductions and a 24-step walk. Widening that walk to
sixty ops across three widths found **five more**, and they are worth naming because every
one was **invisible in isolation and deterministic under load** — the shape of thing a demo
never shows you and a fuzz walk finds on the third seed.

**Clicking the tab you are already on destroyed the deck.** Both branches of `setViewMode`
copy one source over the other, and neither checked whether the mode was changing. The
Explore tab replaced the 13-slide walk deck with the editor's untouched one-slide draft
while the bar still read `3 / 13`; the Edit tab is the mirror image, overwriting the
author's draft and pushing an undo backup nobody asked for. `onLoadGallery` had already had
to route *around* this function for exactly this reason, with a comment saying so — the
workaround was there and the guard was not.

**The walk kept a plan the deck no longer was.** Entering Explore adopts the editor's draft
as the deck (the unified view/source model), but the walk stayed the old component's plan,
so the bar counted thirteen slides over a deck with one and Next stepped to slides that did
not exist. It re-points to a `deck` walk, which learns its count from the render.

**The reader did not outrank the machinery.** Two separate gates swallowed real input: a
wheel during the post-render landing (the observer is shut for the whole settle, so the bar
held `1 / 22` at a scroll of 3033px), and a scroll arriving inside the programmatic guard's
own 400ms window — stranded for good, because no further event was coming. Both now yield
to a `userInputAt` stamp, and `landWalk` aborts outright rather than scrolling the reader
back off a position they chose.

**The deck's geometry changes under a settled scroll, with nothing to announce it.** The fit
agent rescales a fresh deck a few hundred milliseconds after it is parsed — 2160px sections
become 652 — and because the document does not shrink enough to clamp the scroll, **no
scroll event fires at all.** A step taken in that window aimed at the old geometry and
landed two slides past its target, permanently. A `ResizeObserver` inside the frame re-aims
a scroll still in flight and reconciles the index otherwise. It has to stand down while a
pane resize has already scheduled a re-land, or the two observers fight over one rescale —
which they did, and the resize regression test caught it.

## Three oracles that were themselves wrong

Worth recording, because two of them are traps any future measurement of this surface will
walk into.

1. **`offsetHeight` is the unscaled layout box** (720px) and not the height a phone shows
   (179px). Both the shipped code and the first e2e oracle read it.
2. **A settle that watches the index and the scroll returns inside the fit window**, where
   both are perfectly stable and neither is final — which is how a gallery load briefly
   looked like a deck rendered at 3x. The settle now includes the slide's height and the
   filmstrip's visibility.
3. **"The named slide is the dominant slide" is too strong an invariant.** At 390px three
   slides share the pane and the shipped rule deliberately keeps the reader's current slide
   under hysteresis, so a flick resting between two of them names one at ~40% of the pane,
   correctly. The oracle asserts the honest property instead — the named slide is
   substantially on screen — and every defect above measured 0%.

## Verification

`docs/e2e/playground-stress.spec.ts`, on the real built site (HARD RULE #23): eleven
named reproductions, three `@parity` verbs across `desktop-touch` / `tablet-touch` /
`mobile-touch`, and a seeded randomized walk over thirteen op families asserting,
after **every** op, that the named slide is on screen, that the index is inside the
deck, that nothing threw, and that the toolbar and walk bands never change height.

The exploratory harness that found all of this is not committed (it is a throwaway in
`.scratch/`), and the honest statement of its result is the one that matters: after the
fixes, **ten runs of fifty randomized ops across 1440x900 and 390x844 report zero
findings**, against 9 findings across the same seeds before. Cumulative layout shift over
those runs is 0.0000-0.0052, with the single 0.04 outlier attributed to CodeMirror's own
line-number gutter re-laying out when the author loads a different deck — inside the editor
pane, on an action they asked for.

`readingSlideIndex` additionally carries 12 unit cases over the two real measured
geometries, including the phone-clamp case and a sweep asserting that every step
at 390px lands on a slide the reader can see.

**Not verified here, and stated as such:** real iOS/Android Safari. The swipes are
genuine CDP touch sequences in headless Chromium, which is not a physical phone.
