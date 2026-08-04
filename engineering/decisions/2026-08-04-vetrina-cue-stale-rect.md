---
status: shipped
summary: Vetrina's spotlight ring and cursor landed a pane-width away from the pane they named on the production Studio. Filed as "geometry resolved in the wrong coordinate space"; measured on the real surface it is a STALE RECT — a cue positioned once, from a rect read before the host's own layout change had committed, and never re-read. Cues now track their target for as long as they are on screen, and a Target may be any live rect source, which is also the seam the Guide rung needs to point inside an iframe.
companion:
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-08-03-present-instant-audio-pacing-guide.md
---

# A cue must keep asking where its target is

**Status:** ACCEPTED + IMPLEMENTED (2026-08-04). Issue #1400.
**Touches `docs/src/lib/vetrina/**` — maintainer review required before merge.**

## The report

On **lattice.style, iPad Safari, landscape**, the walkthrough step captioned *"Light or
dark, instantly."* rendered with its cues scattered: a spotlight ring starting mid-preview
and running off the right edge with its left edge cut around the splitter, and the fake
cursor over the slide's body text. The ticket's reading was that this is *"not the wrong
element — geometry resolved in the wrong coordinate space."*

## What it actually is

Reproduced and measured on the real Studio at **1180x703** (the iPad-landscape box the repo
already keeps for engine-divergence work), driving the shipped `quiet` tour and sampling
every animation frame.

The coordinate space is **fine**:

```
.vetrina-stage   position:fixed   rect = (0, 0, 1180, 703)   ← exactly the viewport
ancestors        BODY, HTML       transform/filter/contain/zoom: none
```

No transformed ancestor, no displaced containing block, no scroll term missing — the page
cannot even scroll (`html, body { overflow: hidden }`).

What is wrong is **when** the rect was read:

```
t=42993  say="Or dark."   ring  left=699 w=481      ← where the pane WAS
                          pane  left=571 w=609      ← where the pane IS
```

The failing beat is `reskin()`'s third step, which does two things in one step:

```ts
{ say: modeSay, read: true, act: (a) => { a.openInspector(false); a.toggleMode(); },
  circle: SEL.preview, settle: 1200 }
```

`act` closes the Inspector, which widens both panes across the splitter. The storyboard
awaits `act` and then plays `circle` — but `act` only *calls* React setters; the commit and
the reflow land later. The ring was therefore drawn around the pane's pre-close box, and,
being absolutely positioned from fixed pixels, it stayed there for its whole 1.7s life. The
cursor orbit used the same one-shot center. The 128px offset is the Inspector's width, and
the "cut at the splitter" is just where the old pane began.

The caption was reported as wrong too. It is not: the dock is a fixed, viewport-centered
bar by design, never anchored to a target. Recorded here so it is not "fixed" later by
someone reading the ticket rather than the code.

## Why the obvious fix is the wrong one

"Wait for layout to settle before measuring" is a band-aid on a race. There is no settle
duration that is correct for every host — a React commit, a container query, a font load
and an engine re-render all land at different times, and on a slower device (which is what
the iPad is) they land later than whatever number you picked. It would also fix only the
cue that happens to be created during the reflow, not one whose target moves *while it is
on screen*.

## The decision

**A cue is anchored to a target, not to a snapshot of one.**

- The spotlight ring re-reads its target's rect every frame for as long as it is displayed,
  and repaints. The orbiting cursor reads the same box, so the two cues cannot disagree —
  there is one source of geometry for both.
- The cursor's glide re-aims every frame while in flight, so a reflow mid-glide lands the
  cursor on the target's new position rather than its old one. Same for a drag's approach
  glide, which follows a `scrollIntoView` and was the other snapshot in the file.
- Momentary bursts (the click spark, the anticipation ping) stay snapshot-positioned. They
  are gone within one layout change; re-reading them would cost more than it could correct.

The residual error is **one frame** — a reflow lands after the frame that caused it, so a
tracking cue is ~16ms behind during a resize. That is the honest floor for a rAF tracker
and is imperceptible; the defect it replaces was a cue wrong for ~100 consecutive frames.

## `Target` widens to any live rect source

The same change makes the library's target model an interface rather than a node:

```ts
export interface RectSource { getBoundingClientRect(): DOMRect; scrollIntoView?(arg?): void }
export type Target = string | RectSource | (() => RectSource | null);
```

`HTMLElement` satisfies `RectSource` structurally, so this is a widening with no migration.
It matters twice:

1. It is what "track the target" needs — the stage's only question of a target is *where
   are you now*, asked repeatedly, and that is now the whole interface.
