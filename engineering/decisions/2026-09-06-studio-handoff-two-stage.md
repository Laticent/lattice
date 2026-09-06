---
status: shipped
summary: The Studio's instant shell stands in for TWO things that become ready at different times - the app's chrome (ready when React commits) and the live preview (ready when the engine renders a slide) - and both waited on the second. Measured with the new docs/scripts/handoff-bench.mjs - the app's finished chrome sat under an opaque cover, muted to opacity .62, for 672ms on a fast local path and 3463ms at 1200kbps, then cross-faded to 100%; that window ending is the reported "flicker", because a 62% stand-in brightening to the identical control at 100% is what it is. The hand-off is now two stages - stage 1 uncovers the chrome from a useLayoutEffect with NO rAF, which lands the reveal in the SAME PAINT as the chrome's first appearance (dead time 0ms on both networks); stage 2 keeps the Nacre box over the preview and fades it on first render, unchanged. Two things were got wrong on the way and are recorded rather than tidied - a display:none teardown rule LOST the cascade to the rule that shows the bands (1,3,0 against 1,2,0), leaving the app's real slide navigator with the shell's skeleton chips ghosting under it, so the teardown removes the nodes instead; and the "Playfair resolves late despite its preload" finding from the prior session was an artifact of the harness serving cache-control no-store, which makes a preload unreusable and double-fetches it. The separate +2.781px shift was JetBrains Mono, un-preloaded because a comment said no top-bar text is mono - true of the top bar, and false since #1438 added the EDIT/PREVIEW sub-bars, which are font-mono.
---

# The Studio hand-off is two stages, because the shell stands in for two things

**Date:** 2026-09-06 · **Status:** shipped

## The report

> Still broken — there's a flicker, and something shifts.

Both halves were real, both are fixed, and they had nothing to do with each other.

## What the measurement showed

`docs/scripts/handoff-bench.mjs` samples every animation frame — sub-pixel, width
and height — and reports the shell's milestones beside the app's, with webfont and
stylesheet readiness on the same clock. Fresh context per run (no persisted rect),
median of 3, `/studio/` at 1440x900:

| | fast local (5ms/100Mbps) | modeled link (200ms/1200kbps) |
|---|---|---|
| shell painted | 73ms | 847ms |
| **app chrome painted** | **537ms** | **4868ms** |
| shell fade began | 1204ms | 8290ms |
| shell removed | 1322ms | 8365ms |
| **dead time** | **672ms** | **3463ms** |

Dead time is the window where the app's chrome is painted and finished, and the
shell is still covering it. The shell is opaque and its chrome is muted to `.62`,
so this is not neutral waiting — the visitor is looking at a dimmed copy of a UI
that is ready. On the modeled link the fade began at 8290ms because the **8s
backstop** fired, not the preview's first render: the primary dismissal never came
in time, so the stand-in outlived its purpose by three and a half seconds.

The reported flicker is that window ending. A 62% stand-in cross-fading over 220ms
to the identical control at 100% reads as the UI getting brighter, because that is
precisely what it is — and `studio-shell-parity` holds the two chromes to 2px, so
there is no motion to distract from the brightness ramp.

## Stage 1 and stage 2

The shell does two jobs. It stands in for the app's **chrome**, which is ready the
moment React commits, and for the live **preview**, which is ready only when the
engine has rendered a slide. Both waited on the second one.

- **Stage 1 — the chrome.** `revealAppChrome` (StudioShell) sets the shell's chrome and
  bands to `opacity: 0` and clears its opaque ground, all inline.
- **Stage 2 — the slide.** `dismissSsrShell` fades the Nacre box out on the
  preview's first render, exactly as before. A fade is right *here*, and only here,
  because the two images actually differ.

Measured after: **dead time 0ms on both networks**, and no tracked control moves
more than 1px at any point in the timeline.

### Why the reveal has no `requestAnimationFrame`

Three versions, each measured, because the first two looked correct and were not:

| | app chrome painted | reveal | dead |
|---|---|---|---|
| `useEffect` + double rAF | 481ms | 817ms | 336ms |
| `useLayoutEffect` + double rAF | 522ms | 839ms | 315ms |
| **`useLayoutEffect`, no rAF** | **537ms** | **537ms** | **0ms** |

