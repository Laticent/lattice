---
status: shipped
summary: >
  The unexplained half of the iPhone report has a mechanism, it is not iOS-specific, and it was
  measurable in the sandbox the whole time — the instrument was pointed at the wrong box. A
  walkthrough's own caption covers a band of the viewport, and nothing that reveals knew it
  existed. `block: 'nearest'` scrolls the MINIMUM, so a target that was below the fold lands its
  bottom edge flush with the edge the caption is painted against; on a phone that caption is
  `scrim`, a 230px gradient reaching 90% opacity exactly there. Measured on the Studio's phone
  tour, the freshly typed tail of the document settled 225px inside the gradient on real WebKit at
  an iPhone 15 Pro box — behind ~90% black, with the subtitle 73px below it — and 92px inside it on
  Chromium at 390x844, behind ~50%. The severity tracks the viewport, and the worse of the two is
  the box the report came from. The committed sampler scored both 0px, because it asked whether the
  tail was inside the EDITOR rather than inside the visible part of it: on WebKit the worst tail
  position is the SAME absolute y before and after this change (712 in a 659px window), reading
  53px against the scroller's bottom and 283px against the caption's top. One position, two rulers,
  and the previous pass took the identical before/after numbers as evidence the symptom was
  elsewhere.
  Each caption style now declares the band it PAINTS over, every reveal asks for that much room
  through `scroll-margin` (so the browser keeps choosing which ancestor scrolls), and the number
  is published as `--vt-chrome-top`/`--vt-chrome-bottom` for a host that scrolls its own content.
  Two limits the previous record logged are closed with it: a viewer's own scroll now re-seats
  `bounds: 'host'` chrome, and a tour started in Compose follows its typing. Real iOS Safari
  remains UNVERIFIED, and this does NOT claim to have closed the report: it found and fixed a
  mechanism that reproduces off-device, which the previous pass ruled out on a blind instrument.
  Whether it is THE report needs the device, and a second defect is still live on that path — the
  markdown editor has no software-keyboard inset at all.
---

# A walkthrough's caption is an occluder, and everything that reveals has to clear it

**The report, once more.** "Vetrina no longer scrolls things into the viewport", on an iPhone, on
the `/vetrina` demo page and in the Studio editor while a tour was typing. The previous record
(`2026-09-13-vetrina-reveals-its-target.md`) found a real mechanism for the first half — nothing in
the stage had ever scrolled — fixed it, and could not reproduce the second half at all. Its closing
line named the candidates it could not reach from a sandbox: the software keyboard's visual-viewport
offset, and Safari's collapsing chrome.

**Neither of those had to be reached to find a mechanism.** Both halves of the report turn out to be
one, it reproduces on Chromium at 390px and on real WebKit at an iPhone box, and the reason it looked
unreachable is that the instrument could not express it. That is a weaker claim than "this was the
bug" and it is the one the evidence carries: the device is still owed, and §"what is not verified"
says what is still live there.

## 1. The mechanism

`block: 'nearest'` scrolls the *minimum*. That is the property that makes the reveal safe to run
before every aim — a target already in view moves nothing — and it is also the property that puts a
target which was below the fold **flush with the bottom edge of the window**. The committed spec
recorded exactly that and read it as success:

> `block: 'nearest'` lands the bottom edge FLUSH with the window's, so at 390x844 it measured
> 844.171875 against a viewport of 844: fractional layout, not an overshoot.

The bottom edge of the window is where this library paints its own caption. With the default `bar`
that is a dock about 120px up from it (measured: 123). With `caption: 'scrim'` — the Studio's
**phone** choice, `b.mobile ? 'scrim' : 'bar'` — it is a 230px gradient running
`transparent → 45% → 82% → 90%` of `--vt-caption-scrim` (`#06090f`), with a 15px semibold subtitle
riding it at `bottom: 78px`.

