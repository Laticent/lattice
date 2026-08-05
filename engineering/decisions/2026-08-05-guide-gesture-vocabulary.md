---
status: in-progress
summary: Guide points at the slide like a karaoke follower — one move per sentence, and a pointer whose only verb is "go somewhere". This replaces that with a deictic vocabulary — underline, wash, bracket, ring, tap — chosen by the shape of the thing being named, escalated when the deck itself declared focus, and moving on BLOCK change rather than per sentence. The pointer's position stops being an independent aim and becomes a consequence of the gesture's own stroke geometry, which is what makes occlusion impossible by construction rather than by a whitespace search.
companion:
  - ./2026-08-03-present-instant-audio-pacing-guide.md
  - ./2026-08-04-vetrina-cue-stale-rect.md
  - ./2026-06-16-focus-highlighting.md
  - ./2026-07-05-vetrina-walkthrough-library.md
---

# The Guide rung learns a gesture vocabulary

**Status:** ACCEPTED + IMPLEMENTED (2026-08-05).
**Touches `docs/src/lib/vetrina/**` — maintainer review required before merge (R1).**
The library surface delta is sized in §3 so it can be reviewed on its own.

Continues #1403, which shipped the Guide rung itself. The occlusion half of the
problem was solved there, by search; this replaces the search with geometry.

---

## 1. What is wrong with Guide as it shipped

Guide today is a **karaoke follower**. `PresentOverlay` watches `reader.active.cueIndex`,
and on every change it resolves the sentence to a block and calls `stage.point()`. Two
consequences, both of them the same mistake seen from different sides:

**It moves too often.** A cue is a SENTENCE. A dense slide narrates six or eight of them,
so the arrow makes six or eight trips per slide — several of them between two sentences of
the *same paragraph*, where the destination barely changes. The eye is dragged on every
full stop. No presenter's hand does this.

**It can only say "this" by going somewhere.** `point()` is the entire vocabulary. A
pointer with one verb has to express *every* kind of naming — a heading, a stat, a table
cell, a phrase buried in a paragraph — as the same short glide. The variety a real
presenter has (the sweep along a line, the circle round a number, the flat hand over a
card) is unavailable, so the delivery reads as monotonous even when every target is right.

A presenter's hand is a **deictic**: it rests, moves to a thing worth naming, makes a
gesture that fits what it is naming, and withdraws. That is the model this implements.

## 2. The three decisions already made

Settled with the maintainer before this work started; recorded here so they are not
re-opened by whoever reads this next.

1. **Cadence — gesture on BLOCK change, escalated for notable.** Not per sentence.
2. **Layer home — the new cues live IN VETRINA**, drawn over any host at viewport
   coordinates, exactly as the existing `circle` cue is. Walkthroughs get the vocabulary
   too. (R1 expansion: §3 sizes the surface.)
3. **Scope — its own branch and PR.**

## 3. The Vetrina surface delta (R1 — read this part first)

Vetrina is a general-purpose library. This adds **three things**, fixes **three library
defects the adversarial trio found**, and changes no existing behavior that a tour can see.
Every addition is host-agnostic: nothing here knows what a slide, a deck, an iframe or a
Lattice token is.

**The precise byte-identity claim, since it was overstated once.** With no options passed,
`circle`'s ring box, corner radius, border weight, orbit radius and opacity keyframes are
numerically identical (`0.9 - 0.05 === 0.85` exactly). Two things about every tour DO change:
the ring node now carries a `data-vt-cue="circle"` attribute — inert to render, visible to a
host's `MutationObserver` — and `createStage` assigns the layer's layout `cssText` BEFORE
setting the theme tokens instead of `+=`-ing it after, which removes a read-back that could
drop custom properties on an engine that omits them from `cssText`. Both are deliberate; neither
was disclosed in the first draft of this section, and the checker was right to say so.

### 3.1 Four new members of the frozen gesture alphabet

