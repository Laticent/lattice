---
status: shipped
summary: The Studio's instant shell stands in for TWO things that become ready at different times - the app's chrome (ready when React commits) and the live preview (ready when the engine renders a slide) - and both waited on the second. Measured with the new docs/scripts/handoff-bench.mjs - the app's finished chrome sat under an opaque cover, muted to opacity .62, for 839ms on a fast local path and 3572ms at 1200kbps, then cross-faded to 100%; that window ending is the reported "flicker", because a 62% stand-in brightening to the identical control at 100% is what it is. The hand-off is now two stages - stage 1 uncovers the chrome from a useLayoutEffect with NO rAF, which lands the reveal in the SAME PAINT as the chrome's first appearance (dead time 0ms on both networks); stage 2 keeps the Nacre box over the preview and fades it on first render, unchanged. Two things were got wrong on the way and are recorded rather than tidied - a display:none teardown rule LOST the cascade to the rule that shows the bands (1,3,0 against 1,2,0), leaving the app's real slide navigator with the shell's skeleton chips ghosting under it, so the teardown sets opacity to 0 instead; and the "Playfair resolves late despite its preload" finding from the prior session was an artifact of the harness serving cache-control no-store, which makes a preload unreusable and double-fetches it. The separate +2.781px shift was JetBrains Mono, un-preloaded because a comment said no top-bar text is mono - true of the top bar, and false since #1438 added the EDIT/PREVIEW sub-bars, which are font-mono.
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
| **dead time** | **839ms** | **3572ms** |

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

**The shift is REDUCED, not removed, and the first two drafts of this note said otherwise.**
The preload moves the fetch to parse time; it does not remove `font-display: swap`. Draft one
said "gone from every run" on 21 loads; draft two softened that to "very unlikely" after an
independent checker saw it once in about 21. Both were measuring `build:e2e`. On the shape we
deploy it happens on essentially every load, and the preload's real contribution is halving the
events and pulling mono ~400–600ms earlier — see the two sections below, which supersede this
paragraph's optimism.

## The build I measured was not the build we deploy

Found late, by fetching the Cloudflare preview this PR produced and diffing its HTML against
the local build every number here came from. They are not the same shape:

- `npm run build:e2e` is `sync` + `astro build`, and stops.
- `npm run build` — what `docs-preview.yml` and `docs.yml` actually deploy — then runs
  `inject-modulepreload.mjs` and `hoist-stylesheets.mjs`.

Those two steps move **exactly the two milestones this change is made of**: when the
stylesheet applies, hence when the shell paints, and when the island's JS arrives, hence when
React commits and stage 1 fires. Measured on the same commit, at 200ms/1200kbps:

| | `build:e2e` | deployed shape |
|---|---|---|
| stylesheet applied | 837ms | **665ms** |
| app chrome painted | 4968ms | **4550ms** |
| webfonts available | 859–885ms | **714–774ms** |
| font-swap shifts | **0 in 21 loads** | **on essentially every load** |

The last row is the one that matters. On the unhoisted build the stylesheet lands *after* the
webfonts, so the shell's first chrome paint already has the real metrics and no swap is
observable. Hoisting moves the stylesheet ~170ms earlier, ahead of the fonts — so the shell
paints in the fallback and then swaps, in full view. **The claim "the shift is gone from every
run" was true of the build I measured and false of the site we ship.**

The dead-time result is unaffected and was re-confirmed on the deployed shape: app chrome
painted 4550ms, chrome uncovered 4550ms, **dead time 0ms**. Both milestones move together, which
is why that half survived a wrong-shaped measurement and the font half did not.

`handoff-bench.mjs` now **refuses** a dist with no modulepreload marker and says why
(`--allow-unshaped` overrides). The next person cannot repeat this by accident.

## What the font preload actually buys

Re-measured on the deployed shape, as a clean A/B — the deployed HTML with and without only the
JetBrains Mono preload line, 12 cold loads each:

| | mono available | shift events / 12 loads |
|---|---|---|
| without the mono preload | 1168–1420ms | **30** |
| with it | 764–1002ms | **16** |