So the cue scrolled to its target and then talked through it. On a desktop the caption is a thin bar
over a tall pane and the effect is a nuisance; on a 659px phone window the caption owns the bottom
35% of the screen, and "the tour does nothing" is a fair description of what you see.

### The same mechanism, on the editor

The Studio's phone tour types through the CONTROLLED `setSource` path (a native insert races the
React `value` prop and drops characters), which moves no caret, so `EditorHandle.revealTail` is what
follows the typing. It called `EditorView.scrollIntoView(doc.length, { y: 'nearest' })` — the same
`nearest`, landing the new line flush with the bottom edge of the editor's scroller, which on the
phone *is* the bottom edge of the window. Every line the tour typed arrived under the gradient.

Measured during the real phone tour, with the caption up. The two columns are the same measurement
on two viewports, and the difference between them is the point:

| | Chromium @ 390x844 | real WebKit @ iPhone 15 Pro (393x659) |
|---|---|---|
| caption's top edge | y = 614 | y = 429 |
| subtitle's top edge | y = 745 | y = 560 |
| tail of the document, **settled** | y = 689–706 | y = 633–654 |
| depth into the 230px gradient | 92px | **225px** |
| gradient alpha over that line | ~0.48–0.57 | **~0.88–0.90** |
| worst instantaneous depth | 115px (α ~0.68) | 283px (below the fold) |

**Say what each number is.** The settled depth is where the line sits once the reveal has run; the
worst is a transient during a growth frame. An earlier draft of this table put Chromium's 115 beside
WebKit's 225 and called both "how far inside the caption" — a worst against a settled, which is the
same two-rulers error §2 convicts the previous pass of, in the table whose whole job is to be the
thing nobody re-derives.

**And the severity is not the same on both.** On WebKit at an iPhone box the line sits behind ~90%
black with the subtitle 73px below it: unreadable, and that is the viewport the report came from. On
Chromium at 390x844 it is behind ~50%: dimmed, still legible. So the Chromium run establishes the
MECHANISM off-device — which is what makes it reproducible and testable here — and the WebKit run is
what establishes the harm. Neither is iOS (see the last section).

## 2. Why the previous pass measured nothing — the instrument, not the device

`demo-mobile.spec.ts` sampled `off = co.bottom - scrollDOM.getBoundingClientRect().bottom`. That
asks *is the tail inside the editor*. What was reported is *can I see what it is typing*. Those come
apart precisely where a fixed, body-portalled layer at z-index 2147482000 paints over the editor,
which is a thing no measurement of the editor's own box can see.

The arithmetic is exact, and it is the most useful line in this record:

- **Real WebKit, worst tail position: y = 712, before and after this change.** Against the old ruler
  (the scroller's bottom, 659) that is 53px. Against the new one (the caption's top, 429) the
  identical frame is 283px. The number moved; the pixel did not.
- **Chromium's old reading was SATURATED.** Its tail never passed 844, and `max(0, co.bottom - 844)`
  can only ever print 0. The same frames measure 49px against a visible bottom of 614.

So the previous record's table — "identical before and after, therefore this is not the symptom" —
was reading a ruler that could not move. The conclusion drawn from it (that the remaining candidates
were on-device) was the reasonable inference from a blind instrument, and it was wrong.

**The lesson is narrow and worth keeping:** an oracle that saturates reports agreement between a
hypothesis and its negation. Both cells of that table were `max(0, …)` clamped at zero on one
engine, and 53px of measure lag on the other. Neither could have distinguished a working follow from
a broken one, and nothing in the arm said so.

## 3. The fix

### Each caption style declares what it paints over

`BuiltDock` gains `occludes(): RectLike | null` — measured from the rendered box, not derived from
the style constants, because a `bar` grows upward as its text wraps and the inset has to grow with
it. **It is required, not optional**, for the same reason `layout` is: an optional member lets a new
caption style compile without saying what it covers, and covering something silently IS the defect.