The alphabet is curated and gated (`SANCTIONED_GESTURES` in `tools/check-ownership.js`) —
a gesture earns its place by carrying a distinct MEANING the eye reads. The existing five
are all about the *tour's own state*: hello, look-here, it-worked, it-failed, careful.
None of them can name a piece of PROSE, which is why the gate is the right place for this
conversation to happen.

| gesture | meaning |
|---|---|
| `underline` | "this line" — a stroke swept along the baseline of a single line of text |
| `wash` | "these words" — a highlighter band behind a phrase inside a longer block |
| `bracket` | "this whole block" — a soft outline just outside a multi-line block or card |
| `tap` | "this one" — a ripple on something small and discrete |

`circle` is unchanged and is the fifth member of the deictic set (the **ring**): "look
here", already the right meaning for a compact target.

### 3.2 `GestureOptions` — a fourth argument on `gesture()`

```ts
export interface GestureOptions {
  /** Emphasis. 'notable' draws heavier and holds longer. Default 'quiet'. */
  strength?: 'quiet' | 'notable';
  /** Keep the CURSOR (and the ring/bracket ink) this many px clear of the target's
   *  box. Default 0 — every existing call is byte-identical. */
  clearance?: number;
  /** Where the cursor comes to rest afterwards. Default: the gesture's own outer end
   *  (`gestureRest`). A host that knows what surrounds the target may override it. */
  rest?: Target | null;
}
gesture(kind: Gesture, target?: Target, signal?: AbortSignal, opts?: GestureOptions): Promise<void>
```

Appended, defaulted, and inert when omitted. `strength` and `clearance` also apply to
`circle`, which is why the ring can now be drawn *outside* a small target instead of on
top of it — with `clearance: 0` its geometry is exactly what it was.

### 3.3 `RectSource` gains an optional `getClientRects()`

```ts
export interface RectSource {
  getBoundingClientRect(): DOMRect;
  getClientRects?(): DOMRect[] | DOMRectList;   // NEW — optional
  scrollIntoView?(arg?): void;
}
```

Both `Element` and `Range` already satisfy it structurally, so this is the same shape of
widening as #1400's and needs no migration. It is what `wash` and `underline` need: a
phrase that wraps across three lines is **three rectangles**, and its bounding box is a
lying rectangle that spans the whole paragraph. A host that can answer with more
resolution gets a highlighter that follows the words; a host that cannot falls back to the
bounding box automatically.

**Why the library and not the host.** A gesture is theater, and theater is what Vetrina
is. Selecting WHICH gesture is a judgment about the host's own content, so that stays out
(see §4). Drawing an underline that tracks a live target, respects the three-tier motion
policy, aborts cleanly, and leaves the cursor somewhere honest is exactly the work the
stage already does five times over — a second implementation in `docs/src/components`
would be HARD RULE #15's definition of a mistake.

### 3.4 `gestureRest` — the pure function behind "position is a consequence"

```ts
export function gestureRest(kind: Gesture, box: DOMRect, rects: DOMRect[] | null, clearance: number)
  : { x: number; y: number } | null
```

Exported because the DEFAULT rest is a promise the library makes to the host, and a host
that has to decide whether that promise is safe (Guide does — see §5.4) must be able to
ask, rather than re-deriving the geometry and drifting from it.

**Asking is not free of the same mistake, and the trio caught it.** `underlineGesture` strokes
and rests on the target's FIRST line rect; `gestureRest` reads the LAST. Handing it every rect
therefore validated a point one line-height from where the cursor stops — six rests in the
corpus landed the footprint on another block's text while the check reported "clear". The host
now asks about the rect the gesture will use, and §4's `LINES_BLOCK = 1` makes a multi-line
underline rare in the first place.

### 3.5 Three library defects, found and fixed

None of these is new code's fault alone; all three are reachable now that Guide routes real
traffic through paths that were tour-only.

- **`circle` never settled when the stage was destroyed mid-orbit.** The rAF tick returned on
  `destroyed` without resolving or rejecting, so `gesture('circle')` stayed pending forever,
  holding whatever awaited it — and with it the target, its range and the frame document.
  `tween` carries a comment about this exact bug from #1400; the orbit had the same one.
