---
status: shipped
summary: Round two picked a gesture from the target's own box, so it drew an outline around a card that already had a border, a box around a timeline stage on a rail, and an underline under a bullet whose bullet was right there. This adds two steps before the classifier — what KIND of thing is this, and where is its HANDLE — so a list is named by its bullet, a card by its header, a timeline stage by its rail disc and a stats figure by its value; adds the redundant-boundary rule (never outline something that already has one); matches a cue the projection joined out of two blocks; and gives the Vetrina cursor an arc, an overshoot and a tremor so it moves like a hand.
companion:
  - ./2026-08-05-guide-gesture-vocabulary.md
  - ./2026-08-04-vetrina-cue-stale-rect.md
  - ./2026-07-05-vetrina-walkthrough-library.md
---

# Guide, round three: what a hand points AT, and how a hand moves

**Date** 2026-08-05 · **Issue** #1418 (round two: `2026-08-05-guide-gesture-vocabulary.md`)
**Status** implemented · **Scope** `docs/src/components/studio/present-guide.ts`,
`docs/src/lib/vetrina/{stage,theme}.ts`

Round two gave Guide a vocabulary and picked from it by measuring the target's box. Watching it
run produced five reports, and they are one report:

> "for ordered and unordered lists the bullets should have an effect that highlights **them**
> instead of list elements … for cards with headers the **header** should have an effect … for
> timelines we don't need to put a box on the list elements, should add an effect to the header or
> highlight the timeline **rail bullet** … split-compare exhibits some odd behavior where the first
> bullet is not highlighted but the subsequent bullets are … mouse movement should have slight
> jitters to make the movement a bit more natural."

Four of the five are the same defect: **it named the container when a hand names a handle.** The
fifth is about the hand itself.

This record is the design model — what changed, why, and what the evidence is. §1–3 are the
perception argument, §4–6 the mechanisms, §7 the measurement, §8 what is NOT verified.

---

## 1. What went wrong, reproduced before it was theorized

Every claim below was reproduced against a real Chromium render of a probe deck carrying the four
shapes named, driving the **shipping** classifier (`guideCueIn`) — not described from the report.

| Slide | What round two did | What it should be |
|---|---|---|
| `split-compare` | first bullet: **nothing at all**; bullets 2–3: `bracket` | all three cued, consistently |
| `cards-grid` | `bracket` around a **368×438 card that already has a border** | the card's header |
| `list-steps timeline` | `bracket` around a **162×181 stage on a rail** | the rail disc |
| `list-criteria` | `bracket` around a **1152×98 row** | the index number |
| plain `ul` | `underline` under the whole line | the bullet |
| `stats` | **every figure on the slide: nothing at all** | the value |

The two "nothing at all" rows were not in the report and were found by reproducing it. `stats`
narrates `"<label>: <value>."`, which no single element contains — so the whole slide went dark,
silently, on every deck that has one.

---

## 2. The perception argument, and who it comes from

The maintainer asked for "a more scientific approach based [on] human visual perception, visual
cues, and … the perspective of master presentation and visualization and CGI animation experts."
Five results carry the design. They are load-bearing, not decoration: each one decides a rule
below, and the rule is falsifiable against it.

**Object-based attention — Egly, Driver & Rafal (1994).** Cue any part of a perceptual object and
attention spreads across the *whole* object, faster than it spreads to an equidistant point in a
different object. This is the license for the entire round: **ringing a bullet delivers its line.**
Without it, "point at the marker" would be trading information for tidiness. With it, the box
around the line buys nothing the bullet did not already buy.

**Saccadic targeting.** A saccade is aimed at a *location*. An outline around a 368×438 card gives
the eye no location — it lands somewhere inside and then searches. A ring around a 23px disc is a
landing point. (This is the practical half of what Fitts's law describes for the hand and Carpenter
for the eye: aiming needs a point.)

**Pre-attentive features and motion onset — Treisman & Gelade (1980); Abrams & Christ (2003).**
Motion is found without search, and it is motion *onset* that captures attention rather than
motion in progress. So a cue's crisp start matters more than its duration, and a cue that persists
is a cue that stops working while still costing.

**Signaling and coherence — Mayer & Moreno.** Cueing where to look improves comprehension;
extraneous animation reduces it. The two together say: cue, and cue *nothing else*. Which is Tufte's
**smallest effective difference** arriving from a different direction — the least ink that makes
the distinction — and Duarte's and Reynolds's signal-to-noise, arriving from a third.

