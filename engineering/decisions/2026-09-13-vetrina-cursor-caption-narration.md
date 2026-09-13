---
status: in-progress
summary: >
  Three changes to Vetrina, prototyped together because they turn out to be one change. (1) A
  fifth caption style, `caption: 'cursor'` — a speech balloon anchored where the cursor is
  resting, which steps aside while the cursor performs and comes back when it stops; Exit leaves
  the caption so a caption that can hide cannot take the escape hatch with it. (2) A narration
  PORT (`Narrator`) that Vetrina defines and never implements, with the Cadenza-backed adapter
  living above both libraries — which buys a real per-line duration and a WORD CLOCK with no
  audio at all, and so `Step.at('Publish')` lands the click on the word that names it (measured:
  1 ms). (3) `pacing.ts`, one cited model replacing five hand-tuned literals, two of which were
  measurably wrong — the caption dwell ran at ~300 wpm against a 150 wpm subtitle budget (and
  against Cadenza's own 150, a 2x disagreement inside one repo), and the typing reveal ran below
  the ~40 ms at which characters stop resolving as separate events. Plus `bounds: 'host'`, which
  answers the containment question the probe settled: a caption bar sized `100vw` was 704px wide
  inside a 642px app, hanging 31px off each side, in every configuration.
companion:
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
---

# The caption moves to the cursor, Cadenza narrates, and the pacing gets a source (2026-09-13)

**Status:** PROTOTYPE — built, measured, on a real surface; not yet the default for any shipped
tour. Branch `claude/vetrina-caption-narration-cmmykv`.
**Ask (the architect's words):** *"one of the things we don't do today is control of the
placement of the caption… maybe it would be better if it is placed next to mouse rather than
being so distant… the user of the library has a choice to have the caption next to the mouse,
hide when demo in progress (typing, clicking, underlining, etc) and show when that is done… the
second improvement is having it use Cadenza to narrate the walkthrough… we can today style the
caption contained and need to have that confirmed… we should also add pacing control based on
science and empirical data."*

## What was measured first

Nothing below is an opinion about what looks better. Four numbers came out of a real Chromium
before any design work started.

**1. The caption is nowhere near the thing it is about.** With the default `bar` style, the dock
is anchored to the window's bottom edge. On the prototype page that is ~600px below the app panel
the tour is driving — far enough that it overlaps the page's own content. The viewer's eye makes
that round trip once per beat.

**2. "Contained" does not work today, and the half that does is an accident.** A probe mounted a
stage into a 642 × 402 host with `portalRoot: host`:

| host CSS | stage layer | caption bar | inside the host? |
|---|---|---|---|
| none | 1200 × 800 @ (0,0) | 704 × 45 @ x=248 | **no** |
| `transform` / `contain:paint` / `filter` | 640 × 400 @ host box | 704 × 45 @ x=248 | **no** |

So the LAYER contains — but only as a side effect of the host happening to set a property that
makes `position: fixed` resolve against it, which is not an API and is not documented. The
CAPTION never contains: `width: calc(100vw - 24px)` capped at `max-width: 680px` plus 24px of
padding is 704px of caption in a 642px box, hanging 31px off each side in every row of that
table. Two further confirmations, both useful: `--vt-caption-bg` and `--vt-caption-radius` set
from host CSS **do** land (color and shape are genuinely themeable, as the README claims), and a
host `max-width` rule **does not** — 680px inline wins, and only `!important` beats it. **The
answer to "can we style the caption contained": color and radius yes, geometry and containment
no.**

**3. The pacing was five literals, and two were wrong by a factor.**

| timing | shipped | what is wrong with it |
|---|---|---|
| caption dwell | `300 + 200·words` | 200 ms/word ≈ **300 wpm**, for a caption the viewer has never seen while also watching an app. BBC subtitle guidance is 160–180 wpm; Brysbaert's 2019 meta-analysis (77 studies, 5,965 participants) puts *undistracted* silent reading of non-fiction at ~238 wpm. This budgeted a distracted reader 60% more than an undistracted one gets. |
| typing | `22 ms/char` | Below the ~40 ms at which two visual events fuse, so the reveal reads as a paste, not as typing. Its comment calls it "a human cadence"; a fast human typist is 120–150 ms/char, so it is also 6x off the thing it claims to be. |
| cursor travel | `clamp(distance, 300, 820)` | Linear in distance and blind to the target, so landing on a 16px icon costs exactly what landing on a 300px card costs. A hand does not work that way. |
| register beat | `480 ms` flat | Spent even when the cursor is already on the target, where there is no saccade to wait for and the pause reads as hesitation. |
| settle | `900 ms` flat | Reasonable, unsourced. |

**4. The two libraries disagreed with each other by 2x.** Vetrina's `readMs` and Cadenza's
`readMs` do the same job — how long should this line be on screen — and returned 300 wpm and
150 wpm respectively. Same repo, same viewer, same words.

## The design model

Three axes. Naming them separately is what showed that the three asks are one change.

### Where the caption sits

Three candidates: the **edge dock** (today), **cursor-following**, and **cursor-anchored but
position-stable**.

Cursor-following is rejected outright, and not on taste: reading is a sequence of fixations on
stationary text, so text that drifts during a fixation has to be re-found and re-fixated. A
tooltip glued to a moving pointer is a caption you cannot read. It also undoes the deictic
gesture work, whose entire premise is that *the cursor's position is a consequence of the
stroke*, so a pointer can never cover what it names — a box welded to that pointer covers it
instead.

**Cursor-anchored is the move.** The bubble is placed where the cursor is resting, on the quadrant
with room, scored against two costs that are not interchangeable: leaving the bounds is
disqualifying, covering something is merely bad. It never repositions while visible — moving it
means fading out and fading in somewhere else, never sliding.

**And it is TRANSIENT, which is the correction that came from the architect after the first
build.** The rhythm is: the cursor moves — the movement is what brings the eye — it arrives, the
balloon appears beside it, it holds for as long as an average reader needs, and then it takes
itself down. The caption exists when there is something to say and at no other time; it is not
chrome waiting to be replaced. Three consequences, and each one deleted something:

- **The line is said AFTER the beat's last travel**, not at the top. Saying it first put the words
  beside a cursor still standing where the previous beat had left it — which is the same defect
  the checker measured at 561px, arriving a second time through the ordering rather than through
  the placement.
- **`dismissCaption()` replaces "wait for something else to hide it".** A caption with its own
  life cycle needs no settle credit, no lingering, and no rule about what the next beat does.
- **The reading budget is spent once, in one place.** The earlier build spent it before the action
  and then showed the caption again for the settle, which is why it needed the settle credited
  against the window to avoid buying the same seconds twice.

### When it is visible

A state machine on the stage, driven by the verbs the stage already funnels (`point`, `press`,
`drag`, `gesture`), so an author writes nothing. `busy()` is the one seam for the one action the
stage does not own — the runner's typing, which lands text through the host's own setters and is
invisible to stage.ts, and which is also the case most likely to have a caption sitting on top of
the field.

Two constraints, both load-bearing:

- **Hide by opacity, never `display` or `visibility`.** The narration is a live region, and
  removing it from the layout tree removes it from the accessibility tree — a screen-reader user
  would stop being told what the tour is doing at exactly the moment a sighted one starts
  watching it happen.
- **Exit leaves the caption.** Stranding a viewer inside a running tour is the one thing this
  library will not do, and a caption that can hide would otherwise take the only escape with it.
  So this style borrows `split`'s shape: a transparent full-area container carrying
  `.vetrina-caption` (what the take-over guard reads as chrome), a bubble that comes and goes,
  and a corner chip that does not.

**Voiced runs do not hide.** Silent, the caption and the action compete for one pair of eyes.
Voiced, the ear has the words and the eyes are free — and blanking a subtitle mid-sentence takes
the words from precisely the viewer who is reading them because they cannot hear them. Same rule,
opposite outcome, decided by `Narrator.voiced` rather than by a setting.

### Who owns the clock

Vetrina cannot import Cadenza: both are boundary-gated so they can spin off as separate packages,
and that gate is the contract. So narration arrives the way audio already arrives in Suono — as a
PORT the host wires. Vetrina defines `Narrator` (types plus one no-op, zero imports); the
Cadenza-backed implementation lives in `docs/src/lib/vetrina-narration/`, above both.

The insight that made this worth building: **two of the three things a narrator buys need no
audio.** A timed track is text arithmetic, so a silent narrator already delivers a real per-line
duration *and* a word clock. Sound is the third thing and the only one that needs a voice — which
matters here because HARD RULE #24 keeps our OpenRouter key off the docs site entirely, so a
voiced rung is a Studio-side wiring job with a user's key in hand, not a library default.

## The word cue, and the mistake worth recording

`Step.at('Publish')` fires the beat's action on the word that names it. The obvious
implementation delays the ACTION until the word is `lead` ms away — and it is silently inert.
Measured on the prototype: **every cue resolved to a zero wait.** Cue words come early in a line
("Now click Publish…" says it at ~410 ms) and a cursor crossing an app needs ~900 ms to arrive,
so the action can never start late enough; it can only start too late.

The fix is that **whichever side is behind waits.** If the hand needs longer than the word, the
LINE starts late; if the word is further off than the trip, the ACTION starts late. Exactly one
is ever non-zero. Measured on the real page, beat 4:

```
13912 ms  say   "Now click Publish to send it to the board."
13915 ms  point                       ← the cursor leaves immediately
14846 ms  arrived
14846 ms  press                       ← the click
14847 ms  narration says "Publish"    ← 1 ms
```

Broadcast lip-sync tolerance (ITU-R BT.1359) puts the imperceptible band at ±125 ms, so 1 ms is
not a number that needed hitting — but it is the difference between a tour and a recital, and it
costs nothing once the plan is available.

## The pacing model

`docs/src/lib/vetrina/pacing.ts` — one file, pure, DOM-free, in-folder so the boundary holds. Each
constant carries the finding it comes from.

| timing | grounded model | source |
|---|---|---|
| caption dwell | `300 + (60000/wpm)·words`, wpm 120/150/175, clamped 1.0–6.0 s | Brysbaert 2019 (~238 wpm undistracted, so a distracted budget must sit below it); BBC 160–180 wpm; the 6-second subtitle rule |
| cursor travel | Fitts's law, Shannon form `180 + 110·log2(D/W + 1)`, clamped to the same 300–820 ms | MacKenzie 1992; human mouse throughput ~4–5 bits/s, slowed to a presenter's deliberate hand |
| register beat | 350 ms, **0 when already on target** | ~200 ms saccade latency, plus the 100–200 ms the eye leads the hand in aimed movement (Land & Hayhoe) |
| settle | 650 ms | a saccade to the changed region (~250 ms) plus time to encode it (~400 ms) |
| typing | 55 ms/char | above the ~40 ms visual fusion threshold, still ~3x a fast human |

**It does NOT copy Cadenza's syllable model.** There is one of those, it lives in Cadenza, and
Vetrina reaches it through the narrator port rather than through a second copy (HARD RULE #1).
The one number the two must agree on — the reading rate — is a deliberate duplicate with a
cross-library parity test pinning them (test files are exempt from the boundary gate, which is
what makes that possible). A copy with a pin is honest; a copy without one is how the 2x came
about.

**The empirical half is narrower than the word suggests, and saying so is the point.** There is
no user study here and nothing in this branch pretends there is. What is genuinely empirical is
the measurement layer: when a narrator is wired, the line's REAL duration supersedes the estimate,
and with a voice that is the *measured* clip duration re-anchoring the word clock — the same
hybrid Cadenza already does per voice (`calibrate.ts`). A grounded default is still a guess; a
measurement is not, and the model is arranged so the measurement wins wherever one exists. A
third loop — calibrating against real viewers, from take-over and replay points — needs telemetry
this project does not collect, and adding it is a product decision, not a pacing one.

**`pacing: 'legacy'` reproduces all five literals byte for byte**, so the two can be A/B'd on one
surface in one session. A pacing change that cannot be compared is a matter of taste.

## What it cost, measured

Same tour, same app, same machine (`/proto/vetrina-caption/`):

| configuration | total | vs. the default |
|---|---|---|
| `bar` · viewport · legacy · no narration (**the default**) | 11.6 s | — |
| `bar` · host · **grounded** · no narration | 13.0 s | **+12%** |
| `cursor` · host · grounded · no narration | **30.1 s** | **+160%** |
| `cursor` · host · grounded · Cadenza (silent, timed) | 27.5 s | +138% |
| `cursor` · host · grounded · voiced (placeholder, 1.2x) | 22.2 s | +92% |

Every row is the SAME tour on the same machine, two runs each, spread under 0.2 s. That
qualification is not boilerplate: an earlier version of this table had its first two rows measured
against a tour whose captions were then edited, so its "+21%" and "+97%" were deltas between two
different demos. An independent checker caught it.

Three things the corrected table says that the broken one hid:

- **The transient caption, not the pacing model, is the cost.** Grounded pacing alone is +12%.
  Everything above that is the reading budget every beat now spends.
- **It is SLOWER without a narrator than with one** — 30.1 s silent against 27.5 s timed. Not a
  paradox: a word-cued beat is exempt from the dwell, and the cue only resolves when a narrator can
  plan the line. No narrator, no exemption.
- **Voiced is the fastest of the three** at 22.2 s, because a voiced run keeps the caption up, so
  a beat has no vanishing caption to be read ahead of and skips the dwell — on every beat except a
  `read` one, which dwells regardless (the prototype's first beat is one). The slowest
  configuration is the one a host without a TTS key would run.

Two consequences a productionization pass has to face: **narrated tours want shorter captions**,
and **the six long-running gallery tours were tuned by eye against the old numbers**, so turning
the model on by default is a re-tune, not a swap.

## Decisions taken

1. **Caption visibility is auto by mode** — silent hides during the action, voiced does not.
2. **Pacing is the cited model plus voice calibration**, not defaults alone; `speed` stays the
   only public knob, per the library's own "curated preset, not a raw number the eye can't use".
3. **`pacing` defaults to `'legacy'`, not `'grounded'`.** This reverses the first draft. The
   grounded numbers are better and every one is sourced, but adopting them re-times every
   existing tour by +13% (measured with everything else held constant), and the six long-running
   galleries were paced by eye against the old
   ones. A library option should not do that to a caller who did not ask. Flipping the default is
   a merge decision with a re-tune attached, and it is the first follow-up below.
4. **`bounds` is a first-class option**, and a CLAMPING box rather than a containing block: the
   layer stays `position: fixed` and click-through, and only the chrome's geometry is measured
   against `root`. Making the layer a child of the host would put the tour inside the host's
   stacking, overflow and transform context, which is where an overlay goes to get clipped.
   Nothing about the host's CSS has to change.
5. **The word cue is built**, both alignment directions, with the degradation path (no narrator,
   or a word the line does not contain) leaving the beat in its normal order.

## What is deliberately not here

- **A real voice.** `voicedNarrator` is here and verified, but the bytes are the caller's: HARD
  RULE #24 keeps our key off the docs site, so wiring an actual TTS voice belongs to a surface
  holding the user's own key. What this branch ships is the rung and the proof that the rung works,
  not a voice.
- **A default change.** Every new option defaults to today's behavior. `caption: 'bar'`,
  `bounds: 'viewport'`. The one exception is `pacing`, which defaults to `'grounded'` — the whole
  point is the model, and `'legacy'` is the escape.
- **Viewer telemetry.** See above.

## What the independent checker broke, and what it cost

An independent checker (HARD RULE #25's maker-checker rung) ran against the first commit and
confirmed six defects. Recording them because two are the kind that would have shipped:

1. **The cursor-anchored caption was not anchored to the cursor.** The balloon was placed once,
   when the line was set — which is at the TOP of a beat, before any travel — and never
   re-placed. It then reappeared after the performance beside where the cursor had been at the
   end of the *previous* beat. Measured at up to **561 px** from the pointer it was speaking for,
   while this document, the README and the changelog all said "next to the cursor". Placement now
   happens on the hidden→visible edge, which is the moment the cursor actually comes to rest.
2. **The e2e that certified it was ~50% flaky** (2 failures in 4 runs) — `expect.poll`'s default
   backoff reaches 1 s intervals and stepped over a visibility window a few hundred ms wide. A
   40 ms interval plus the wider window from finding 6 fixes it; re-run 10× green. The claim "6
   e2e on a real Chromium" in the first commit body was therefore not true when it was written.
   *(A later commit blamed a different symptom — an `ENOENT` on a Playwright trace file — on
   unbounded in-page rAF samplers. **That attribution was wrong**, and the second checker refuted
   it: the ENOENT reproduces on a test that installs no sampler at all, and disappears when two
   concurrent Playwright runs stop sharing `outputDir`. Bounding the samplers is still right; it
   was not the fix it was credited as.)*
3. **The default `bar` geometry changed for every existing caller.** `layout()` ran
   unconditionally, so a run that never asked for `bounds` got its bar re-seated from JS: 704 →
   680 px at 1440, 390 → 366 px at 390. The bounds machinery is now gated on `bounds: 'host'`.
4. **The speed preset was applied twice to the caption dwell** — once inside `captionMs` via the
   wpm table, once again as `* stage.pace` at the call site. `slow` spent 6720 ms on a line
   priced at 4800 (86 effective wpm) and `fast` came out at 243 wpm, *above* the undistracted
   silent-reading rate the budget exists to sit below, with the documented 1.0–6.0 s clamp
   bounding neither end.
5. **`pacing` defaulted to `'grounded'`**, re-timing every shipped tour including the Studio's
   Guide rung, whose own comment about a 480 ms register beat the change had just deleted. Now
   `'legacy'`, so the comment is true again.
6. **The step-aside starved the caption of the budget the same commit had just grounded.** On an
   ordinary beat the text lands ~140 ms after `say`, by which time the cursor is already
   performing, so the balloon was readable only during the settle: **400 ms against a 1900 ms
   budget** that was computed and then never spent.

Also fixed from the same pass: `placeBubble` scored overflow (pixels) against coverage (square
pixels), so "leaving the bounds is disqualifying" was false for any target above ~1000 px²;
`place()` wrote viewport coordinates into a layer-relative offset while its two siblings
converted; the bar's width arithmetic assumed `content-box` in a library designed to drop into
hosts where `* { box-sizing: border-box }` is the commonest reset; a stranded `performDepth`
could hide the caption for the rest of a run; `narrator.plan()` was unguarded while `speak()` was;
and the `at`-beats-`read` warning stated the opposite of what happens on the degradation path.

**That gap is closed, and the first attempt to close it did not.** "A voiced narrator keeps the
caption up" ran only in jsdom, against a `setVoiced(true)` call rather than a narrator, for as long
as no voiced narrator existed. `voicedNarrator` now exists — it takes the BYTES from its caller
(so HARD RULE #24 still holds: no key, no model, no network in this module) and plays them through
Suono, driving the word clock off the real audio clock and re-anchoring to the clip's measured
span. Three real-browser tests pin the caption rule from both sides: voiced keeps the caption up
across the whole typing reveal, silent hides it at the same moment, and the cue still lands.

**The re-anchor needed a second pass, because the first one was unfalsifiable.** The prototype
generated its placeholder clip at exactly the estimate's length, which made `align` a provable
no-op: the re-anchored timeline came out byte-identical to the estimate, so no browser test could
tell a working re-anchor from no re-anchor, or from a plain wall clock. The placeholder now runs at
1.2x — a voice slower than the estimate, which is the case the hybrid exists for — and the unit
suite drives `onStart` with a duration that differs, which is where the real assertion lives.

That second pass also found a defect the first had shipped: `align(0, 0, durationMs)` re-anchors
cue 0 and SHIFTS the rest, so a multi-sentence line stretched sentence one across the whole clip
and pushed every later sentence past the end of the audio, never to be highlighted, on a timeline
longer than the sound. Every cue is now scaled into the measured span. The test for it fails
against the old code — checked by reverting, not by assertion.

**A third pass then found that this was still not verified.** The 1.2x placeholder made `align`
arithmetically non-trivial but nothing OBSERVED it: three of the four tests written for it passed
with the re-anchor deleted entirely, because `onWord` hands back a word built from the pre-align
track, so asserting on `word.startMs` compares the estimate with itself. The suite now drives the
real audio clock across the clip and records WHEN each word goes active, over 1/2/3 sentences at
0.5x/1.2x/3x. Mutation-checked: 6 of 9 arms fail against the old `align(0, 0, dur)`, 8 of 9 fail
with the re-anchor removed. The browser cannot see this defect at all — every caption in the
prototype tour is one sentence, and the bug is multi-sentence-only — so the unit probe is the
coverage, and saying so is the point.

**Precisely what is still unverified:** a REAL voice. Every run here is placeholder audio; real
synthesis latency and a real clip are untouched by anything in the tree, and HARD RULE #24 keeps
our key off this site. Speech quality was never the claim.

## Follow-ups a productionization pass owes

- Decide whether the default flips to `'grounded'`, and re-tune or re-caption the galleries if it
  does. `'legacy'` is the default today precisely so that decision is taken deliberately.
- The `bar` caption now declares `box-sizing: border-box`, so it is 24 px narrower than before and
  finally honors the 680 px cap its own comment claims. That is a real change to a shipped
  default — small, deliberate, and the alternative was keeping an assumption that breaks in any
  host with a border-box reset.
- The e2e spec carries no `@smoke` tag, so it runs nightly and never per-PR. Tagging it is a
  question about what every PR pays for, so it is not taken here.
- The bubble at 390px is nearly the width of the host panel, at which point it has converged on a
  caption bar with extra steps. Either accept that (it is still next to the cursor) or fall back
  to `bar` below a width.
- `layout()` re-runs on `resize` only. A host that scrolls or animates its own panel moves the
  bounds box without a resize event; the cues already re-read their targets every frame, and the
  dock does not.

## The red team's pass — eleven findings, and what three of them changed

A hostile pass ran against `a4e3e0d` with the docs site rebuilt, so the browser was driving the
current source rather than a stale artifact. Three findings were high, and each was a defect the
branch's own tests could not see because the tests exercised the configuration the AUTHOR ran
rather than the one a host gets.

**1. `bounds: 'host'` put Exit completely off screen.** Measured, real Chromium at 1440x900, with
a host taller than the window — an ordinary panel in a scrolling page, which is the case the
option exists for: Exit at `y = -638` under `caption:'cursor'`, `y = +1436` under `'bar'` (which
takes the whole caption bar with it). The chrome was seated from the RAW host rect with nothing
clamping it to the window. Exit is also POINTER-ONLY — the first `Tab` is a keydown the take-over
guard reads as the viewer taking the wheel, and the run is torn down before focus can reach the
chip — so off screen means the documented escape from the demo is simply gone. The branch's own
e2e asserted containment against a proto host SMALLER than the viewport, which is the one shape
that cannot fail. Fixed in `boundsRect()`, so every consumer (bubble, `seat`, `seatCorner`) is
corrected at once: the bounds are the host intersected with the window, falling back to the window
when the intersection is empty.

**2. A voiced cursor caption was anchored where the cursor USED to be.** Reproduced at 493px — the
same defect, in the same units, that this record already claimed to have fixed at 561px. The
mechanism: a voiced caption never hides, and the bubble re-anchors only on the hidden→shown edge,
so a voiced one was placed once at the top of the beat and then sat there while the cursor crossed
the app. The docblock explaining the bug fixed only the path that hides.

The fix is not a re-anchor. **A voiced run docks the caption at the edge.** The balloon exists to
save a reading trip between the pointer and the words; a voice removes that trip. What is left is
the caption's other job — the subtitle for a viewer who cannot hear it — and subtitle practice
puts a subtitle at a fixed screen position, because a reader has to know where to look back to.
Re-anchoring mid-sentence would have traded a stale caption for a jumping subtitle, which is the
worse of the two for exactly the viewer the voiced path is there for. `run()` resolves
`caption:'cursor'` + `voiced` to the `'split'` dock; a stage a host mounts directly is untouched.

**3. The transient caption's reading budget defaulted to the number this record calls wrong.**
`caption:'cursor'` with the DEFAULT `pacing:'legacy'` — one option, which is what a host sets after
reading the caption-style table — budgeted the SELF-DISMISSING caption at legacy's 300 wpm.
Measured on the prototype's own lines: an 8-word caption up for 1900ms against the grounded 3500ms,
then erased. All 11 e2e cases and the rhythm unit tests passed `pacing:'grounded'`; **zero tests
exercised the shipping default pairing.**

The fix separates two questions the one function was answering. `captionMs` is "how long does this
beat linger", a pacing decision, and follows the model. `dwellMs` is "how long does a person need
to read this", which is physiology and follows nothing — the grounded rate under both models. An
edge dock survives the wrong number because the words stay up; a caption that erases itself does
not. (`dwellMs`, not `readMs`: the library already exports a `readMs` from `storyboard.ts` that IS
the frozen legacy 300 wpm function, and two functions with one name meaning opposite things is a
footgun, not a coincidence to leave lying around.)

**Also fixed:** a per-run `voicedNarrator` leaked an `AudioContext` with no way to release one (8
live after 8 runs, measured) — the port gained `dispose()`, the narrators implement it, and the
narrator closes only a stage it created; an `instant` beat and a cued (`at`) beat never dismissed
their captions at all, so the balloon re-anchored beside the cursor on every later beat that had no
`say` of its own; `holdCaption` had a throw path that left the caption pinned under a comment
asserting it did not; both track caches were unbounded, in service of the exact workload (a kiosk
attract loop with a counter in the line) that makes them grow forever; `setVoiced` was the only
stage verb with no `destroyed` guard; and the prototype built log rows with `innerHTML`, with one
caller interpolating an error message into the un-escaped column.

### The one fix that fixes nothing measurable, and why it still ships

`lastAim` — the rect the balloon keeps clear of — was written only by `point` and `drag`, never by
`gesture`. On a gesture-only beat the scorer was therefore fed the PREVIOUS beat's target, and the
deictic ink just drawn was not in the avoid list at all. `gesture` now writes it.

**Measured, it changes no placement.** Six gesture kinds, four geometries, with and without the
fix: byte-identical output every time. The reason is structural and is worth writing down, because
it is a property of the headline feature rather than of this fix. Avoidance works by flipping the
bubble to another quadrant AROUND THE CURSOR, so it escapes a target the cursor is outside of and
cannot escape one the cursor is sitting inside — and after a gesture the cursor is always on the
thing it gestured at. Pointing at a whole panel puts the caption on the panel, and that is correct:
the alternative is a caption 400px from the pointer, which is the one thing this style exists to
stop.

So the fix ships (a scorer fed the right rect is strictly better than one fed the wrong rect, and
it costs two lines) with **no test**, because a test that passes with the fix deleted is worse than
no test — that is the exact error the third pass caught in the re-anchor probe. What ships instead
is a pair of tests pinning the real boundary: avoidance escapes a target the cursor is outside of,
and deliberately does not escape one it is inside.

### What the red team ran that HELD

Worth recording, because a clean result on a hostile pass is evidence and an unexamined surface is
not. HARD RULE #24: no key, no endpoint, no spender in the diff, and the gate covers it because it
keys on the key NAME. HARD RULE #22: nothing here assembles a preview document — the rule does not
apply, rather than passing vacuously. The bubble cannot intercept a real click (`opacity:0` and
`pointer-events:none` mid-typing, with Exit painted above it). The live region survives hiding —
CDP `Accessibility.getFullAXTree` at `opacity:0` shows the `role=status` node present and
un-ignored, and Exit exposed as a button named "Exit the demo". No string-injection path into any
inline style (every value is numeric or a `var()` reference; theme values go through
`setProperty`, which CSSOM-validates). A hostile `plan()` returning `NaN`, `Infinity`, out-of-order
or 10,000 words does not hang or throw. A hostile `speak()` that throws, rejects, or never resolves
leaves Exit and take-over working. And the `structuredClone` removal from the third pass was
independently confirmed correct against `cursor.ts` rather than against its own comment.

### A twelfth finding, found by verifying the other eleven

Re-running the red team's measurements against the fixed build — because a jsdom test is not
verification of real behavior (HARD RULE #23) — turned up a defect none of the three lenses saw,
in the fix's own neighborhood: **the caption came back carrying the PREVIOUS beat's line.**

`say()` hides the bubble, then swaps the words and reveals 140ms later. `captionWanted` is true for
the whole of that window, so any `syncCaption` arriving inside it revealed the bubble still holding
the last line — beside the NEW beat's cursor. The typing reveal's `busy(false)` is the common
arrival. Measured on the real page: the balloon faded up to 96% showing "Everything you see happens
through its own setters." for 134ms before the words became "Give the deck a title."

It is a race against a timer, so it is intermittent — two consecutive runs of the same probe
disagreed, which is exactly why 268 unit tests and 11 e2e cases missed it. Every one of them asks
what is on screen AT REST. `captionShouldShow()` now returns false while a swap is pending. The
regression test uses `motion:'legible'`, the one tier where travel is instant while the cross-fade
stays, so the performance reliably begins and ends inside the window.

**Why this counts for more than one bug.** It is the second time on this branch that the thing
which found a defect was driving the real surface, and the first eleven were found the same way.
The unit suite was not idle — 268 tests, every fix mutation-proved — and it still could not see a
134ms visual artifact, because the oracle it has is "what is the state now", not "what did a human
see". That is the standing limit of the coverage here, and it is worth stating rather than
discovering again.

### The five measurements, re-run on the real page after the fixes

| what | before | after |
|---|---|---|
| Exit under `bounds:'host'`, host 2200px tall, window 900px | `y = -638` (cursor) · `y = +1436` (bar) | `y = 12` · `y = 786` — both on screen |
| a voiced run's caption | a balloon, stale, 493px from the pointer | 0 balloons, 1 edge dock |
| transient dwell under the DEFAULT `pacing:'legacy'`, per line | 1300 / 1900 / 1300 / 1900 / 2100 / 1700 ms | 2383 / 3350 / 2167 / 3366 / 3767 / 2950 ms |
| `AudioContext`s across 4 voiced runs | one per run | 1 |
| a line shown twice (the stale reveal) | up to 134ms at 96% opacity | each line appears exactly once |

Three of these are now in `docs/e2e/vetrina-cursor-caption.spec.ts`, next to the eleven that could
not catch them.

### The seam the red team said to look at next — measured, and it holds

Its closing line named the `sayAt` / `syncCaption` seam as having a likely third instance: the
DRAG beat, whose performance window spans the line from lift to drop, so the caption is legible
only because it is explicitly held. "The prototype tour has no drag beat, so nothing on this
branch exercises it."

That is now beat 4 of the prototype tour, and the seam holds. Measured on the real page, silent,
`caption:'cursor'`: the line goes up 66ms after it is set, stays up across the whole lift-hold-drop,
and comes down at 3367ms — against a grounded budget of 3500ms for its eight words. No stale text,
no starvation, and the reorder actually happened. Pinned as an e2e case.

Adding the beat is also the honest fix to the tour's own comment, which claimed six beats "chosen
to exercise every case the design turns on" while omitting the one case whose caption lifecycle is
different from every other.

### Still unverified after this pass

- **A real voice.** Unchanged, and unchangeable from here.
- **Chromium's `AudioContext` cap.** The leak is measured; the consequence (a wedged Run button)
  is inference from Chrome's documented limit. This sandbox has no audio device and happily built
  60 contexts.
- **WebKit.** Chromium only, with `backdrop-filter`, `color-mix` and `light-dark()` in play.
- **A scaled ancestor.** `place` and `seat` convert viewport→layer by subtracting the layer's
  origin, which is right for a translation and wrong by the factor under `transform: scale()`. The
  cursor's own positioning has had the same shape since before this branch, so it is a pre-existing
  fragility inherited rather than created — HARD RULE #18's off-path case, logged here rather than
  pulled into this diff.