- **The reduced-motion tier leaked `circle`'s ink on abort.** `if (reduced) return wait(…)`
  returned *before* the promise that owns the disposer, so on a `prefers-reduced-motion` device
  every retarget left the previous ring painted for up to 1.7 s, stacking with the next.
- **A non-finite `clearance` pinned the cursor for the rest of the session.** `Math.max(0, NaN)`
  is `NaN`; one NaN reaches `place()`, writes `"NaNpx"` (silently dropped by the CSSOM), and
  every later duration and eased `t` is NaN, so every subsequent tween resolves having moved
  nothing. `liveRect` already guarded this shape coming from a rect; `clearance` is new public
  surface and needed the same guard.

## 4. The vocabulary, chosen by target shape

Motivated variety, never a die roll. **The shape of the thing being named picks the
gesture** — the same way a hand does. The classifier is host-side (`present-guide.ts`)
because it reasons about prose, line heights and slide width, which is Lattice's
knowledge, not the library's.

| target | gesture | why |
|---|---|---|
| one wide, short line of prose | **underline** | the workhorse; zero occlusion by construction — the stroke lives in the descender gap |
| compact, roughly square (stat, chip, table cell) | **ring** (`circle`) | a closed shape reads as "this whole small thing" |
| a phrase *inside* a longer block | **wash** | the only gesture that can name part of a paragraph without naming the paragraph |
| a whole card / multi-line block | **bracket** | an outline is the only honest way to say "all of this" |
| something small and discrete | **tap** | a ring around a two-word chip is a dot; a ripple reads |

The rules, in order (the first that matches wins). `lines` is how many lines the target's
TEXT actually occupies; `W` is the slide's own width, so every threshold is
resolution-independent:

1. **wash** — the spoken sentence resolves to its own rectangles inside the block AND
   covers less than 70% of the block's text. This is the "phrase inside a longer block"
   row, and it is first because it is a fact about the CUE, not about the box.
2. **bracket** — `lines > 1`. A card, a quote, a wrapped paragraph read whole.
3. **tap** — narrower than `0.10 W`, on a single line. A chip, a bullet glyph, an inline
   `<code>`, a two-word cell.
4. **ring** — no wider than `0.42 W`, aspect ratio at most 3.2. The compact-and-substantial
   case: a stat, a table cell, a short heading.
5. **underline** — everything else. One wide, short line.

**A line COUNT, not a height ratio — and the bound is 1.** Both of those were wrong before the
adversarial trio, and both are the same mistake: measuring the box instead of the text. A ratio
of height over line-height calls a table cell with 20px of padding a multi-line card, so the
classifier counts the text's own line boxes, clustered by vertical gap so that inline markup does
not split one line into three (measured on the committed gallery render: **74 of 770 blocks**
reported more lines than they occupy, and **45 of those got a different gesture** for it). And
the bound was 2, which let a **two**-line sentence fall through to `underline` — but underline
strokes and rests on its FIRST line rect, so it named half the words and parked the hand in the
middle of the rest, on **32% of underlines** corpus-wide. A wrapped sentence is a block.

The thresholds are not taste: §7 sweeps the corpus and reports the distribution each one
produces, and they were set from that distribution rather than the other way round.

### 4.1 Escalation composes with `_focus:` — it does not invent a second "important"

Lattice already has an authored call-this-out grammar. `<!-- _focus: row 4 -->` tags the
named element `.lat-focus` on the render path Present uses, so when a slide declares
focus, **the deck has already said what matters** and Guide has no business forming a
second opinion. (`mark-*` / `tint-*` are slide-level *atmosphere* — deliberately not the
signal.)

So "notable" means exactly one thing: **the resolved target participates in `.lat-focus`**
— it is the focused element, contains one, or sits inside one. Two effects:

- **Aim.** If the block *contains* a focused element smaller than itself, Guide names the
  focused element instead. The deck said "row 4"; pointing at the table would be ignoring
  it. The shape rule then runs on the smaller box, so escalation *falls out of* the
  vocabulary rather than being bolted beside it.
