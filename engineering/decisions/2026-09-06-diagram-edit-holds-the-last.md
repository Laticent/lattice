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
| Checkpoint restore | unchanged | may be equal | `in-place` | possibly a different deck |
| Edit the shown slide | unchanged | unchanged | `in-place` | correct |

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

`cd docs && npm run build:e2e && npm run bench:flash -- --scenario <s>`, medians of 5–6
runs:

ONE VARIABLE. Both columns are the same machine, the same bench, and the same base
commit — `6016a3f1`, built twice, once with this change and once without. An earlier
draft of this table compared against a build from before #2108, which had moved this
file underneath it; a before/after whose two arms differ by more than the diff is not a
before/after.

| scenario | base `ae795b11` | + this change |
|---|---|---|
| `edit`, x1 (type inside the fence) | **11 blank**, 199ms, 1 render | **11 held**, 209ms, 1 render |
| `edit`, warm | **10 blank**, 200ms | **10 held**, 201ms |
| `nav` cold (genuine first sight, both diagrams cold) | **10 blank**, 236ms | **10 blank**, 207ms |
| `nav` warm | 0/0, 4ms | 0/0, 4ms |
| `nav`, wrong-ink frames (guard removed / present) | — | **11 → 0** |
| `edit-broken` (8 keystrokes, unparseable) | 96 source, 1 render | 97 source, **1 render** |
| layout shift, every arm | 0 | 0 |

Re-measured on the prose-last deck after it turned out the old one warmed a diagram at mount
(§4a). The `edit` arm is unchanged by that correction; the `nav` cold row is not, and the
earlier 200 → 57ms in this section was comparing a cold render against a warm revisit.

The wait itself does not move on `edit` — 199ms to 209ms is the same render, and it was
never the thing to fix. What changes is that the author is looking at their diagram for
it rather than at nothing. `nav` cold moves 236 → 207ms, which is the debounce skipped on
the one cold arrival that qualifies as first sight, not on both.

`nav` cold keeps 2 blank frames and always will: on the first sight of a diagram there is
nothing to hold, and `mermaid.render` has to run. What is gone is the 150ms of pure waiting
in front of it.

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
- **The mutation set was not complete the first time it was called complete.** "Every guard's
  mutant fails" was written after running the mutants that existed; the second checker then
  found two real guards with no coverage at all — the `.mermaid` half of the target check
  (masked by the already-holds-an-SVG half, because one test satisfied either) and
  `burstFirstSight`'s `pending` check. Both have their own arm now, as do the two guards §4a
  added. A mutation score is only as honest as the mutant list, and a list you wrote yourself
  misses what you did not think to break.
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