2. It is the **cross-frame seam** the Guide rung (#1397) requires. Vetrina's stage is
   documented as living over the live app and never inside a preview iframe, and a Present
   slide *is* an iframe. A host can now supply a rect provider backed by its own frame
   geometry, and the library still knows nothing about frames, panes, or its host's layout
   — which is the constraint in `docs/src/lib/vetrina/README.md` and the standing rule for
   this directory.

`stage.resolve()` keeps its element-only contract (a rect source resolves `null` there);
the internal resolution used by cues returns whichever the host supplied.

## Also fixed, on the same cue

The ring is drawn with `box-sizing: border-box`. Without it the 3px border was *added* to
the target's box, so the ring was 6px larger than the thing it named. The stage mounts
outside the host's own reset (the Studio scopes `border-box` to `.lx-ui`), so it cannot
inherit a box model and now states its own.

## Verification (HARD RULE #23)

| Claim | Surface | Artifact |
|---|---|---|
| The defect is a stale rect, not a coordinate space | real Studio, Chromium 1180x703 | layer rect `(0,0,1180,703)`, no transformed ancestor; ring 699/481 vs pane 571/609 |
| Cues track their target | jsdom unit, `geometry.test.ts` | 3 cases; each verified red with the tracking removed (mutation confirmed applied before the run) |
| It holds on the real surface | real Studio, Chromium 1180x703 | `e2e/vetrina-geometry.spec.ts` — green; and RED (127px sustained, 102 frames) on a build with the tracking loop removed from both the source and the shipped `vetrina/dist` bundles |
| A rect source is a first-class target | jsdom unit | `point()` at a non-element target; `resolve()` still element-only |
| "Gone" holds for a host provider | jsdom unit, `geometry.test.ts` | zero-area, `NaN`, and teardown-mid-glide cases, each verified red with its guard removed |

**UNVERIFIED: real iPad Safari.** The report came from one, and the sandbox has no WebKit
build. The mechanism is engine-independent (a JS read ordering, not a layout difference),
and the repro reproduces in Chromium at the same viewport — but "reproduces in Chromium" is
not "confirmed on the reporter's device", and it is not claimed as such.

**A note on the oracle, and the two ways it lied before it worked.**

The FIRST version failed on the *fixed* build, reporting 127px — a single frame between the
reflow and the tracker's next paint. Asserting on an instantaneous gap is asserting against
physics. The shipped spec records a gap only once it has survived four consecutive frames,
which the defect cleared by ~25x.

The SECOND version passed on an *unfixed* build, which is the worse failure and was caught by
the independent checker rather than by me. `page.addInitScript` SERIALIZES its callback into
the page, so the callback closes over nothing — and its reference to the module-scope `SUSTAIN`
threw `ReferenceError` on the first frame that saw a ring. That throw landed *after* the
"did we measure anything" flag was set and *before* any gap could be recorded, so the sampler
died, reported a clean `null`, and the guard written specifically to prevent this passed
because it had already been satisfied one statement too early.

Three changes, and only the first is about `SUSTAIN`: the constant is passed as an argument;
**any uncaught page error fails the test**, which is the guard that generalizes to the next
out-of-scope reference; and the oracle now reports how many ring frames it sampled and requires
more than a handful, so a sampler that dies after its first frame cannot certify. A silent
sampler is worse than no sampler — it does not merely fail to catch the defect, it signs off
on it.

## The three shapes of "gone"

The library documents the guard as *"a target that vanished mid-glide should let the cursor
settle, not snap to the origin"*, and for a HOST-supplied target it did not hold. `liveRect`
answered null only on a throw, and a cross-frame source whose frame has been torn down cannot
throw and cannot answer null — `RectSource` must return a `DOMRect`, so it returns an all-zero
one. Read literally, `left: 0, top: 0` is the viewport corner, and the cursor flew there. The
two halves each looked right and disagreed at the seam; the committed test even pinned the ZERO
contract on the Studio side while the library ignored it.

`liveRect` now reads all three as "no position": a throw, a rect carrying a `NaN`, and a
zero-area rect. The `NaN` case is the one with the longest blast radius — a single `NaN` wrote
`NaN` into the cursor's own coordinates, after which every duration and every eased `t` was
`NaN`, `t < 1` was false, and *every later cue in the session* resolved on frame one having
moved nothing. Unreachable from an element; reachable from the `RectSource` widening this very
change introduced.

Two smaller ones landed with it. A teardown mid-glide now SETTLES the `point()` promise rather
than abandoning it — it was left pending forever, held by whatever awaited it. And the tween's
`t` is clamped at both ends: a rAF timestamp predating the `performance.now()` the glide started
from gave a negative `t`, and `easeInOut` extrapolated the cursor to `left = 27306px` before it
came back. That last one is pre-existing and on `main`, but it sits directly on the path of this
fix, so it is fixed here rather than logged.

## Logged, not fixed (HARD RULE #18 — found, not caused)

- `stage.ts` builds the layer with `layer.style.cssText +=` immediately after writing the
  JS theme tokens with `setProperty`. The 2026-07-05 decision doc asserts tokens are
  *"applied via `setProperty`, never concatenated into `cssText`"*. Source and doc disagree;
  on engines that omit custom properties from the `cssText` getter this would silently drop
  a JS theme. Off the path of this change and not observed failing.
- `tour-kit.ts` already records two root-scoping gaps (the mobile theme picker and slide
  settings resolve to nothing, because Radix portals them to `<body>` outside the tour's
  `root`). Unchanged here; the `RectSource` thunk is now one more way to fix them when
  someone takes that on.
