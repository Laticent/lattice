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

Vetrina is a general-purpose library. This adds **three things** and changes no existing
behavior. Every addition is host-agnostic: nothing here knows what a slide, a deck, an
iframe or a Lattice token is.

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

The rules, in order (the first that matches wins). `lh` is the target's computed line
height; `W` is the slide's own width, so every threshold is resolution-independent:

1. **wash** — the spoken sentence resolves to its own rectangles inside the block AND
   covers less than 70% of the block's text. This is the "phrase inside a longer block"
   row, and it is first because it is a fact about the CUE, not about the box.
2. **bracket** — the block is taller than `2.6 lh`. Multi-line: a card, a quote, a
   wrapped paragraph read whole.
3. **tap** — narrower than `0.10 W` and no taller than `1.5 lh`. A chip, a bullet glyph,
   an inline `<code>`, a two-word cell.
4. **ring** — no taller than `2.6 lh`, no wider than `0.42 W`, aspect ratio at most 3.2.
   The compact-and-substantial case: a stat, a table cell, a short heading.
5. **underline** — everything else. One wide, short line.

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
no stroke, nothing. That is most of the fix. A five-sentence paragraph now gets one
gesture and then twenty seconds of a still hand, which is what a presenter does.

### 5.2 Withdrawal is the ink's, not the cursor's

"…and withdraws" is the ink. Every cue fades after its life (as `circle` already does),
leaving the cursor at rest, clear of the text. The cursor itself stays on screen, because
hiding it between blocks would flicker the viewer's REAL pointer back on every few seconds
— the two are tied together deliberately (#1403), and untying them to buy an animation
would be a bad trade. No target at all is still the hide case; that is unchanged.

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
Chromium. The classifier is bundled and injected, not re-implemented, so the mechanism is in
the path by construction.

**124 decks · 5,782 cues:**

```
resolved to a target            4839  83.7%
slides with narration           1232, of which 79 resolve nothing at all
notable (a `_focus:` element)      6   0.1% of resolved
rest fell back to the search    1360  28.1% of resolved

underline  2163  44.7%
wash       1569  32.4%
bracket     760  15.7%
tap         178   3.7%
circle      169   3.5%
```

**What the numbers say, including the parts that are not flattering.**

- **The match rate is unchanged at 83.7%**, against #1403's 83.5% on a slightly smaller corpus.
  That is the cross-check that mattered: the vocabulary is a change of what happens *after* a
  target is found, and the number confirms it did not quietly move the matcher.
- **The vocabulary really varies.** No verb exceeds 45%, and the two that name a whole block
  (underline for one line, bracket for several) together account for 60% — which is the right
  shape for prose decks. A rule set that answered `underline` to everything would be the karaoke
  follower with extra steps, and this is the measurement that rules that out.
- **`tap` and `circle` are rare (3.7% / 3.5%) and that is correct, not a defect.** They name a
  target that is compact in BOTH axes, and a compact thing rarely carries a whole spoken
  sentence — the narration for a stat tile says "Total revenue: four point two million dollars",
  which lives in the tile, not in the number. They earn their place on the slides that have
  them rather than by frequency.
- **Escalation is nearly invisible: 6 cues, 0.1%.** Only one deck in the corpus authors
  `_focus:` at all, and its focused rows rarely hold the spoken sentence. The mechanism is
  right and the corpus simply does not exercise it — stated plainly rather than dressed up,
  because a 0.1% path is one nobody has really seen run.
- **The stroke's own ending is occupied 28.1% of the time.** So geometry answers about seven
  cases in ten and #1403's search covers the rest. That is lower than "impossible by
  construction" sounds, and the distinction is exact: occlusion of the NAMED thing is impossible
  by construction; landing on some OTHER block nearby is not, and never was.

## 8. Verification (HARD RULE #23)

| Claim | Surface | Artifact |
|---|---|---|
| The vocabulary is drawn, tracks its target, disposes on abort, and leaves the cursor clear | jsdom unit | `docs/src/lib/vetrina/deictic.test.ts` — 21 cases, 14 mutations run |
| `circle` and every existing tour are byte-identical with no options | jsdom unit | the mutation "circle inflates even at clearance 0" goes red |
| The classifier, the focus refinement, the range mapping, the rest fallback | jsdom unit | `present-guide.test.ts` — 60 cases, 20 mutations run |
| The vocabulary over the real corpus | real Chromium, 124 decks | §7 |
| One gesture per BLOCK, and more than one verb across shapes | real Present overlay, Chromium | `docs/e2e/present-guide.spec.ts` |
| The cursor never comes to REST on slide text | real Present overlay | the pre-existing #1403 oracle, unchanged and still green |

**Every unit test was verified by breaking what it names and watching it go red** — 34
mutations across the two files. The eight that survived are recorded rather than written off:
two exposed real defects in the code (`gestureRest` ignored the ink rects it was handed; the
`legible` tier could stop at the stroke's start), three exposed a coverage hole (jsdom has no
line boxes, so the text-geometry path was untested until a layout-stubbed suite drove it), and
one was genuinely behavior-preserving thanks to a second guard, which is recorded as such.

**UNVERIFIED, deliberately:**

- **How it FEELS.** Nothing here says the underline reads as an underline, or that the cadence
  reads as a presenter rather than a machine holding still. That needs a person watching a deck.
- **Anything about narrated AUDIO.** The e2e tier drives the silent rung; synthesis, the cache
  and the prefetch window are untouched by this work and unexercised by it.
- **The `_focus:` escalation on a real slide.** Its unit coverage is complete and the corpus
  gives it 6 cues; it has not been watched running.
- **The e2e tier is NIGHTLY and off the PR gate.** Green PR checks do not mean these specs ran.