**It is a conservative BAND, not a paint mask**, and the first draft's wording did not say so. For an
edge dock the published inset runs from the window's edge up to the dock's box, so it includes the
~78px transparent gutter the dock is seated above: 123px published for a ~45px `bar`. That
over-reserves rather than under-reserves, which is the right direction to be wrong in. It is also
purely vertical — a centered `progress` pill 380px wide is reported as a full-width band. `bar`/`progress` return the dock (it *is* the painted box); `split` returns its caption box;
`scrim` returns the union of the gradient and the subtitle, because the subtitle is capped at
`min(340px, 86%)` and a long enough beat wraps past the 230px band.

**`cursor` deliberately declares nothing**, and a unit arm is what forced that: a trailing
`if (!occludes) occludes = () => rectOf(dock)` default also claimed `cursor`, whose dock is a
transparent `inset: 0` container — so it would have reported the entire viewport as covered and made
every reveal try to dodge everything. The assignment moved into the `bar`/`progress` branch.

### The reveal asks for room with `scroll-margin`

Not by correcting the scroll afterwards. `scroll-margin` is the platform's own "leave space for the
fixed thing over there", and decisively it lets the **browser** keep choosing which ancestor scrolls
— re-deriving that choice is the guess `revealTail` exists to stop making. It is written inline on
the target and restored in a `finally`: a tour that was only visiting a page must not leave a
`scroll-margin` behind on it. A `RectSource` that is not an element simply does not get one, which
keeps the Present guide's in-iframe providers untouched.

**The lift aligns with `block: 'end'`, and that is an ENGINE fact rather than a preference.**
Measured on both engines with a bare page: with the target already flush against the viewport's
bottom edge, **Chromium's `nearest` ignores a `scroll-margin` completely and scrolls nothing**,
while WebKit honors it and moves. `end` moves the margin box's end edge to the scrollport's on both.
This cost a real debugging detour — the change looked correct, passed on Chromium at 390px and on
real WebKit, and failed only on Chromium at 1440x900, which is the one viewport where the first pass
happens to land the target exactly flush. `nearest` remains right for the FIRST pass, because that
is what makes a reveal safe to run before every aim (an in-view target moves nothing); by the second
pass the decision that this target is covered has already been taken, and the alignment is no longer
in question.

**It scrolls FIRST and asks afterwards**, which is not an implementation detail. Everything else in a
beat that reads the target's rect means "where it is NOW", and an arm pins that the scroll precedes
every read — so deciding the margin from a pre-scroll rect would have put a measurement first. It
would also have been the wrong measurement: whether a target ends up under the caption is a fact
about where it LANDS. So the reveal scrolls, looks, and takes a second pass only when the target
really landed in the band. An in-view target still costs exactly one no-op `nearest`.

**A target too tall for the remaining room is left alone.** Per CSSOM-View, `nearest` acts on the
scroll-MARGIN box; once that box is taller than the viewport, a target that was fully visible has one
edge in and one out, so the browser aligns the far edge and pushes the near one OFF SCREEN — a 500px
target with a 230px band in a 659px window ends 71px above the top. Shipped tours point at whole
panes, so this is the ordinary case rather than a corner, and leaving such a target where plain
`nearest` put it is right anyway: it is far too big to hide under a caption.

**It clears what it can.** A target at the end of its scroll range has nowhere to go: measured on the
exemplar page before it was given a runway, 85 of 123px recovered and the rest unreachable. The
exemplar now carries `padding-bottom: 60vh` so the arm pins the behavior rather than the limit, and
the limit is written into the library README.

### The number is published for hosts