**Gestalt common region — Wertheimer; Palmer & Rock.** A bordered card is *already* a group. A
second outline around it is not emphasis; it is a duplicate boundary, and the eye has to decide
which of two nested regions is the message. **This is the "no box on the timeline items" report,
stated as a rule** — and §5 enforces it literally.

For the hand (§6) the sources are different: **Thomas & Johnston's** twelve principles (arcs, slow
in/slow out, follow-through), **Woodworth (1899)** and **Meyer et al. (1988)** on the two-phase
ballistic-then-corrective structure of aimed movement, and the ordinary physiology of a held hand —
an ~8–12 Hz tremor riding a ~1–3 Hz postural drift.

---

## 3. The model: three questions, in order

Round two asked one question — *how big is it?* Round three asks three, and the order is the whole
design:

1. **What kind of thing is this?** — its role, from the DOM's own structure.
2. **Where is its handle?** — the smallest visual token that stands for it.
3. **How do I name it?** — the gesture, chosen from the *handle's* shape.

Round two's classifier is intact and is now step 3. Steps 1 and 2 are new, and they are where the
four reported defects are fixed.

---

## 4. The handle (`anchorFor`)

The handle is resolved by priority, and the priority is the argument:

| # | Handle | When | Why it beats the next one |
|---|---|---|---|
| 1 | **the phrase** | the cue covers < 70% of the element | naming *part* of a thing has to show which part; a bullet would name the whole line |
| 2 | **the marker** | the item renders a `::marker` or a `::before` in its place | a bullet is the token that already means "this item" |
| 3 | **the header** | the element has leading text before a nested block | a card's title is what it is called |
| 4 | **its own words** | everything else | it is just text |

**The marker is derived, not measured** (`markerBox`), because a marker is not a node. Three inputs
that *can* be measured: the element's box, where its first line of text actually starts, and the
pseudo-element's computed size (Chromium resolves `::before`'s `width`/`height` to real pixels).
Three shapes, which are the three Lattice ships:

- **block above** — `list-steps.timeline`'s rail disc, a flex child atop a centered column;
- **inline left** — `list-criteria`'s absolutely-placed index;
- **the real `::marker`** — `list-style: disc`, painted *outside* the item in the list's own
  `padding-left`, which is why the gutter is where it has to be looked for.

Two details earn their place. The glyph is sized from `list-style-type`, **not** from the gutter: a
gutter is authored for the widest marker the list will ever hold, so measuring it reported a 9px
bullet at 19px — which crossed the ring threshold that the real bullet does not. And "is the disc
centered on its item" is **measured** (compare the text's center to the box's), not read off
`text-align`, because the centering can come from the element, its flex parent, or an ancestor, and
only the resulting geometry knows which happened.

**The header is a range, not a selector** (`headerRange`) — everything before the element's first
nested block. `cards-grid` ships its card title as a bare text node, `split-compare` and
`list-criteria` ship a `<strong>`; one range covers both, and a `querySelector` per component would
be Guide learning the component catalog by heart.

Where computed styles are unreachable — a parsed document, a torn-down frame — every rule above
returns "no handle" and the cue falls through to the element's own words. Failing to the previous
behavior is the only safe direction.

---

## 5. The redundant-boundary rule (`hasOwnBoundary`)

**`bracket` draws a common region around what it names, so it is only ever right for something that
does not already have one.** An element with a real border, a real fill or a real shadow sweeps its
words (`wash`) instead of being outlined.

"Real" is doing work: Chromium reports `rgba(0, 0, 0, 0) 0px 0px 0px 0px` for an element that
merely sits inside a shadow token's scope, and reading that as a boundary would exempt most of a
deck from `bracket` and quietly turn the rule into "never bracket anything".

Measured effect: **`bracket` fell from 34.2% of gestures to 14.1%** (§7). That single number is
most of what the maintainer was reacting to.

---

## 6. The hand (`handOffset`, `theme.hand`)

Vetrina's cursor stands in for a presenter's hand, and it moved in a way no hand does: a straight
line at a symmetric ease. Three departures, each with a name outside our source:

1. **Arcs.** A limb is hinged, so a reach traces a curve; a straight path is the one trajectory an
   arm cannot take without actively correcting for it.
2. **Ballistic + corrective.** An aimed movement is two phases — a fast open-loop throw that lands
   slightly off, then a slow correction onto the target. A symmetric ease has neither.
3. **Tremor.** A held hand is never still. The amplitude is small; its *absence* is what reads as
   CGI.

