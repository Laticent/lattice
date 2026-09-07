---
status: shipped
summary: >
  The fix that stopped a diagram slide painting its Mermaid source (#2073) left the same
  window EMPTY instead, and the report came back as "blocking on initial and on edit". Both
  halves are real and neither is a speed regression: rendering a changed fence has cost
  ~200ms on an idle machine on every date measured. What moved is what occupies that window
  — raw source until 2026-09-05, an empty slot after it. The instrument could not see the
  difference because its typing arm edits the slide's HEADING, which leaves the fence
  byte-identical and hits the SVG cache in one microtask; typing INSIDE the fence, which is
  what an author does to a diagram, no cache can answer. Measured across four historical
  builds (2026-08-20, 2026-08-06, and the two before them by source): the Studio has never
  held the previous diagram — before #1062 (2026-07-18) it never rendered one in the editor
  preview at all. Two changes ship. The runtime now transplants the OUTGOING `<svg>` out of
  the MutationRecord's removedNodes into the fence that replaced it, leaving the `<pre>`
  pending so the real render still lands: 11 blank frames -> 11 HELD frames, 0 layout shift,
  and 9 held rather than 9 blank at 4x CPU. And the 150ms render debounce, which exists to
  protect a diagram the author can see, is dropped to 0 for a fence whose slot is EMPTY:
  navigating onto a diagram for the first time goes 214ms -> 75ms. That delay is keyed on a
  fence having JUST ARRIVED, not on its slot being empty: the first version keyed on emptiness
  and the maker-checker measured it queueing 8 renders for 8 keystrokes into a diagram that
  does not parse, because an empty slot is what a parse error leaves too. The bench grew an
  `edit` scenario, an `edit-broken` one, a held-frames column keyed on SVG node identity, a
  `mermaid.render` counter, and a refusal to run against a server it did not start — a stale
  `astro preview` from another checkout produced a full set of plausible, wrong, internally
  consistent numbers before that guard existed.
---

# An edit to a diagram holds the diagram you already have

**Symptom.** After #2073 landed ("stop the diagram slide painting its Mermaid source
first"), the Studio still felt wrong to edit: "blocking on initial and on edit… my
expectation is this is extremely performant and there would be no blinking or gap between
typing and rendering." Alongside it, a memory: that it used to keep the previous diagram
until the new one was rendered.

**Root cause, in one line.** #2073 removed the wrong thing from the window without putting
the right thing in it. The window itself — about 200ms per keystroke that changes a fence —
has always been there.

---

## 1. What the window is

The Studio's typing hot path replaces a whole `<section>`
(`patchSections` → `lattice.replaceChild`, `docs/src/playground/deck-preview.js`), so the
rendered `<svg>` is destroyed on every keystroke. `replayCachedFences` (#2073) hands the SVG
straight back **when the source is unchanged**. When the keystroke landed *inside* the
fence, the source is new by definition, `mermaidSvgCache` misses, and the slot waits for a
real `mermaid.render`.

Three things have occupied that slot over time, and only the last one is what an author
wants:

| | what the slot shows | how it reads |
|---|---|---|
| before 2026-09-05 | the raw ```mermaid source | a wall of text where the diagram was |
| #2073 | nothing | the diagram "blocks" |
| this change | the previous diagram | the diagram updates |

## 2. The instrument could not see it

`docs/scripts/diagram-flash-bench.mjs` shipped with a `type` scenario that clicks the
slide's **heading** and types there. The fence stays byte-identical, so the finished SVG
comes back from the cache in the observer's microtask — 0 wrong frames, 20ms, which is the
number #2073 was validated on and which is still true for that interaction.

Typing inside the fence is a different race and the one authors are in. It now has its own
arm (`--scenario edit`), which parks the caret one character before the closing `]` of
`B[Process]` so every keystroke changes the source and still parses.

The scoring had the same blind spot: it treated *any* `<svg>` on screen as "the diagram
arrived", so a candidate that holds the outgoing ink would have measured as instant no
matter how slow its render was. Frames now carry a **generation stamped on the SVG
element**, so a transplanted element (same node, same generation) is told apart from a
re-render or a cache replay (new element, new generation), and `held` is its own column.

## 3. What the history actually says

Built and driven at four historical points, same deck, same interaction, unthrottled:

| build | date | raw-source frames | blank | held | time to the new diagram |
|---|---|---|---|---|---|
| `b03b3bd1` | 2026-08-20 | 11 | 0 | 0 | 206ms |
| `fa2fa69a` | 2026-08-06 | 10 | 0 | 0 | 206ms |
| `36574df0` | 2026-09-06, pre-#2073 | 11 | 0 | 0 | 209ms |
| `3b98f78a` | 2026-09-06, post-#2073 | 0 | 11 | 0 | 209ms |

Two older points could not be driven — the Studio's editor DOM differs enough that the
bench's own click targets time out (`ecf09b3c`, 2026-07-22) — and one does not need to be:
at `5403e164` (2026-07-10) `StudioShell.tsx` passes `mermaid={false}` to the editor
preview, so no diagram rendered there at all. That matches #2073's own finding that #1062
(2026-07-18) is the commit which made diagram slides render in the editing preview in the
first place.

**So the previous diagram was never held.** What made the old behavior feel like a
placeholder is that the raw source is *something*; #1614 (2026-08-11) then zeroed the
fence's padding, so that something started reading as part of the slide.

## 4. Holding the outgoing diagram

`adoptOutgoingDiagrams` (`lib/runtime/index.js`) runs in the body MutationObserver
callback, straight after `replayCachedFences`. A `MutationRecord` carries `removedNodes`,
so the `<svg>` the host just threw away is still reachable: it is **moved** into the
incoming fence's `.mermaid` target, and the `<pre>` is left `pending` so the debounced pass
renders the new source over the top.

Cache first, adoption second, deliberately: the cache produces the right SVG for *this*
source, adoption produces the previous one.

Three refusals, each of which would otherwise be a wrong answer rather than a slow one:

- **a donor that is not itself `rendered`.** A `pending` fence whose slot holds an SVG is one
  this walk filled a moment ago. Donating a placeholder forward carries one slide's diagram
  across every slide an author clicks through faster than the debounce — driven across three
  slides by the maker-checker;
- **a swap the host did not call `in-place`.** See §4a — it is the load-bearing one;
- **a different number of fences** in the outgoing and incoming subtree. Position is the
  only identity available (the source changed — that is the premise), so a slide that
  gained or lost a diagram would shift every later one by a slot. Pairing is **node for
  node**, not flat across the record, and refuses a record whose added and removed node
  lists differ in length: `patchSections` has a second branch
  (`lattice.innerHTML = next.join()`, when a slide is added or removed) whose single record
  spans the whole deck, and flat pairing there would let a fence inherit ink from a
  different slide whenever the counts happened to agree;
- **a different `diagramScopeKey`** — the same key the cache uses. When it differs the
  slide's palette differs (an author typing `_class: dark` onto a diagram slide), and the
  held ink would be the old band's beside freshly repainted chrome;
- **a document with no Mermaid**, the same guard `replayCachedFences` opens with. A held
  SVG that nothing replaces is a permanently stale diagram.

A fence that had not rendered yet contributes a `null` donor rather than being skipped, so
the two lists stay aligned by position: one un-rendered diagram on a multi-diagram slide
costs only its own hold.

**The held SVG is transient by construction.** The fence stays `pending`, so the only way
it outlives the next pass is a render that fails — and every path that gives up clears the
target first. That was not true when it was first written: `attachError` clears, but the two
paths that reset a fence to `pending` after a THROW (mid-walk, and a `mermaid.initialize` that
throws inside a run) did not, so an intermittently-throwing Mermaid would retry forever while
the slide kept displaying a diagram built from source the author had already changed.
`resetFenceAfterFailure` now clears the slot on the way back, which costs a fence that never
held anything nothing (its target is already empty). That is what separates this from handing a *cached* SVG across a
scope change (the #1332 step-3 bug): that would have been a final answer, this is a
placeholder with a render already queued.

## 4a. The guard the structure could not supply

A second checker pass, run on the REBASED code, found that navigating between two diagram
slides in the Studio transplanted the previous slide's diagram into the new slide's box.
Every structural guard passed, and the reason is worth stating plainly because it invalidated
the reasoning the first version was built on.

**The Studio's editor preview is not `patchSections`.** That is the Playground and Drawing
Board path. The Studio goes through `patchSlideBody`
(`docs/src/lib/single-slide-render.ts`), which replaces the whole `.lattice` body in ONE
mutation. Measured on the real Studio: `{added: 3, removed: 3, addedFences: [0,1,0],
removedFences: [0,1,0]}`. So a NAVIGATION arrives in exactly the shape an EDIT does — same
node count, same fence count, same scope key — and "node for node, and the counts must agree"
refuses nothing.

**A TEXT-SIMILARITY GUARD WAS SHIPPED HERE FIRST, AND IT DID NOT WORK.** It scored the shared
head and tail of the two sources over the longer one — what a single-point edit leaves behind
— and held above 0.5, justified on a two-sample gap: 0.42 for two `flowchart LR`s of the same
shape, 0.66 for a whole line added. A third checker took it apart, and the refutation is not
subtle: **the score measures shared BOILERPLATE, not sameness of drawing.** All twelve ordered
pairs of `examples/mermaid-init-merge.md` — four slides whose entire point is that ONE graph
renders differently under different `%%{init}%%` lines — score **0.68 to 0.82**. Two
`sequenceDiagram`s sharing participants score 0.76; two `classDiagram`s sharing classes, 0.75;
`graph TD` against `graph LR`, 0.75. A deck this repo ships hit it, reproduced on the real
Studio with the wrong drawing under the right heading. The threshold had been fitted to the one
pair in the bench deck.

**The fix is to stop guessing and ask the host.** Whether a swap is an edit or a navigation
is not derivable from inside the frame — that is the whole content of this section — but it
is a fact the host knows for certain. So the host stamps `data-lattice-swap` on `.lattice`
immediately before it writes, and `adoptOutgoingDiagrams` holds ink only on `in-place`.

## 4b. Asking the host is right; asking it about POSITION was not

The adversarial trio (HARD RULE #25) was run on the host-stamp design, and all three lenses
independently found the same thing: **the hosts were answering a positional question, and
position is not identity.**

| Operation | Index | Slide count | Old answer | Truth |
|---|---|---|---|---|
| Delete slide | unchanged | changed | `in-place` | a different slide arrives |
| Open another deck | unchanged | may be equal | `in-place` | a different deck |
| Reorder | unchanged | unchanged | `in-place` | two slides moved |
| Checkpoint restore | unchanged | may be equal | `in-place` | possibly different content |
| Edit the shown slide | unchanged | unchanged | `in-place` | correct |

### A one-slide deck has no context, and that is the shape every deck starts as

A fifth checker pass found the residual: the key compares everything EXCEPT the shown slide,
so a deck of ONE slide compares nothing. Every one-slide deck sharing front matter produced
the identical key — literally `0:/1/-` with no front matter — and a switch between two of
them was stamped `in-place` again. `newDeckSource()` emits exactly one slide and no front
matter, so that is the shape every Studio deck starts life as.

The source cannot answer this one: nothing distinguishes "I edited my only slide" from "I
opened a different deck whose only slide is different" without knowing which DECK is on
screen. So the host supplies `deckId` — the Studio's existing `deck.id`, threaded through
`DeckPreview` — and the key carries it. Without an id, a one-slide deck keys `null`, which is
an unknown, which is a reflow: a lost hold on single-slide previews, never a wrong one. The
id never replaces the content half — a delete inside one deck keeps the id and is still
caught, and a host that reused an id could not mask a deck switch.

**A deck id is not enough on its own, and the sixth pass proved it on the real Studio.**
Restoring a checkpoint keeps the same deck and the same lens, so on a ONE-SLIDE deck both
keys read `${id}/${fm}/1/-` and the restore was stamped `in-place` — the outgoing diagram
painted over the restored slide for ~150-300ms. Nothing in the *source* separates that from
an edit; only the host knows a wholesale replacement happened. So the Studio's identity
carries a **source epoch**, and the direction of its default is the whole design:
`setSource` BUMPS the epoch, and only the editor's own `onChange` opts out. A replacement
path somebody adds later and forgets about therefore produces a reflow — a lost hold, which
is invisible — rather than the wrong diagram. Bumping only on the paths we remembered would
have made every future omission a wrong-ink defect.

The identity the live preview passes is `deck.id : lens : epoch`, and each of the three
earns its place: the id separates decks, the lens separates two views of one deck whose sets
differ only at the shown position, and the epoch separates a replacement from an edit.

`deleteSlide` returns `clampIndex(i, slides.length - 1)` (`docs/src/components/studio/deck-ops.ts`),
so deleting any slide but the last two keeps the active index — and the Studio's own
**Delete slide** button was therefore stamped `in-place`. Reproduced on the built Studio: the
deleted slide's diagram painted over its replacement for **136ms, 10 frames**, `AlphaOne →
AlphaTwo` under a heading reading "Diagram Zulu". The control — Move slide earlier, which
does change the index — stamped `reflow` and held 0 frames, so the stamp was load-bearing and
simply being answered wrong. `origin/main` shows a blank there, which makes this a window the
branch created (HARD RULE #18) rather than one it found.

**What an edit actually is, stated exactly: everything except the slide on screen is
byte-identical to what it was on the last render.** Not similar — equality. That is decidable,
needs no threshold to fit, and fails in the safe direction, because anything it cannot prove
is an edit comes back `reflow`, which costs a held diagram and never risks a wrong one. It
lives in `lib/core/swap-kind.mjs` because both hosts owe the same answer (HARD RULE #1):
`deckContextKey` + `swapKindForSlide` for the single-slide host, `sectionSwapKind` — exactly
one section's HTML changed — for the filmstrip.

Two smaller holes in the same contract closed with it. `__latticeShownSlide` was written only
on the patch and restyle paths, so a **full write** left it describing a slide the frame was
no longer showing and the next patch compared against it; it is now stamped wherever the host
writes. And the attribute was a **latch nobody cleared**, so it stayed `in-place` between
writes and any later mutation burst read an answer that was never about it; the observer now
reads it once and removes it.

### The guard the tests could not see

The trio's checker deleted the host-side answer outright — an unconditional `'in-place'` in
both hosts, the entire fix removed — and ran everything: **9134 root tests, 3889 docs tests
and `check:ownership` all stayed green.** Every one of the runtime's 26 arms *feeds* the
runtime a stamp; nothing asserted that a host *produces* the right one. Three checker passes
had audited this design without that gap being visible, which is how a positional answer
survived to a screenshot. `test/unit/core/swap-kind.test.js` now pins the decision and
`*.swap-stamp.test.ts` pins each host's wiring; re-running that same mutation kills 4 of 5
arms in each.

**And the pinning was incomplete every time it was called complete — three times now.** A fifth
checker mutation-tested the fixes themselves and found three survivors: the full-write stamp
could be deleted outright with all 112 of that module's tests still green; the arm claiming
to prove the key's length-prefix encoding used inputs that stayed distinct under a plain
join, so it pinned nothing; and the runtime's own contract docblock still asserted the
`rendered`-only donor rule that §4c deletes. Each has a real arm now — the boundary-collision
pair (`a\n\nb`/`c` against `a`/`b\n\nc`, which concatenate identically) is the one that
actually kills the plain-join mutant.

A SIXTH pass then mutated the *host thread* rather than the kernel and found the same shape
one level out: the whole `deckId` path — `StudioShell` composing it, `DeckPreview`
forwarding it, `renderInto` consuming it — could be deleted with 9157 root and 3901 docs
tests green, because every arm hand-wrote the id string instead of asserting a host produces
it. The pattern is now explicit enough to name: **arms that FEED a component its input
cannot pin the code that PRODUCES that input**, and each round of this change has rediscovered
that at the next level out. The arms added for it drive the real hosts — `DeckPreview` under
React with a `renderInto` spy, and the Studio itself through a preview stub that surfaces the
id — so the thread is pinned end to end rather than at its far end.

## 4c. Holding through a burst, which is what typing is

The donor rule was `rendered`-only, justified on cross-slide travel: a `pending` fence whose
slot holds an SVG is a placeholder a previous adoption left, and donating it forward carried
one slide's diagram across every slide a fast rail-clicker touched.

That justification did not survive the host stamp, and it was never re-derived. A rail click
is a `reflow` and `adoptOutgoingDiagrams` has already returned; chaining under an `in-place`
stamp stays on one slide by construction. Meanwhile the rule was costing the primary use
case, because **after a hold the fence is left `pending` on purpose** — so from the second
keystroke of any burst the donor was a placeholder, and the hold covered exactly one
character. Measured on the built Studio, typing 8 characters into a fence that keeps parsing:

| Cadence | Painted frames | Showing the diagram | Empty | `mermaid.render` |
|---|---|---|---|---|
| 120ms/char (a normal typist) | 71 | 9 | **62** | 1 |
| 250ms/char (slower than the debounce) | 127 | **127** | 0 | 8 |

87% of the burst was empty — the symptom this whole change was opened for. The single-keystroke
`edit` arm could not see it, because it types one character and waits 1600ms, which is slower
than the debounce and therefore the easiest case there is. `bench:flash` grew an `edit-burst`
arm so the number describes the interaction it is named for. A donor is now any fence whose
slot holds ink.

## 5. The second delay, and why it is gone

The 150ms debounce buys **coalescing**: consecutive keystrokes collapse into one
`mermaid.render` instead of one per character, on a strictly serial queue. A second, shorter
delay for a diagram that had "just appeared" was added here on the reasoning that nobody is
typing into a diagram they have not seen yet, so the debounce buys nothing in front of its
first render.

**It is cut.** Two of the trio's three lenses reached the same verdict from opposite
directions, and the numbers decide it. What it bought: `nav` cold 236ms → 207ms, **with the
blank-frame count unchanged at 10** — nothing a viewer can see. What it cost: the trigger was
never gated on the swap kind, so it fired on NAVIGATION. Walking a rail through a mixed deck,
every diagram slide reached from a non-diagram slide dispatched its own render immediately,
most of them into nodes the next patch had already detached, and the render for the slide the
author actually landed on queued behind them. That is the same failure the first version of
this policy shipped — 8 keystrokes, 8 renders, finishing later than a plain debounce — coming
back through the navigation door.

Neither the delay nor its reset had a test: setting `COLD_MS = 150`, or dropping the
`scheduledRunDelay` reset (which latches every later burst at 0 for the document's lifetime),
both left 9134 tests green. A mechanism with no gate, an unmeasured regression and 29
imperceptible milliseconds of upside is not worth its own risk. One delay now; two arms pin
that a second one is not quietly re-added.

## 6. Measured, on the built Studio

`cd docs && npm run build:e2e && npm run bench:flash -- --scenario <s>`, medians of 5 runs.

ONE VARIABLE, and ONE TABLE. Both columns are the same machine, the same instrument and the
same afternoon: `main` at `9d06a30a` and this branch, each built from scratch in the same
tree, benched back to back. Two earlier drafts of this section disagreed with the PR body on
four of five cells — in a change whose own §8 is about a measurement that was wrong first —
so there is now one set of numbers and every other surface quotes it.

| scenario | `main` @ `9d06a30a` | + this change |
|---|---|---|
| `edit` ×1, cold (type inside the fence) | **11 blank**, 0 held, 211ms | **0 blank**, **11 held**, 209ms |
| `edit` ×1, warm | **10 blank**, 0 held, 198ms | **0 blank**, **10 held**, 204ms |
| `edit-burst` cold (8 chars @120ms, still parsing) | **68 blank**, 0 held, 1176ms | **0 blank**, **67 held**, 1181ms |
| `edit-burst` warm | **67 blank**, 0 held, 1144ms | **0 blank**, **68 held**, 1168ms |
| `nav` cold (both diagrams genuinely cold) | 10 blank, 240ms | 11 blank, 254ms |
| `nav` warm | 0/0, 4ms | 0/0, 5ms |
| `edit-broken` (8 chars, unparseable) | 97 source, **1 render** | 97 source, **1 render** |
| WRONG ink, every arm | 0 | **0** |
| layout shift, every arm | 0 | 0 |

Timings carry run-to-run variance of roughly ±15ms on this machine — `nav` cold read 239ms,
240ms and 254ms across three builds of the same code — so read the FRAME COUNTS, which are
stable and are what the change is about. The branch column was re-measured on the final code
after the deck-id fix; every row is from one build.

**The wait does not move, and never was the thing to fix.** 211ms → 209ms on `edit` is the
same `mermaid.render`. What changes is what the author is looking at while it runs: their
diagram instead of nothing. §3 established that this window is not a regression — it is
present on every historical build measured.

**`edit-burst` is the row that matters**, because it is the row that describes typing. On
`main` a burst is blank for its whole length; here it is never blank. The single-keystroke
`edit` arm cannot tell those two builds apart as sharply, because it waits 1600ms between
characters — slower than the debounce, so every keystroke finds a fully rendered donor. An
instrument that only ever measures the easiest case is how a design that covered exactly one
character reported a clean sweep (§4c).

**`nav` is deliberately unchanged.** 236 → 207ms was the second delay's whole contribution
and it is gone with it (§5); 240 → 239ms is the same measurement without it. The blank-frame
count was 10 either way, which is what made the trade a bad one: nothing a viewer could see,
against an un-coalesced render on every rail click through a mixed deck.

**`edit-broken` holds at 1 render.** That is the coalescing arm — 8 keystrokes into a diagram
that does not parse must not queue 8 renders on a serial queue. It was 8 in the first version
of the delay policy (§5), and cutting that policy is what keeps it at 1 without a special case.

## 7. What this does not do

- **The first render of a diagram is still a wait** (~70ms idle, longer on a loaded
  machine). Pre-rendering the diagrams of slides the author has not navigated to would
  remove it; the Studio's editor preview renders one slide at a time, so that is a change to
  what the preview contains, not to when it renders.
- **Deck-open is not measurably worse for containing a diagram**, on this machine: mount at
  4x CPU reached `.lattice` in 2671ms with the diagram deck and 2664ms without (n=5, ranges
  overlapping). #2073 measured ~1000ms of difference for the same comparison and logged it as
  the price of deck-scoping the mermaid flag; it does not reproduce here. Not re-litigated —
  recorded, because the two numbers disagree and the later one is the one that was taken with
  this arm of the bench.
- **A mid-edit parse error still replaces the held diagram with the error box, and that is
  now the loudest thing left on this surface.** `attachError` clears the target and the
  `error` state un-hides the `<pre>`, so the raw source comes back. The `edit-broken` arm
  measures **96 frames of raw source and ~65 blank** per eight-character burst — identical
  on both sides of this change, so it is neither caused nor helped here — against 0 and 0 in
  every other arm. Most of the time spent building a diagram from scratch is spent in that
  state. Left alone on purpose: clearing the target is what shows the author what failed,
  and holding the last good diagram *through* an error is a different decision with a real
  tradeoff. (Layout shift in that arm is 0; an earlier reading of 0.047 was taken before
  #2108, whose CSS collapses the slot consistently for `error` and `unavailable`.)
- **It sits on top of #2108, which gave the same fence a new `unavailable` state.** The two
  do not collide: `unavailable` means Mermaid is never coming, and every function here is
  guarded on a real `mermaid` and keys on `pending`, so a released fence is invisible to
  both. A held SVG in a fence that is later released stays hidden — `mermaid.css` collapses
  `.mermaid` for `unavailable` exactly as it does for `error` — and the author gets their
  source, which is the right answer. A second checker drove every transition on the rebased
  code and found this half clean; what it found instead is §4a.
- **Two exported artifacts get the new behavior too**, so "the Studio's" is shorthand.
  `lib/runtime/index.js` is not in `dist/lattice-emulator.js` and PDF/PPTX/PNG bytes are
  untouched (the emulator strips the runtime `<script>` before rasterizing), but the
  `--fluid` HTML export inlines `dist/lattice-runtime.min.js` and the export-to-Marp kit
  copies it. Neither re-renders a fence after load, so what they inherit is the code, not a
  behavior change a reader would see.
- **The mutation set was not complete the first time it was called complete, and it was the
  SECOND thing wrong with it.** "Every guard's mutant fails" was written after running the
  mutants that existed; a later checker found two real guards with no coverage at all — the
  `.mermaid` half of the target check (masked by the already-holds-an-SVG half, because one
  test satisfied either) and the arrival `pending` check. But the deeper miss was one no
  mutant in that list could have caught: **every mutant was aimed at the runtime, and the
  guard that decides everything is in the HOST.** Deleting the host-side answer entirely left
  9134 root tests, 3889 docs tests and `check:ownership` green (§4b). A mutation score is only
  as honest as the mutant list, and a list drawn from the file you were editing misses the
  file you were not.
- **Under continuous typing the held ink is as old as the burst.** `scheduleRun` re-arms the
  full debounce on every keystroke, so a long burst renders once at the end and the author
  looks at pre-burst ink the whole way — 68 frames on one render in the `edit-burst` arm, and
  proportionally longer for a longer burst. That is the design working as intended (the
  alternative is the blank it replaced), but there is no staleness signal, and a reader
  should know the picture can lag the source by the length of the typing run.
- **A hold is still one render behind, and a hung `mermaid.render` is the one place that
  bites.** The held SVG is a placeholder with a render already queued, so it is replaced
  within ~200ms in every normal case. If a render hangs, the 20s cap is 20s of a diagram the
  author's source no longer describes — where the old behavior showed an obviously-unfinished
  blank. Bounded, rare, and the trio's inversion lens judged it not worth holding the change
  for; recorded because it is the one case where this converts "visibly broken" into "quietly
  out of date".
- **A class the RUNTIME adds that the engine does not emit silently disables both adoption
  and the cache replay**, through `diagramScopeKey`'s class half. `RUNTIME_MARKER_CLASSES`
  lists the four known ones. Pre-existing, off the path of this change, and the failure
  direction is a miss rather than wrong ink — logged here rather than pulled into the diff.

## 8. The measurement that was wrong first

Four historical builds were measured, reported, and were fiction. `astro preview` spawned
through `npx` survives the bench's `kill` (the wrapper dies, the server does not), so the
first worktree's server kept port 4321 and every later run silently measured **that** tree —
producing four sets of plausible, internally consistent, wrong numbers that agreed with each
other precisely because they were the same build.

The bench now refuses to start when something is already answering on its port. A silent
fallback onto someone else's server is not a degraded measurement, it is a confident wrong
one, which is the expensive direction.

**It happened a second time, through a different door, while measuring §4c.** The Studio does
not load `dist/lattice-runtime.js`; it loads a content-hashed copy under
`docs/public/playground/v/<hash>/`, written by `docs/scripts/sync-playground-assets.mjs` — a
step that belongs to the DOCS `build:e2e`, not the root build. `npm run build:e2e` run from
the wrong directory rebuilt the site around a stale runtime, and two full bench runs measured
a bundle that predated the change under test. Both were internally consistent and both were
wrong, in the flattering-then-damning order: the burst arm reported the OLD behavior for a
build that had the fix.

The tell was cheap and should have been the first move rather than the fourth: `grep` the
served bundle for a string only one of the two versions contains. Identifiers are mangled by
esbuild, but **string literals survive minification**, so `mermaidState!=="rendered"` — a
guard this change deletes — reads the answer straight off the artifact. A measurement of a
build you have not identified is not a measurement of your change. Verify the artifact, then
believe the number.