- **Strength.** `strength: 'notable'` — heavier ink, longer hold.

**Considered and rejected: escalating by swapping the gesture.** "A stronger one when the
block holds something notable" reads at first like underline → ring. But then two
independent inputs pick one output, and the shape rule — the thing that makes the variety
*motivated* — loses every argument it has with focus. Volume is the axis that composes:
the shape says which gesture, the deck says how loudly.

## 5. Cadence, rest, and why the pointer stops searching for whitespace

### 5.1 The block is the beat

The cue still changes per sentence; what changes on a **block change** is the gesture.
Guide keeps the previously named element and compares. Same element → **rest**: no move,
no stroke, nothing. A five-sentence paragraph gets one gesture and then twenty seconds of a
still hand, which is what a presenter does.

**How much this buys, measured: about one move in six** (§7 — 4,105 gestures against 4,912
resolved cues). The paragraph picture is real and is the minority case, because the dominant
Lattice slide is bullets, cells and headings, where each cue genuinely *is* its own block. The
first draft of this section implied the reduction was most of the motion; it is not, and the
Munger-inversion lens was right to measure it rather than accept the framing.

### 5.2 Withdrawal is the ink's, not the cursor's

"…and withdraws" is the ink. Every cue fades after its life (as `circle` already does),
leaving the cursor at rest, clear of the text. The cursor itself stays on screen. No target at
all is still the hide case; that is unchanged.

**A correction to the first draft's reasoning, which was wrong about our own wiring.** It said
hiding the cursor between blocks would flicker the viewer's REAL pointer back, because the two
are tied together. They are not tied that tightly: the real pointer is gated on `guideAiming`,
which is set from whether the CUE RESOLVED, not from whether the fake cursor is visible. The
fake cursor could be hidden between gestures without touching the real one at all. So the trade
declined in that paragraph was never the trade on offer — the honest statement is that a
withdrawal between blocks is available, was not built, and is worth trying if the resting hand
reads as clutter when someone finally watches a deck.

### 5.3 Position as a consequence of the stroke

#1403 placed the pointer by **searching for whitespace**: twelve candidate positions round
the target, scored against every text box on the slide. It works, and it is the wrong
shape — the pointer's position was an independent decision that had to be *checked* for
occlusion afterwards.

A gesture already has geometry, and that geometry already lives outside the thing it
names. So the pointer rides the stroke, and where it stops is where the stroke stops:

| gesture | the stroke | where the cursor rests |
|---|---|---|
| underline | along the text's bottom edge, in the descender gap | past the block's right edge, on the stroke's line |
| wash | one band per line rect | past the block's right edge, on the last band's line |
| bracket | a rounded outline `clearance` outside the box | the left margin, level with the box's middle |
| ring | an ellipse `clearance` outside the box | the right margin, level with the box's middle |
| tap | a ripple from the box's center | just off the box's bottom-right corner |

Occlusion of the NAMED thing is now impossible by construction — every rest point is
outside the target's own box by `clearance`, with no search involved.

### 5.4 The residue, and the one place the search survives

What geometry alone cannot know is what ELSE is near. "Past the block's right edge" is the
slide's margin on a full-width paragraph and the second column on a two-column layout. So
Guide asks `gestureRest` where the cursor would land, tests that one box against the
slide's blocks, and only when it collides falls back to `pointerAnchor` — #1403's search,
kept for exactly the case it was written for and reduced to a fallback. §7 measures how
often that fallback fires.

This is deliberate and it is not a hedge: one candidate derived from the gesture, one
mechanical check, one fallback. Not twelve candidates every time.

**The withdrawal is TWO motions on that path, and the record should say so.** The stroke always
ends at the gesture's own resting place — including when the host has already decided that place
is occupied — and the fallback is then applied as a short second glide. So on ~30% of gestures
the hand rides out to a spot over another block, stops, and corrects. The alternative (always
compute the rest host-side and pass it) would make one motion of it, at the cost of making
`gestureRest`'s export purely advisory. Left as is, named rather than glossed.