**It is not `Math.random()` per frame.** White noise is a rattle: energy at every frequency,
including ones no limb produces, and un-reproducible, so no test could ever pin it. `handOffset` is
a sum of sinusoids at hand frequencies with a per-movement phase from a seeded hash — band-limited
by construction, deterministic given the same sequence of movements.

Two invariants the displacement holds, because the rest of the library rests on them:

- **The endpoints are exact.** The envelope is zero at *t*=0 and *t*=1, so a glide starts where the
  cursor is and ends on the point it was given. Every deictic gesture's ink, every `gestureRest`
  answer and every host occlusion check depends on the destination being the destination.
- **The logical position never wobbles.** The displacement is applied when *painting*, never to
  `cx`/`cy`. A tween's start point, `centerOf`, the anticipation streak's angle and `gestureRest`
  all read the clean path; only the pixels carry the hand.

Zero under the `legible` and `still` motion tiers, without the host asking: a wobble **is**
vestibular motion, and a viewer who asked for less of that did not ask for a more lifelike version
of it. A host can also set `hand: 0`, which reproduces the previous glide sample for sample (pinned
by a test).

### 6.1 The double hop, found on the path and fixed here

Wiring the marker's resting place exposed a defect round two shipped: `gesture()` applied an
explicit `opts.rest` as a **withdrawal after** the stroke, so a host that passed one got two moves —
to the gesture's own ending, then a correction. That default ending is *precisely the position the
host rejected as occupied*, so the cursor visibly stuttered **through** the words it was placed to
avoid. It affected 25–30% of Lattice's gestures already, silently.

The four deictic gestures now end on the host's rest themselves (`restOf`). `circle` keeps the
withdrawal, because an orbit has no ending to redirect.

---

## 7. Measured, not reasoned about

`npm run sweep:guide` — 126 committed decks, 5,879 real cues, the shipping classifier bundled and
injected into a real Chromium. Reported **per gesture**, because the cadence rests between cues.

| | round two | round three |
|---|---|---|
| resolved to a target | 83.7% | **92.1%** |
| cues that resolve nothing (hides) | 951 | **464** |
| underline / wash / bracket / tap / ring | 38.4 / 22.0 / **34.2** / 4.8 / 0.6 % | 40.2 / 25.2 / **14.1** / 13.1 / 7.4 % |
| rest fell back to the search | 30.0% | **25.6%** |
| handle: body · phrase · header · marker | — | 51.8 · 29.8 · 9.6 · 8.9 % |
| matched piecewise (a label joined to its body) | — | 9.3% of resolved cues |

Read the vocabulary row as the answer to the report: **boxes more than halved**, and the two
gestures that name a small handle went from 5.4% of the corpus to 20.5%. The reach gain is the
piecewise matcher: 503 cues that used to hide now resolve, and they are the *first item of every
group* on the shapes that join a label to its body.

`npm run mutate:guide` — a committed battery that injects the defect each test is named for,
**asserts the mutation actually applied**, and reports every survivor. Extended to 68 mutations for
this round.

---

## 8. What is NOT verified

- **How it FEELS is unverified, and it is the gate that matters most.** Nothing here says the arc
  reads as a hand rather than as a bug, or that a ring on a rail disc reads better than a box
  around its stage. It needs a person, a deck and two minutes.
- **The perception results are cited for their DIRECTION, not measured here.** Object-based
  attention predicts that cueing a marker delivers its item; nothing in this repo measures whether
  it does so *for these viewers on these decks*. The claim being made is "the design follows a
  known result", not "we replicated it".
- **`hand` changes every existing tour's motion.** It is defaulted on because it was asked for; it
  is themeable to 0 and suppressed under reduced motion, and a test pins that 0 is the old path.
  No walkthrough has been watched end-to-end since.
- **A phrase inside an enclosed element now washes rather than brackets.** That is the intended
  rule, and it inherits round two's open question (`…-vocabulary.md` §4.2): wash and the block
  cadence still pull against each other.
- **`_focus:` escalation fires on 7 cues in the whole corpus.** Unit coverage is complete; nobody
  has watched it run.
- **The unit tests for the handle stub geometry**, because jsdom has neither layout nor
  pseudo-elements. They pin the RULES. The real-surface evidence is the corpus sweep and the e2e
  specs, and neither is replaced by them (HARD RULE #23).

## 8.1 Logged, not fixed (found, not caused)

- `list-criteria` renders through its `:not(:has(.crit-body))` **bare-renderer fallback** path in
  the emulator, though its own CSS says "our engine ALWAYS emits `.crit-body`". Off the path of this
  change; it changes which selectors style the row, not whether Guide can find its handle.