`--vt-chrome-top` / `--vt-chrome-bottom`, inline on the document element, **measured from the
window** — not from `bounds`. The frame is the whole contract: every consumer recovers the band's top
edge as `innerHeight - inset`, so a bounds-relative number is silently wrong by however far the host
stops short of the window (a 400px host at the top of a 768px window published 123 for a band whose
real top is y=280, and a consumer reserved 123px at the bottom of the window where nothing is
painted). Removed (not zeroed) on `destroy()`, and only when the value is still ours. A host cannot measure the stage — it is portalled to `<body>` and fixed — and the
Studio's editor is exactly such a host, scrolling its own content on every keystroke of a demo.
`tour-chrome.ts` reads them from the inline style rather than `getComputedStyle`, because that path
runs per keystroke and a computed-style read forces a style recalculation. Same idiom as
`--cs-kb-inset`, which is the same shape of problem for the software keyboard.

Both editors now clear it: CodeMirror through `yMargin`, ProseMirror through the host scroll it
already had to do by hand — and they take **different numbers**, which is not an oversight.
CodeMirror's `yMargin` is applied at BOTH edges and its `scrollRectIntoView` tests the TOP one first,
so a margin past half the scroller makes the reveal alternate between scrolling forward and
backward, one keystroke each (worked through with CodeMirror's own arithmetic: an 81px judder per
beat on a 400px pane with a 230px band, sitting under the caption half the time). So
`tourChromeMargin` halves it for that consumer and `tourChromeOverlap` hands the full band to
Compose, which scrolls one way by hand. Neither measured phone is affected — half the usable height
is 346px and 254px against a 230px band — but a landscape phone or a split pane is exactly where the
unhalved value would have bitten.

**This is not the 48px `yMargin` that was tried and dropped.** That was a constant, aimed at WebKit's
frame lag, and it measured as a no-op because the lag was not what it was fighting. This is a
measured occlusion, and it is **0 on every surface where no tour is running** — every author
keystroke on every other screen.

**Zero is passed as `undefined`, and that is load-bearing rather than tidy.** CodeMirror's default
`yMargin` is 5, and it KEEPS a literal 0 (`options.yMargin ?? 5`) — so a plain 0 off a tour would
have quietly dropped 5px of breathing room from a reveal that has always had it. An earlier draft of
this section called the no-tour path "byte-identical"; it was not, by exactly those 5px, in a record
whose subject is claims nobody re-derives.

## 4. The oracle, rebuilt

The sampler now measures against `min(scrollDOM.bottom, innerHeight - --vt-chrome-bottom)`. Off a
tour the property is absent and it is byte-identical to the old arm.

Re-tuning it was the part with a real finding in it. With the corrected ruler the legitimate
transient became visible — 49px on Chromium, 283px on WebKit — and a genuinely broken follow
(`revealTail` mutated to a no-op, built and driven) measures **115px sustained on Chromium and 457px
on real WebKit**. Holding the arm on depth alone therefore meant a WebKit budget somewhere between
283 and 457: at best 1.14x the real defect, which is a coin flip, not a test.

**So the discriminator moved to duration, where it belongs.** A measure lag is a couple of frames and
then the view catches up; a broken follow never closes. `TAIL_SUSTAIN` went 6 → 20 frames, the
sampler reports the longest run over budget on every pass, and that run is now ASSERTED rather than
logged, so drift toward the window is visible.

**And the budget has to sit BELOW the caption, which an intermediate revision got backwards.** That
draft set WebKit to 300 — above its 283px transient, so no legitimate frame ever crossed and the
`maxRun` was a clean 0. It was also a budget *larger than the defect*: a tail parked at the scroller's
bottom edge is 230px under the caption, permanently, and would have scored under a 300px budget
forever. It would have caught only the mutant that deletes the reveal outright, and passed every
partial regression — the margin halved, a new style's `occludes` returning null, the publish channel
broken. Choosing a budget so that the *transient* never crosses is choosing it from the wrong end.
The budgets are now 60 and 120, both under the 230px band, and the 20-frame window is what absorbs
the transient. Measured on the shipped build: Chromium never crosses its budget at all (594 samples,
worst 49px, **0 frames** over), and WebKit crosses for **2 frames** out of 341 — the design working
rather than a near miss. The arm now asserts that run stays under half the window, so the headroom
is a number rather than a hope.