`useEffect` is a *passive* effect: React schedules it, the browser paints the commit
first, and the callback runs whenever the scheduler comes back — which is behind the
engine load. `useLayoutEffect` fixes the anchoring but not the delay, because the
reveal was still behind two rAF hops and a `longtask` observer shows **78ms and
107ms** tasks landing in exactly that window; rAF cannot run during a long task, and
the engine load guarantees long tasks here.

So there is no rAF. A layout effect runs after React has mutated the DOM and *before*
the browser rasterizes it, so setting the state there puts the app's chrome appearing
and the stand-in disappearing in the **same paint**. The visitor never sees either
state alone. That removes the window rather than shortening it.

The risk traded for is the opposite one — revealing a chrome that has not *settled*,
if the app needed a second commit to reach its final layout. That is not left to
judgment: the bench tracks the app's own header, preview bar, Reader-view pill, EDIT
bar and two of its controls for sub-pixel movement after the reveal, and reports
none. The EDIT bar was the specific worry, since its controls are progressively
enabled as the deck comes up; the reserved-slot work (#1414) is what holds it still.

## How the teardown is done, and the three ways it was done wrong

What has to end at stage 1 is the shell being SEEN. Nothing has to end about its nodes —
and each attempt to end them broke something no gate could see:

1. **A `display:none` rule lost the cascade.** The bands are shown by
   `:root[data-ssr-chrome] #studio-ssr-shell .ssr-band`, which is **(1,3,0)**, against a
   teardown selector on the shell's id at **(1,2,0)**. The chrome vanished and the bands
   did not, so a screenshot of the hand-off showed the app's real slide navigator with the
   shell's skeleton chips ghosting underneath — a worse artifact than the one being fixed.
2. **Removing the band nodes broke three e2e specs' contract, silently.**
   `.ssr-activityrail`, `.ssr-editpane`, `.ssr-panehdr` and `.ssr-paneftr` are 3 of the 5
   roots `studio-shell-parity` enumerates, and what `studio-instant-shell` and
   `studio-reserved-slots` measure. Those specs hold the ENGINE, not the island, so
   removing the nodes at React's first commit left them racing hydration. They passed —
   because fonts resolve faster than React on this machine. With the woff2 responses
   delayed 900ms, the parity spec read **14** shell controls against the app's 25 and
   reported eleven missing controls that are in fact drawn.
3. **`visibility: hidden` keeps the box but is precisely what Playwright treats as not
   visible**, so it fails the same specs the same way for a different reason.

**`opacity: 0` is the one form that ends the pixels and changes nothing else.** The boxes
stay, the flex flow stays, and Playwright still counts the controls (it tests a non-empty
box and `visibility`, and does not consider opacity). Re-running the 900ms font-delay
probe against it: **25 shell controls with the hand-off already fired**, identical to the
no-delay run. Set inline, so there is no specificity contest to lose — the same reason the
background is inline, since `:root[data-mode="dark"] #studio-ssr-shell` sets it at (1,2,0)
and would otherwise keep the cover up in dark mode only.

## The pin that was not needed

An earlier version measured `#ssr-slidebox` and pinned it into `--sb-*` + `data-ssr-rect`
before the teardown, on the reasoning that the Nacre box is flex-centered in `.ssr-stage`
and touching the chrome above it would re-center the slide. That reasoning was wrong, and
the correction came from measuring rather than re-reading: **`seedGeometry()` sets
`data-ssr-rect` for a newcomer too** — its compute fallback places the box from
`PREVIEW_CHROME` and the viewport — so on every normal path the box is already
`position:absolute`. On a fresh 1440x900 load it sits at 682.97,251.41 and removing the
shell's chrome outright leaves it at 682.97,251.41.

The pin was a bug invented for a problem that was not there, and an expensive one: it wrote
**absolute pixels**, so a rotation between stage 1 and stage 2 would have frozen the box at
the old viewport's rect — defeating the resize/orientationchange re-seed that makes
"rotated while the engine was still loading" work at all. `opacity: 0` needs none of it: it
changes no geometry, so `seedGeometry` goes on owning `--sb-*` without knowing stage 1
happened.

## The stranded Nacre, which stage 1 created

Stage 1 leaves the app's chrome live and interactive while the shell's Nacre still covers
the preview — and that box is frozen at the rect `seedGeometry()` computed before
hydration. `seedGeometry` re-runs on resize and orientationchange only; a posture change,
a splitter drag, a pane collapse or a docked panel fires neither. So a visitor who clicked
**Read** during the window got the app's preview box moving to full-bleed while the
stand-in stayed put: two Nacre rectangles at two geometries, measured at
`683,251,737,415` against the app's `49,75,1343,755`.

Before stage 1 the shell hid this — the chrome underneath was always `pointer-events:none`
and therefore clickable, but it was not VISIBLE, so the click was blind rather than
invited. Making it visible turns a latent oddity into a defect, which makes it this
change's to fix rather than a pre-existing one to log (HARD RULE #18).

The guard is not a list of the controls that relayout — that list is a hand-maintained
mirror, the failure mode this file keeps re-learning. It watches the app's own preview box:
once that box has been REAL once (the same 40px floor the rect persister uses), any further
change to its geometry means the layout moved under the stand-in, and the stand-in goes at
once. Boot is not a false trigger, because the first transition is the box *becoming* real
— 38x20.5 at stage 1, 735x412.6 about 136ms later — and that one only arms the guard.
After: clicking Read in the window removes the shell entirely and leaves the app's own
Nacre at the correct `49,75,1343,755`.

**Resize and orientationchange are exempt, and that exemption is the guard's correctness.**
`seedGeometry()` re-runs on exactly those two events and re-places the Nacre for the new
viewport — that is what makes "rotated while the engine was still loading" work at all. The
first version of the guard dismissed on them too, and turned
`rotating a phone into landscape leaves no chrome behind` red: the shell it reads after the
rotation had been torn down. Those two events now RE-ARM the baseline, two frames later, so
the re-seed keeps its job and only the changes it cannot see cause a dismissal.

**Both new e2e cases are mutation-proved, and the second one needed it.** With the guard's
`dismissSsrShell()` removed, the stranding test still PASSED — in 13.0s against the guard's
4.8s — because the engine hold was 9s and the assertion waited 10s, so stage 2 cleared the
shell inside the window and the test was reading the engine rather than the guard. The hold
is now 60s and the assertion 4s, which neither the held engine nor the 8s backstop can
satisfy. A test whose timeout is longer than the mechanism it is trying to exclude is not
testing anything.

## Three things got wrong on the way

**A `display:none` teardown lost the cascade.** The first stage-1 implementation hid
the chrome and bands with a rule keyed off the shell's id. The bands are shown by
`:root[data-ssr-chrome] #studio-ssr-shell .ssr-band`, which is **(1,3,0)**; a teardown
selector hung off the shell id is **(1,2,0)**. The chrome vanished and the bands did
not, so a screenshot of the hand-off showed the app's real slide navigator with the
shell's skeleton chips ghosting underneath — a worse artifact than the one being
fixed, and invisible to every existing gate. Winning that on specificity means an
`!important` or a tie broken by source order, both of which invite the next person to
lose it again. **A removed node cannot be out-specified**, so the teardown removes the
nodes and clears the background inline (`:root[data-mode="dark"] #studio-ssr-shell`
sets it at (1,2,0) and would otherwise keep the cover up in dark mode only).

**The bench itself had a false pass, found by running it against the old build.** Its
shift arm keyed the exit code on movement after the APP'S CHROME painted — and the
JetBrains Mono swap lands at ~200ms, a third of a second before the app's chrome
exists. So against the pre-fix build it printed all six shift events and still
reported that arm clean and exited 0 on the shift alone. It only failed because the
dead-time arm caught it, which means dropping the mono preload while stage 1 stayed
healthy would have passed silently. The arm now fails on movement once the SHELL has
painted, which is when there are pixels on screen to move; movement before that is
genuinely invisible and stays out. **The instrument is mutation-proved both ways**:
it exits 1 on the pre-fix `dist` and 0 on this one, same flags, both networks.

Two more were found by reading it after the fact. The **dead-time arm clamped with
`Math.max(0, …)`**, so a build that uncovered BEFORE the app's chrome painted — the opposite
failure, and the one that shows a bare page — reported a clean `✓ DEAD TIME 0ms`; a negative
is now reported and fails. And **`chromeRevealed` keyed on the `data-handoff` attribute
alone**, which `revealAppChrome` writes on its last line whether or not it found anything to
hide, so it would have certified a reveal that never happened; it now also checks that the
layer has actually stopped painting.

**"Playfair resolves late despite its preload" was a harness artifact.** The prior
session recorded this as unexplained. It is explained: the modeled host sent
`cache-control: no-store` on everything, which makes a preloaded response unreusable,
so both preloaded faces were **downloaded twice** — `via: link` at 637ms and again
`via: css` at 1320ms — and the face only became `loaded` on the second. Under the
caching a real static host uses, each is fetched once and both are available the
instant the stylesheet applies. The host now takes a `cache` option and the bench asks
for `'real'`, because "is the preload working" is otherwise a question about the
harness. `document.fonts.check()` was the same class of trap and is not used: it
returns **true** when no matching `@font-face` is registered at all, so every face
reported "available at 220ms", 600ms before the stylesheet that declares it.

## The shift was JetBrains Mono

Separate defect, same report. `Reader view` moved **+2.781px**, 3/3 runs, on the frame
mono resolved — the shell's PREVIEW label grows 2.781px wide and pushes the pill and
everything right of it sideways.

`studio.astro` preloaded Outfit and Playfair and said of the third: *"JetBrains Mono is
deliberately NOT preloaded: no text in the top bar is mono at first paint."* That was
true of the **top bar** and stopped being true of the shell in #1438, which added the
structural pane bands — and the EDIT and PREVIEW sub-bars are `font-mono text-[11px]
uppercase tracking-widest`. The comment was still describing the row it was written
next to, one band above the one that had acquired mono text.

Mono is now preloaded. It costs **+31KB** and the file-not-face dedup applies: 400/500
and 600 are one variable file, so this covers every mono weight the site uses. After: all
three families available together at 73ms (fast) / 859ms (modeled), against 1377ms for
mono alone before.

**This makes the shift very unlikely, not impossible, and the difference is worth stating
because an earlier draft of this note did not.** The preload moves the fetch to parse time;
it does not remove `font-display: swap`, as `studio.astro`'s own note already said. On a
link slow enough that the file still has not landed when the shell paints, the fallback
paints first and the 2.781px returns. It did not appear in any of the 21+ loads measured
here, and the independent checker saw it once in about 21 — so "gone from every run" was
an overclaim, and `perf:handoff` can go red for that reason rather than for a regression.
The durable cure is the metric-adjusted fallback faces `studio.astro` already names
(`size-adjust` plus ascent/descent overrides), which costs no bytes and holds at any speed;
that is a site-wide font-stack change and remains the owner's call.

## What now gates this

Nothing did when the change was first written: `handoff-bench.mjs` is an on-demand bench a
human runs by hand, and `grep -rn "data-handoff"` matched nothing in `docs/e2e/`. Two cases
in `studio-instant-shell.spec.ts` now cover it — that stage 1 stops the shell painting
(both the muted chrome and the opaque ground) *without* taking its boxes out of layout, which
is the property the other three specs depend on; and that a layout change during the window
does not strand the stand-in. The bench stays on-demand and out of CI: adding a CI step is
the owner's call, not a side effect of a bug fix.

## What is not covered

- **Real devices.** Everything here is headless Chromium over a modeled network. The
  ordering it exposes is real and the fix is measured on both ends of a 1000x bandwidth
  range, but a phone's compositor is not exercised (HARD RULE #23).
- **The 8s backstop still fires on a slow link.** Stage 1 means the visitor now has a
  live, interactive chrome the whole time, so the backstop no longer traps anyone
  behind a dimmed cover — but the Nacre box over the preview outliving the engine's
  render by seconds is a separate question about engine load time, not about the
  hand-off.
- **The modeled host paces bytes PER RESPONSE.** `bps` is applied inside each response's
  own tick, so N concurrent responses get N x kbps in aggregate. The Studio fetches HTML,
  CSS, three fonts, the island and the engine largely in parallel, so the headline 3458ms
  dead time and 4921ms chrome paint are lower bounds on a real 1200kbps link rather than
  that link's behavior. Inherited verbatim from `fouc-bench`'s inline `serve()`, so it is
  log-not-fix under HARD RULE #18 — but every number here inherits the optimism, and the
  before/after ratio is what the measurement supports, not the absolute milliseconds.
- **`fouc-bench` still serves `no-store`.** Its committed numbers are on that footing
  and it measures paint-versus-stylesheet, which the caching model does not distort;
  the option defaults to the old behavior so its numbers stay comparable. Its own
  "reload with a warm cache" framing is, however, not something `no-store` can deliver
  — noted here, not changed, because it is off this change's path (HARD RULE #18).
