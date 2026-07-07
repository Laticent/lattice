---
status: shipped
summary: >
  Replace the Studio's single "Watch demo" with "Show Me" — a five-tour guided library (one
  Vetrina engine, five angles: First look · full walkthrough · board deck · just-Markdown ·
  quiet). Each tour is ONE responsive script adapting phone single-pane vs. desktop side-by-side.
  All are paced by a new Teaching Beat: `read: true` makes a caption a lesson — the cursor dips to
  the narration and the words glow-pulse, and the beat dwells to READ (timed by `readMs`) BEFORE
  the action, so a viewer digests the words then watches the thing happen. Retires the two single
  storyboards. Watching the real 390px run caught a 100s stall (mobile setSource resets the active
  slide, so previewShowsSlide spun to its timeout) — fixed by navigating to the typed slide.
---

# Studio "Show Me" — a five-tour guided library, paced like a person teaching

**Date:** 2026-07-07 · **Branch:** `claude/studio-demo-testing-library-26k1e6` (PR #789)
· **Supersedes:** the single "Watch demo" storyboards (`demo-storyboard.ts`,
`mobile-demo-storyboard.ts`) — retired here. · **Builds on:**
`2026-07-04-studio-demo-walkthrough.md`, `2026-07-05-vetrina-walkthrough-library.md`.

## The complaint that started it

The demo felt wrong to watch. The desktop script was a **feature recital** — 27
beats, short pauses (250–1100 ms), captions riding the action beats with no time
to read. The phone script had the opposite problem: **fewer but longer** holds
(four 2.2 s slide-stares) that sat on the rendered slide, not on comprehension,
and uneven (a 0.4 s tap beside a 3 s stare). Neither taught. A human tutor says a
thing, points so your eye lands on it, waits while you get it, *then* acts —
neither script had a read-the-caption beat, a gesture to the narration, or dwell
time scaled to how much there was to read.

Two owner asks followed: pace it "like a person teaching someone the tool"
(reading the caption is part of the storyboard — draw attention to it, be
patient), and — rather than pick one of five proposed storyboard angles — **ship
all five as a menu**. Budget: ≤ 2 minutes per tour.

## What shipped

### 1. The Teaching Beat (Vetrina engine)

A storyboard beat can set **`read: true`**. After the caption shows, the runner:
1. **draws the eye** — `stage.emphasizeCaption()` dips the cursor to the narration
   dock and glow-pulses the words (the teacher underlining what they said);
2. **dwells to read** — `readMs(caption)` ≈ `300 + 200·words`, clamped 1.2–4.5 s;
3. *then* runs the action (type / reskin / reveal).

So the viewer understands the words first, then watches the thing happen. A short
`settle` after the beat is the **land** (a digest pause on the result). Backward
compatible: a beat without `read` is unchanged. The emphasis is motion-safe (the
glow is opacity, not a transform, so it plays under the `legible` tier; the cursor
dip teleports when vestibular motion is suppressed).

`readMs` and `Step.read` live in `storyboard.ts`; `emphasizeCaption` in
`stage.ts`; `scene().read()` mirrors it in the fluent builder.

### 2. Five tours, one engine ("Show Me")

The single "Watch demo" became a **"Show Me" menu** — top bar on desktop/tablet,
inlined in the ⋯ menu on a phone (a nested Radix submenu flies off-screen on a
phone; the mobile items are inlined). Each tour is a different angle on the same
Studio, labeled by what the viewer *gets*:

| Menu label | Angle | ~time |
|---|---|---|
| First look | wow-first, three reveals, skip the meta | ~60 s |
| The full walkthrough (default) | chaptered Write · Polish · Ship | ~105 s |
| Build a board deck | the 4 o'clock meeting, with stakes | ~100 s |
| It's just Markdown | one promise, proven five ways | ~90 s |
| The quiet tour | few words, long lingers, gesture-led | ~85 s |

Each is **one responsive script** (`tours/*.ts`), not two — a shared toolkit
(`tours/tour-kit.ts`) branches on a `mobile` flag so the same tour adapts to the
phone's single swappable pane (per-slide alternation: tap Edit → type → tap
Preview → reveal) vs. the desktop side-by-side (type on the left, watch it render
on the right, in one beat). A registry (`tours/index.ts`) is the menu's source of
truth and `startDemo(id)`'s lookup; `useStudioDemo` builds the tour at start time.

## The mobile bug that only watching caught

Functionally green on desktop, the mobile walkthrough took **101 s just to build
four slides** (113 s total). Watching the real 390px run showed the preview stuck
on "Slide 1 / 2" while typing slide 2: the controlled `setSource` path (mobile
typing, from the char-drop fix) **resets the active slide to 1**, so the preview
never advanced to the slide just typed, and `previewShowsSlide(k)` spun to its
~15 s `until` timeout on *every* reveal. Fix: on reveal, `gotoSlide(k-1)` — the
viewer sees the new slide AND the gate resolves at once. Build 101 s → 58 s; full
tour 106 s (within budget). Also cut to one read-dwell per slide (the reveal
caption rides the land linger) and gentled `readMs`. **This is why the QUALITY
BAR / HARD RULE #23 insist on the real surface: CI green hid a 100 s stall.**

## Verification

Real Chromium, both widths: the full walkthrough builds four slides in order and
completes (desktop + mobile); every tour smoke-launches without erroring; the
reduced-motion (`legible`) run still types the deck. `demo.spec.ts` (desktop: menu
lists all five, build+complete, dedup, take-over, Escape, Exit, +4 per-tour
smokes) and `demo-mobile.spec.ts` (build+complete, take-over, reduced-motion) all
green. Unit: `readMs` math, read-beat order (say → emphasize → act),
`emphasizeCaption` across all four caption styles, the tour registry.

**Owed on-device (UNVERIFIED here):** iOS Safari — real touch, the scaled srcdoc
iframe. Chromium exercises the mechanics; iOS specifics remain owed.

## Alternatives considered

- **Pick one storyboard.** Rejected by the owner — "each has value." The menu also
  showcases exactly what Vetrina was built for (many named walkthroughs, one
  engine) and lets a viewer choose by mood/time.
- **Ten scripts (mobile + desktop each).** Rejected — one responsive script per
  tour, branching in the toolkit, halves the surface and keeps the two renderings
  from drifting.
- **Keep the old 6-slide desktop storyboard as the "full" tour.** Rejected — it's
  the un-paced recital the owner complained about. The tours are Teaching-Beat
  paced from scratch; the old storyboards are retired.