So the preload pulls mono ~400–600ms earlier and roughly **halves** the shift events. It does
not eliminate them, because it never could: it moves the fetch to parse time and leaves
`font-display: swap` alone, which `studio.astro`'s own note said all along.

**The rate, on a proper sample, is about one load in six — and this note has now been wrong
about it in both directions.** An independent checker ran 113 cold loads across both build
shapes and both networks:

| shape | network | loads | with the shift |
|---|---|---|---|
| `build:e2e` | fast | 33 | 8 (24%) |
| `build:e2e` | modeled | 30 | 1 (3%) |
| deployed | fast | 30 | 3 (10%) |
| deployed | modeled | 20 | 6 (30%) |
| **total** | | **113** | **18 (16%)** |

Draft one said "gone from every run" off 21 loads. Draft two, correcting for the build shape,
said "essentially every load". Both were reading too much into a handful of runs on one
configuration; the honest figure is ~16%, ranging 3–30% by configuration, and it is
load-sensitive on this machine.

Two independent swaps move things, and only one of them is mono:

- **mono** on the shell's PREVIEW label — `+2.781px` wide, which pushes the Reader-view pill
  and everything right of it sideways. This is the reported shift.
- **Outfit** on the Reader-view pill's own "Full deck" label — `−14.375px` of the pill's width.
  Outfit was already preloaded before this change, so this one is untouched by it.

The preload was never the cure, and treating it as one is what left the owner testing an
iPad Air 4 and reporting that it still shifts. **See "The shift, actually fixed" below** — that
section supersedes this one's closing advice. What this section still records correctly is what
the preload alone is worth: ~400-600ms earlier, about half the events, and a defect still
present on one load in six.

## `perf:handoff` did not exit 0 on this branch, and an earlier draft said it did

An earlier draft claimed the instrument was "mutation-proved both ways: it exits 1 on the
pre-fix dist and 0 on this one, same flags, both networks." **The second half was false when it
was written.** The bench exited 1 on this branch too, at both networks and both build shapes,
because the shift arm caught the residual font swap — the very thing that draft documented as
unfixed. The instrument was right and the claim was wrong. It exits 0 now, because the defect
is fixed rather than because the arm was loosened; the mutation proof is in the next section.

The first half was also true for the wrong reason. The dead-time arm **could not fail** on the
pre-fix build: with no stage-1 reveal there is no `chromeRevealed`, and on that build
`shellFadeStart` is usually null as well (the fade fires inside the engine's first render, a
long task, so no animation frame lands inside its 260ms), leaving `deads` empty, the median
null, and `failDead` reduced to `null != null`. The pre-fix dist printed `✓ DEAD TIME n/a` and
exited 1 only on the shift arm. That is fixed — an unobservable hand-off now fails loudly
instead of passing quietly — and the before/after is quoted below by a method that survives it.

**The before number is now `shellGone − appChrome`**, the whole window the app's finished chrome
sat covered, which is measurable on both builds:

| | pre-fix | this branch |
|---|---|---|
| covered after ready, modeled 1200kbps | **3572ms** | **0ms** |
| covered after ready, fast local | **839ms** | **0ms** |

An independent checker measuring the same way got ~3529ms and ~795ms. The earlier figures in
this note came from `fadeStart − appChrome` on the runs where the fade happened to be sampled,
which is the same phenomenon read through a milestone that is often missed.

## The step survives, and it cannot be ramped away here

The adversarial pass turned the change's own argument around, correctly. The record defined the
defect as *"a 62% stand-in cross-fading over 220ms to the identical control at 100%"* — and
after the fix every clause of that is still true except the duration. The `.62` mute is intact,
the geometries are still held to 2px, so the swap is still a full-magnitude tone step; only
*when* it happens (React's commit, not first render) and *how long* it takes (one frame, not
220ms) changed. Measured: **+4.9 luminance points on a stretch of the top bar carrying no text
at all**, and about 46% of the viewport's pixels changing in a single paint. In LIGHT mode the
UI gets **darker** at hand-off, not brighter — the opposite of the mental model the first
diagnosis was written from.