**The oracle also guards itself now.** It reads `--vt-chrome-bottom` with `|| 0`, so a regression that
stopped the stage publishing would blind the ruler and restore the defect in the same stroke, and the
arm would go green — the same shape of failure as §2, rebuilt. The sampler records the largest band it
ever saw and the case asserts it was non-zero.

## What is verified, and what is not (HARD RULE #23)

- **Real Chromium at 390x844 and real WebKit at an iPhone 15 Pro box** — the geometry table in §1 and
  its after state, from an instrumented run of the actual Studio phone tour: the tail settles with
  its bottom edge within a pixel of the caption's top (615 against 614; 429 against 429). The reveal
  exemplar's target clears the published inset at 1440x900, 390x844 and on real WebKit.
- **A measured mutant on both engines.** `revealTail` mutated to a no-op, rebuilt and driven: 115px
  sustained on Chromium, 457px on real WebKit, both for 20+ consecutive frames. The arm can fail, and
  the numbers are what the budgets were set against.
- **The Compose half is driven on a real browser**, at 390px, with the tour started from the phone's
  rich-editor button and the sampler pointed at `.cs-host`. An earlier draft of this change cited that
  arm in a test comment BEFORE writing it — `demo-mobile.spec.ts` had zero Compose coverage at the
  time, which an independent checker caught by grepping for it. The arm exists now (381 samples while
  typing, worst 112px, 1 frame over budget of a 20-frame window); the claim was the defect, and it is
  the exact one this record is about.
- **The frame-cost measurement the previous record demanded before the viewer-scroll listener could
  ship.** On the phone viewport, scrolling every frame for 199 frames: **idle mean 16.67ms, worst
  16.8ms, 0 frames over 20ms — and identical with a tour running.** The baseline is the same scroll
  on the same page with no stage mounted, which isolates what a running tour adds rather than
  comparing two builds.
- **Unit mutants, each dying to its own arm** — drop the scroll listener, drop the `scroll-margin`,
  never publish the inset, drop the scroll handler's no-work guard, forget to remove the inset on
  destroy.
- **An adversarial review pass (HARD RULE #25) found real defects in the first draft, and they are
  fixed here rather than filed.** The load-bearing ones: `chromeInset` published a BOUNDS-relative
  number under a viewport-relative contract; a second stage (the Present guide, which two shipped
  tours open mid-run) overwrote the published band and then removed it on teardown, and a write-memo
  meant the live stage never restored it — reproduced in jsdom, now pinned by two arms;
  CodeMirror's `yMargin` is symmetric, so the unhalved value would have made a short pane oscillate;
  `yMargin: 0` is not `yMargin: undefined`; the sampler's budget was chosen so the transient never
  crossed it, which put it above the defect; and the table in §1 mixed a worst reading with a settled
  one. Every one of those is a claim that was broader than the code, in a record whose subject is
  exactly that.
- **UNVERIFIED: real iOS Safari on a device**, and this record does not claim otherwise. Touch, the
  collapsing chrome and the software keyboard's visual-viewport offset are not reachable from this
  sandbox. What changed is that the previous pass ruled those in by ruling everything else out on an
  instrument that could not see; there is now a mechanism that reproduces off-device and is fixed.
  Whether it is THE report still needs the phone.
  **A second defect on that path is still live and is not touched here:** the markdown editor has no
  software-keyboard inset at all (`useVisualViewport` is wired only into `ComposeView`), and every
  number in this change — the caption's band, `boundsRect`, `tourChromeOverlap` — is expressed in the
  LAYOUT viewport, which on iOS does not shrink for the keyboard. With the keyboard up the caption is
  itself partly behind it. That is off this change's path (HARD RULE #18) and worth its own work.