**Two corrections the trio made to this mechanism.** The check tested against BLOCKS only, so a
rest could run off the slide card entirely with nothing there to object — `pointerAnchor` has
always refused a candidate outside the frame, and the geometry path now does too (ten gestures
in the corpus were resting on the Present backdrop). And `gestureRest` read the LAST line rect
for both `underline` and `wash`, while `underlineGesture` strokes the FIRST — so the check
validated a point one line-height from where the cursor stops. That is fixed in the library
rather than compensated for in the host, because a library that disagrees with itself will
disagree with the next host too.

## 6. Motion, abort, and the invariants that must not move

- **Three-tier motion policy.** `legible` suppresses the vestibular part of every new
  gesture — the underline and wash draw in place instead of sweeping, the bracket does not
  trace, the ripple does not expand, and the cursor teleports to rest. The *cue* still
  happens, because knowing where to look is content, not decoration. `still` additionally
  collapses the dwell.
- **Take-over and honesty.** Nothing here dispatches input or touches the host's DOM. The
  cues are `pointer-events: none` nodes on the stage layer, as every cue already is.
- **Live targets (#1400).** Every new cue re-reads its target each frame for its whole
  life. A gesture that snapshots is the defect #1400 shipped and fixed.
- **The cursor never rests on the words it is naming** (#1403). Preserved, and now by
  construction; the e2e oracle that pins it is unchanged and still green.

### 4.2 OPEN, for the maintainer: `wash` and the block cadence pull against each other

Both halves of this are the maintainer's own decisions, and together they produce something
neither of them asked for. Decision 1 says **one gesture per block**. The vocabulary table says
**wash names a phrase inside a longer block**. So on a paragraph narrated across four sentences,
the only gesture that fires is the first one — and it highlights the OPENING CLAUSE, then the
ink dies while the narrator reads the remaining three sentences with nothing on screen.

Measured on the corpus: a wash's ink names a **median 39%** of its block's text, and **582 of
887 washes** are followed by at least one further sentence of the same block, narrated silently.
A highlighter over two-fifths of a paragraph does not only fail to name the rest — it implies
the rest is not the thing you were told to look at, which is a softer version of the failure
#1403 set the bar against ("strictly worse than not pointing at all").

**Not resolved here, deliberately.** Every way out contradicts one of the two decisions:

| option | what it costs |
|---|---|
| **A — let `wash` alone keep the sentence cadence** (one condition in the effect) | a paragraph gets a highlighter walking down it — which is the karaoke cadence decision 1 rejected, in the one place it is arguably right |
| **B — cut `wash`** | 22% of gestures become `bracket`/`underline`; the vocabulary loses its only phrase-level verb and `underline` climbs past 50% |
| **C — ship as is** | the gesture is honest about *where* it starts and quiet about the rest of the block |

I have shipped **C**, because A and B each overturn a settled decision and neither is mine to
overturn while you are asleep. The numbers are here so the choice can be made in a minute.

## 6.1 A test that looked like a product defect, and the one real hardening in it

The e2e spec written for §4's variety claim failed with **no cue ink at all across three
slides**, and it looked exactly like a stoppage: one gesture at 530 ms and then thirty-nine
seconds of silence while the deck showed 3 / 3.

It was the TEST. Instrumenting the effect showed every beat arriving as `2:*` — Present was
opening on slide **three**, because `setEditorContent` leaves the editor on the last slide and
Present starts where the editor is. The deck never advanced because it was already at the end,
and the run recorded was the correct cadence on one slide: the first cue washed the paragraph,
the next two rested on it. The spec now drives to slide 1 before playing.

Recorded because the reflex was to reach for a product fix, and the first "fix" was applied
before the mechanism was confirmed. **A failing oracle is a claim about the oracle too**, which
is the same lesson as the four testing failures in the #1403 record, arriving from the other
direction: there, a green test was believed; here, a red one was.

**One change survives it, on its own merits.** The effect keyed on `reader.active.cueIndex`
alone, and a cue index is per-SLIDE — it cannot distinguish slide 2's first sentence from
slide 1's. Today it survives that because the reader is rebuilt on arrival and `active` is
briefly undefined, so the value passes through `-1` and the effect re-runs. That is an accident
of the rebuild's timing rather than a stated property, and **#904 and #1394 are both this exact
shape**: an effect keyed on a value a later change made stop varying. The trigger is now
`${narration.idx}:${cueIndex}` — one template string, and the hazard is gone. It is hardening,
not a fix for anything observed, and it is not claimed as one.

## 7. Measurement (R3)

Reasoning about which gesture a corpus produces is exactly the mistake #1386 and #1403 were
both burned by. Committed sweep: `tools/sweep-guide-gestures.mjs` (`npm run sweep:guide`).
It renders every deck in `examples/` + `test/integration/baseline-decks/`, reads each one's
REAL narration out of the read-along WebVTT the emulator writes — the same `buildTrack`
segmentation Present narrates from — and calls the SHIPPING `guideCueIn` per cue in a real
Chromium. The classifier is bundled and injected, not re-implemented.

**It reports two populations, and the first draft of this section only reported the wrong one.**
A per-CUE tally describes something no viewer sees, because the cadence gestures on a BLOCK
change and rests otherwise. The sweep now replays that rest guard, so the per-GESTURE column is
what actually reaches a screen. The Munger-inversion lens found this; the correction is its.

**126 decks · 5,879 cues:**

```
resolved to a target            4912  83.6%     (83.5% before this work — the matcher did not move)
slides with narration           1249, of which 79 resolve nothing at all
notable (a `_focus:` element)      6   0.1%
gestures 4105 · rests 807 · hides 967
rest fell back to the search    30.0% of gestures

vocabulary        per CUE        per GESTURE
  underline   1606  32.7%      1578  38.4%
  bracket     1490  30.3%      1404  34.2%
  wash        1595  32.5%       902  22.0%
  tap          197   4.0%       197   4.8%
  circle        24   0.5%        24   0.6%
```

**What the numbers say, including the parts that are not flattering.**

- **The match rate is unchanged at 83.6%**, against 83.5% before. That was the cross-check that
  mattered: the vocabulary changes what happens *after* a target is found, and the number
  confirms it did not quietly move the matcher.
- **The vocabulary really varies.** No verb exceeds 39% of what a viewer sees, and the three
  that carry it — underline, bracket, wash — split 38 / 34 / 22. A rule set that answered
  `underline` to everything would be the karaoke follower with extra steps, and this rules
  that out.
- **THE CADENCE BUYS LESS THAN §5.1 IMPLIES, AND THE HONEST NUMBER IS 16%.** 4,105 gestures
  against 4,912 resolved cues: the block cadence suppresses about one move in six, not most of
  them. §5.1's picture — a five-sentence paragraph reduced to one gesture — is real and is the
  minority case, because the dominant Lattice slide is bullets, cells and headings, where each
  cue genuinely *is* its own block. The premise of §1's diagnosis holds for prose decks and
  much less for the rest, and nothing here should be read as claiming otherwise.
- **And each surviving move is heavier than what it replaced.** A `point()` was a half-second
  glide with no ink; a gesture is an approach, a swept stroke, and ink with a ~2 s life. Whether
  fewer-but-louder is a net win for the eye is **not measured and not measurable from here** —
  it needs a person watching a deck (§8).
- **`circle` is nearly unreachable (0.6%), and that is a consequence, not a target.** The ring
  needs a target compact in both axes and wider than a tap's threshold, which after the
  line-count fix means a genuinely large single-line stat. 24 cues in 126 decks have one. It
  earns its place on the slides that do rather than by frequency, and it stays because `circle`
  predates this work and is a tour cue regardless.
- **Escalation is nearly invisible: 6 cues, 0.1%.** Only one deck in the corpus authors
  `_focus:` at all. Stated plainly, because a 0.1% path is one nobody has really seen run.
- **The stroke's own ending is occupied 30.0% of the time.** So geometry answers about seven
  gestures in ten and #1403's search covers the rest. That is lower than "impossible by
  construction" sounds, and the distinction is exact: occlusion of the NAMED thing is impossible
  by construction; landing on some OTHER block nearby is not, and never was. (The rate is
  measured with the cursor footprint Present actually has — a 4K deck shown in a ~1440 card
  makes the 28px pointer cover ~75 slide px, and measuring it at 1:1 understated this by six
  points.)

## 8. Verification (HARD RULE #23)

| Claim | Surface | Artifact |
|---|---|---|
| The vocabulary draws, tracks, disposes on abort, and leaves the cursor clear | jsdom unit | `docs/src/lib/vetrina/deictic.test.ts` — 27 cases |
| `circle` and every existing tour are unchanged with no options | jsdom unit | pinned by the "byte-identical" case; the two deliberate exceptions are named in §3 |
| The classifier, the focus refinement, the range mapping, the rest fallback | jsdom unit | `present-guide.test.ts` — 64 cases |
| The vocabulary over the real corpus, per cue AND per gesture | real Chromium, 126 decks | §7 |
| One gesture per BLOCK, and more than one verb across shapes | real Present overlay, Chromium | `docs/e2e/present-guide.spec.ts` |
| The cursor never comes to REST on slide text | real Present overlay | the pre-existing #1403 oracle, unchanged and re-run green |

**Every unit test is verified by breaking what it names and watching it go red** — a committed
battery of 42 mutations, each one confirmed to have applied before its spec is run, because a
mutation that did not apply proves nothing.

**The first version of that claim was false, and the checker proved it.** Four tests survived the
exact defect they were named for, every one of them because the fixture could not reach the
mechanism: the sweep test was satisfied by the APPROACH tween that runs before the sweep; the
clamp test never reached the clamp (the slide-margin candidates fit, so `pointerAnchor` returned
first); the neighbor test put its obstacle where distance alone already won; and the
inline-fragment test stubbed three rects at an identical `top`, which no real inline fragment has.
All four are rewritten to reach what they name. The checker also found twelve places where a
behavior change failed nothing at all — the frame-scale conversion, the slide width, the
`isConnected` guard, the obstacle list, `strength` — and those now have tests too.

### 8.1 Logged, not fixed (HARD RULE #18 — found, not caused)

- **Inline `<code>` is in `BLOCK_SELECTOR` and can take a cue.** It is the only inline element in
  that list, and a whole spoken sentence sitting inside one resolves to the `<code>` rather than
  its paragraph. Pre-existing since #1397, rare, and narrowing the selector is a change to the
  MATCHER, which this branch deliberately does not touch (its 83.7% is the cross-check that this
  work moved nothing).
- **`guideAimFor` and `guideCueIn` disagree about a zero-area element.** The cheap pre-check
  answers the element; the full decision then rejects it for having no area, so the rest guard can
  never engage for that block and the expensive path re-runs on every following sentence of it.
  Wasteful, never wrong.

**UNVERIFIED, deliberately:**

- **How it FEELS — and this is the gate that matters most.** Nothing here says the underline
  reads as an underline, that the cadence reads as a presenter rather than a machine holding
  still, or that fewer-but-heavier moves are a net win for the eye. §7 says the last of those is
  not measurable from here. It needs a person, a deck, and two minutes; `examples/guide-gestures.md`
  is built to be that deck.
- **Anything about narrated AUDIO.** The e2e tier drives the silent rung; synthesis, the cache
  and the prefetch window are untouched by this work and unexercised by it.
- **The `_focus:` escalation on a real slide.** Its unit coverage is complete and the corpus
  gives it 6 cues; nobody has watched it run.
- **A Greek deck loses phrase-level ink.** `toLowerCase` maps a word-final `Σ` contextually, so
  the reconstruction guard refuses the range and every cue degrades to its block's own box. It
  fails safe, and it fails.
- **The e2e tier is NIGHTLY and off the PR gate.** Green PR checks do not mean these specs ran.
  They were run here, against a production build, and are green.