So the obvious improvement is to resolve the mute *before* the swap: ramp the stand-in .62 → 1
while the ground is still opaque, and only then step aside, which makes the hand-off zero by
construction rather than zero by timing. **It was implemented three ways and none of them ran.**

1. `transition` set beside the new value in the layout effect — no transition starts, because a
   transition needs its property already present in the before-change style.
2. The transition declared in the stylesheet, so it always is present — also nothing.
3. `Element.animate()`, which states its own from-value and needs no prior style resolution.

The third one says why. The animation is created and reports `playState: 'running'`, and its
`currentTime` stays at **0** for the whole window while wall-clock time advances 140ms. A new
animation is *pending* until the first animation frame resolves its start time — and this
instant is the most main-thread-bound moment of the boot, the same window where a `longtask`
observer shows 78ms and 107ms tasks. No frame is produced, the animation never starts, and the
swap timer cancels it having painted nothing. All three measured on video as a single-frame
jump with no intermediate frames.

**The moment that makes a same-paint swap correct — no frames needed between the two states —
is the same moment that makes any timed transition unreliable.** That is not a bug to fix; it
is the constraint. The step therefore stays, and the only thing that removes it is removing the
`.62` mute, which is a design decision rather than a defect: the mute earns its place for the
~0.7–4s the stand-in is inert and would otherwise read as ready while `pointer-events: none`
swallows nothing. **Left for the owner, with the number attached.**

## The guard watches AGREEMENT, after three ways of getting it wrong

The first guard watched whether the app's preview box had *changed* since it first became real.
Three defects, all found adversarially, all measured:

- **It was blind to a box that was never in the right place to begin with.** Persist a rect at
  1440x900 and reload at 390x844: the seed replays `195.9,380.6,178.1,100.2` while the app lays
  out `16,351.3,358,201.4` — a 178x100 Nacre floating inside a 358x201 one, counter-rotating at
  different phases, for the whole load. The app's box never *moves*, so a change detector sits
  quiet. This is the artifact `2026-07-21-studio-preview-one-skeleton.md` calls structurally
  impossible; it was impossible because the shell was opaque, and stage 1 is what re-opened it.
- **It died permanently on a breakpoint crossing.** It captured `previewBoxRef.current` once in
  a `[]`-dep effect, and the preview holder is one of three mutually exclusive JSX branches — a
  1440→600→1440 resize unmounts it, leaving the guard watching a detached node and reporting no
  disagreement ever after. This file already documents that exact trap ~1900 lines away, for the
  same holder.
- **Its `pointerup` channel could not work.** `pointerup` precedes `click`, and React commits
  inside the `click` dispatch, so the listener always read a rect identical to its baseline.
  Every dismissal actually came from the ResizeObserver.

Comparing the two boxes directly subsumes all of it and needs none of the machinery — no
baseline, no amnesty counter, no capture-phase listeners, no observer. A rotation re-seeds
*both*, so they agree again on their own.

One more hole survived into the rewrite and is now closed: **a collapsed preview is the most
complete disagreement there is, not the absence of a reading.** "Collapse preview" is one click
away in the chrome stage 1 just made visible; the app's box goes to `0,0,0,0` and a 40px "is
this real" floor applied to the *reading* skipped the comparison and called it agreement,
stranding the stand-in over the middle of the editor until the 8s backstop. The floor now sits
on *arming* only. Both cases are pinned by e2e.

Verified after the rewrite: **no misfire on 7 boot configurations** (1440 light and dark, 1024,
820, 390 touch, 844x390 cinema, and a returning visitor with a persisted rect), and it fires on
both Read and Collapse preview.

## The shift, actually fixed

The owner tested an iPad Air 4 and reported that it still shifts. It did. This section is what
was wrong and what closed it.

**The root cause was never the preload.** `system-ui` is a poor metric match for Outfit — 24%
wider at weight 600 — and the deployed build hoists the stylesheet ahead of the fonts, so the
shell reliably paints in `system-ui` and `font-display: swap` then re-lays the text out when
the woff2 lands. The Outfit preload does not prevent that, contrary to the comment that
justified it: a preload moves the fetch earlier, it does not remove the swap. Measured at an
iPad Air 4 viewport (820x1180 and 1180x820), cold, 1200kbps:

| control | movement when the webfont lands |
|---|---|
| shell deck title | **-42.27px** (width), carrying the pill and everything right of it |
| shell Reader view | -14.38px |
| shell PREVIEW label | -6.30px |
| shell deck pill | +3.03px, at Playfair rather than Outfit |

**Three changes, and only the third is the cure.**

1. **JetBrains Mono is preloaded** (the previous section: ~400-600ms earlier, about half the
   events). Necessary, not sufficient.
2. **Metric-adjusted fallback faces** — `Outfit Fallback`, `JetBrains Mono Fallback`,
   `Playfair Fallback`, each a `local()` system face carrying `size-adjust` plus the three
   metric overrides — joined every site-chrome stack. This took the title from 42px to about
   9px and mono to 0.00px. **It cannot reach zero and the reason is structural:** `size-adjust`
   is one scalar per face while two typefaces differ per GLYPH, so the correction that fixes
   one string breaks another. Calibrated against the real chrome, weight 600 wanted x1.05 for
   the deck title and under x1.00 for four other strings in the same weight.
3. **All twelve faces moved from `font-display: swap` to `optional`.** This is what removes the
   reflow, by construction rather than by calibration: the browser gives the font ~100ms and,
   if it is not ready, uses the fallback for that load and never swaps. There is no third state
   in which the layout moves. The font still downloads and caches, so the next navigation gets
   the real face with no shift either way.

**Result, measured on the deployed build shape** (`npm run build`, not `build:e2e`): **0
movement above 0.01px** — both orientations, cold and warm, at 1200, 400 and 150kbps. The
negative control fires: reverting the built CSS to `swap` with the fallback families stripped
reproduces the -42.27px title move at 662ms.

**The cost, measured rather than asserted.** At 1200kbps the deck title still gets real Outfit
and only the Playfair wordmark falls back; at 400 and 150kbps both fall back for that visit.
What "falls back" is worth is the whole point of change 2 — the title measures 47px against
Outfit's 49px, the wordmark 57.69px against Playfair's 56.69px. So the trade is a 1-2px
difference in the weight and shape of the type on one cold visit, against a 42.27px jump on
every cold visit. It is reversible in one line.

**Four site-chrome stacks bypassed the token and had to be found by probing, not grepping.**
`--font-sans` and `--font-mono` in `tailwind.css` are the tokens everything is supposed to go
through, but `landing.css`'s `--font-body` / `--font-mono` and `lattice.css`'s `--sl-font` /
`--sl-font-mono` declare the stack again, and a live element in the Studio header resolved to
`Outfit, system-ui, sans-serif` with no fallback family in it. A grep for `'Outfit'` finds
them; a grep for the token does not. Two inline `style={{ fontFamily }}` Playfair stacks in
`StudioChromeSkeleton.tsx` and `StudioShell.tsx` were the same shape. The engine's own
`--font-body` (`lib/base/base.tokens.css`) is deliberately untouched: it governs slide
rendering and the PDF/PPTX export, which is a sign-off surface.

## The bench certified the defect it was written for, twice

Both gaps were found by mutation testing the instrument, and both are worth recording because
neither is visible from reading it.

**It did not track the control that moves.** `TRACK` held bands and fixed icon buttons. The
reported shift is a font swap re-solving text advance, so it lands hardest on the longest
content-sized string in the chrome — the deck title — which was the one box not tracked.
`shell deck title` and `shell deck pill` are now rows, so the bench names the control the
owner actually sees move.

**It counted a move nobody can see, and printed a permanent red.** Stage 1 uncovers the chrome
but deliberately leaves the Nacre box over the preview region until stage 2. The app's preview
pane grows from its 38x20.5 placeholder to 735x412.6 at ~4.4s, four seconds before the cover
lifts — and the bench called that a 697px shift on a healthy build. A permanent red teaches the
next reader to ignore the arm. The visibility window is now per-control: `app preview box`
becomes visible at the stage-2 fade (falling back to the shell's removal, since the fade sample
is intermittently missed inside one frame), everything else at first paint. The moves are
reported on their own line rather than dropped, because a count that vanishes cannot be told
from a check that stopped running. The exclusion cannot mask either defect the bench exists
for: the dead-time arm does not read shifts at all, and the mono swap moved the Reader-view
pill, which is chrome and keeps the earlier window.

`--touch` was added along the way. It turned out not to be needed for the exit code — on the
full mutant the bench fails at its default 1440px — but the Studio's chrome reads the pointer
media query to decide whether the deck pill is content-sized, and only the content-sized form
can carry a text-advance change, so a tablet width alone was not a tablet.

**Mutation-proved, in the direction that matters.** `perf:handoff` exits **1** against the full
mutant (`swap`, fallback families stripped from the built CSS) and **0** against the shipped
build. An earlier attempt at this proof used an incomplete mutant — a `sed` that matched only
the comma-quoted form left 8 `Outfit Fallback` references alive, so it was testing `swap` WITH
the metric fallbacks still in place, a regime that genuinely barely shifts. That half-mutant
produced a green run that read as a bench blind spot and sent this investigation down two
unnecessary paths. A negative control has to be verified to actually be negative.

## What now gates this

Nothing did when the change was first written: `handoff-bench.mjs` is an on-demand bench a
human runs by hand, and `grep -rn "data-handoff"` matched nothing in `docs/e2e/`. Three cases
in `studio-instant-shell.spec.ts` now cover it — that stage 1 stops the shell painting
(both the muted chrome and the opaque ground) *without* taking its boxes out of layout, which
is the property the other three specs depend on; and that neither a layout change nor a collapsed
preview during the window strands the stand-in. The bench stays on-demand and out of CI: adding a CI step is
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
  CSS, three fonts, the island and the engine largely in parallel, so the headline 3572ms
  dead time and 4550ms chrome paint are lower bounds on a real 1200kbps link rather than
  that link's behavior. Inherited verbatim from `fouc-bench`'s inline `serve()`, so it is
  log-not-fix under HARD RULE #18 — but every number here inherits the optimism, and the
  before/after ratio is what the measurement supports, not the absolute milliseconds.
- **The shell paints the preview pane the wrong ground, and stage 1 moves when you see it.**
  The app's preview holder is `bg-card` (`--color-card: var(--bg-alt)`); the shell's whole
  layer is `var(--bg)`. Sampled in the letterbox — inside the preview pane, outside the slide
  box — just before and just after the hand-off:

  | | shell paints | app paints |
  |---|---|---|
  | light | `rgb(250,247,242)` | `rgb(243,237,228)` |
  | dark | `rgb(21,17,13)` | `rgb(30,26,21)` |

  Dark mode is the visible one, ~40% lighter. This is PRE-EXISTING — the shell always painted
  the wrong ground, and before stage 1 the correction simply landed later, at the shell's
  removal. It is a real part of the "46% of viewport pixels change in one paint" figure above,
  and it is a pure shell-fidelity bug rather than anything the hand-off introduced.

  **Not fixed here, deliberately.** The shell's bands are `position:absolute` and the stage is
  in flow, so absolutes paint ABOVE it: a ground band would cover the Nacre box unless the
  stacking order is reworked. That is surgery on the layer system, and the layer system is
  precisely what caught this change out twice (the cascade specificity loss, the removal that
  broke three specs). It does not belong in a change that is otherwise finished. The fix is a
  ground band ordered before the other bands with the slide box lifted above it, and it helps
  whichever hand-off design ships.
- **`handoff-bench` still cannot reach the phone by default.** It defaults to `--width 1440`
  and `--touch` off, so it never enters the `landscapePhone` / cinema branch unless asked, and
  it never interacts — so it cannot see any of the stranding cases either. Those are covered by e2e and by the
  ad-hoc guard sweep, not by the bench, and the bench should not be read as covering them.
- **`fouc-bench` still serves `no-store`.** Its committed numbers are on that footing
  and it measures paint-versus-stylesheet, which the caching model does not distort;
  the option defaults to the old behavior so its numbers stay comparable. Its own
  "reload with a warm cache" framing is, however, not something `no-store` can deliver
  — noted here, not changed, because it is off this change's path (HARD RULE #18).
