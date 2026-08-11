---
status: shipped
summary: "The overflow watcher registered a whole-document scan on a MutationObserver bound to document.body with childList, characterData AND attributes on, coalesced per animation frame. Two costs. (1) The observer watched the watcher's OWN writes, so the only thing between it and a permanent 60fps loop was a hand-written idempotency guard at every write site — the Fix-Me overlay shipped exactly that loop until a signature guard was added. (2) It probed every slide in the deck including ones the filmstrip had virtualized away with `content-visibility: auto`, forcing precisely the layout that optimization exists to skip: measured on a 40-slide all-overflowing deck with the filmstrip's own styling, 12.6ms to sweep all 40 against 0.7ms to sweep the 3 in view. Fix — a GENERATION model (lib/core/fit-sweep.js): a sweep is triggered by what can change a verdict (the debounced content pass, fonts settling, resize, scroll, an explicit host call) and never by the watcher's own writes, and it probes only the slides in the viewport band whose (generation, box) key is stale. The marker's chrome moved into the MARKUP (lib/core/fit-berth.js): three empty hidden out-of-flow tabs the engine emits and both watchers merely fill, so no code creates or destroys marker DOM and the runtime and the emulator's inline watcher stop each minting their own. The Fix-Me overlay — a position:fixed layer rebuilt every pass and re-synced on a scroll listener — became an `outline` on the culprit plus a section-level label, which tracks scroll and preview scale for free and cannot perturb the layout it measures. 9–26x cheaper per sweep, with a new browser bench tier (`bench -- --sweep`) because nothing measured this path before. NOT established: that this was the cause of the reported Studio crashes — no unbounded leak was found in the watcher, and the crash sentinel's heap trajectory is where that evidence would come from."
---

# The overflow sweep: measure once per settled render, not once per frame

**Date:** 2026-08-11 · **Status:** shipped

## The rule

> Overflow is a fact about a **laid-out** slide, so only a browser can answer it —
> but nothing says it has to be re-answered on every frame, for every slide,
> forever. Measure when the render settles, over the slides a reader can reach,
> and **bake the answer into the slide** so no watcher has to hold it up.

## The report

> *"The way the current overflow observer works is terrible. I would hope the
> engine owns overflow detection and adds the necessary borders with overflows
> and fix me prior rendering. The only concern is how to ensure performance
> doesn't degrade. I fear the observer is doing too much and I suspect it is
> causing memory overflow or things that crash the studio. Maybe the content
> overflows pill we use for export path is doing the right thing? We want it to
> be static and part of the rendered slide."*

Three claims in that, and they did not all survive contact with the code. Taken
in order, because the one that was wrong is the most useful one to record.

---

## 1. What the observer actually did

`startOverflowWatcher` (`lib/runtime/index.js`) ended with one line:

```js
schedulePostMutation(check);
```

`schedulePostMutation` installs a shared `MutationObserver` on `document.body`
with **`subtree`, `childList`, `characterData` and `attributes` all on**,
coalesced to one dispatch per animation frame. So any DOM change anywhere in the
document — including an attribute write — scheduled a scan of **every**
`section[data-lattice-slide]`. Per section, per tick:

| Pass | Cost |
|---|---|
| `probeSectionOverflow` | `querySelectorAll('*')` + `getComputedStyle` per element to discover clip boxes, plus rect walks |
| `probeContentClipped` (when anything looked suspect) | a TreeWalker over every text node with a `Range.getClientRects()` each, then a **second** `querySelectorAll('*')` reading `::before`/`::after` computed content |
| `probeFigureLegibility` | every `svg[viewBox]`, measuring rendered text |
| `drawFixMeTags` | a `position: fixed` overlay torn down and rebuilt, plus a `scroll` listener re-running it |

### 1a. The observer watched the watcher

Every class toggle and attribute stamp `check()` performs is a mutation the same
observer sees. The only thing standing between that and a permanent 60fps loop
was a hand-written idempotency guard at **every single write site** — and the
file says so, repeatedly, because it has been bitten:

> *"Before this guard, an overflowing slide WITH an identifiable culprit redrew
> unconditionally on every call — clearing + re-appending `fixMeOverlay`'s
> children, itself a childList mutation the SAME observer is watching →
> re-triggers check() → redraws again → forever. Measured on a real overflowing
> slide: a steady 60fps DOM-churn loop, for as long as the slide stays in view."*

That guard is correct. It is also the wrong altitude: it makes every future
write site's correctness depend on somebody remembering. A design whose
soundness rests on never forgetting a guard will eventually forget one.

### 1b. It de-virtualized the deck it was measuring

This is the expensive half, and it is the one nothing in the codebase had
noticed. The filmstrip previewers (`docs/src/playground/deck-preview.js`) mount
every slide and let the browser skip off-screen layout with
`content-visibility: auto` + `contain-intrinsic-size`. Probing an off-screen
section reads its descendants' rects and scroll dims — which forces exactly the
layout the virtualization exists to avoid.

Measured in headless Chromium against emulator-rendered decks, with the
filmstrip's own styling applied:

| Deck | Sweep all slides | Sweep the ~3 in view |
|---|---|---|
| 40 slides, every one overflowing | **12.6 ms** | **0.7 ms** |
| 117-slide gallery | **7.0 ms** | **~0 ms** |

The gap grows with deck length while the visible work stays constant. And this
is a *floor*, not a ceiling: both figures are warm, so they exclude the layout
invalidation a real mutation burst would add.

For scale: the content walk costs ~0.29ms per overflowing slide, so a 117-slide
deck that mostly overflows lands near 47ms per sweep unthrottled on a fast box.
The preview budget's own harness runs at 4× CPU throttle, where that is ~190ms —
against a per-frame trigger.

### 1c. The sibling scan was checked and left alone

`patchSectionGeometry` rides the same dispatcher and was the obvious co-suspect.
It is not: its reads are `offsetWidth`/`offsetHeight` per section and measured
**0.1 ms for 117 sections** — three orders of magnitude under the sweep, because
it does no `querySelectorAll('*')`, no `getComputedStyle`, and no Range rects.
Recorded because "the other full-document per-frame scan" is a reasonable thing
for the next reader to suspect, and it has now been measured rather than assumed.

---

## 2. What the report got wrong, and it matters

> *"I suspect it is causing memory overflow."*

**No unbounded leak was found in the overflow watcher.** `clipMemo` is per-call.
`fixMeElIds` is a `WeakMap`. The callback array is bounded by the once-per-realm
boot guard, so repeated boots cannot stack sweeps.

What is real is **main-thread saturation plus forced layout across the whole
deck** on every mutation burst. On a large deck that is a sweep costing most of a
frame, every frame something changes. That is a hang and jank mechanism, and a
plausible contributor to a tab discard under memory pressure — but it is **not**
a demonstrated cause of the reported crashes, and this change does not claim to
have fixed them.

Where that evidence would come from is already built: the crash sentinel
(`docs/src/lib/crash-sentinel.ts`, `2026-08-10-studio-crash-sentinel.md`) records
a heap trajectory, stall counts and a breadcrumb ring across a session that dies.
Read that before attributing a crash to this subsystem.

This is recorded at length because the tempting move was to ship the perf work
under the crash banner. The perf work stands on its own numbers; the crash
question stays open.

---

## 3. What the report got right — and the one thing it could not have

> *"I would hope the engine owns overflow detection … prior rendering."*

**Not available at any price.** Overflow is a property of a laid-out box:
resolved fonts, resolved container queries, real line breaking. `lib/engine` is a
Node string producer with no box model. It cannot know whether a slide overflows
without a browser laying it out, and no amount of engineering changes that.

> *"Maybe the content overflows pill we use for export path is doing the right
> thing? We want it to be static and part of the rendered slide."*

**Exactly right, and it is the whole design.** The emulator measures once in a
controlled pass and bakes `.overflow` / `.clip-marked` / the tab into the HTML.
Nothing watches afterwards. The available move was not to make the engine
*predict* overflow — it was to make the browser measure it **once per settled
render** and stamp the answer into the slide.

---

## 4. The model

### 4a. A generation is one settled render

`lib/core/fit-sweep.js`. A generation is bumped by the things that can change a
verdict, and by nothing else:

| Trigger | Opens a generation? | Why |
|---|---|---|
| the debounced content pass (`scheduleRun`, 150ms) | yes | the transforms moved DOM |
| a `characterData` mutation outside marker chrome | yes | a text node grew in place; no element was added |
| fonts settling | yes | every measurement was against fallback metrics |
| `resize` (debounced) | yes | every box changed |
| `scroll` (debounced) | **no** | no verdict changed; new slides merely entered the band |
| `window.latticeSweep.sweep()` | yes | the host says its render landed |
| the watcher's own class / attribute writes | **no** | this is the cycle, cut at the root |

That last row is the structural fix. The sweep rides the **existing**
`scheduleRun` observer, which watches `childList` and `subtree` **only** — no
`attributes`. Same document, same mutations, one crucial difference in what is
observed, and it is what makes the feedback edge unreachable rather than guarded.

**`characterData` needed its own observer, and the first cut of this change lost
it.** Riding `scheduleRun` meant inheriting exactly what `scheduleRun` observes,
and it does not observe `characterData` — so a text node growing in place
(`node.nodeValue = …`, no element added or removed) triggered nothing.
Reproduced in Chromium on a real engine-rendered deck: one slide grown to 4000
words overflowed by 1613px and stayed unringed indefinitely, until an unrelated
`childList` mutation elsewhere happened to schedule a sweep. This note's own §6
originally described the cost as *"a layout change caused by neither a mutation
nor a resize can be missed"* — which was wrong twice over, because a
`characterData` mutation **is** a DOM mutation and this one was being missed.

So the sweep installs a second observer for that category alone, with a filter:
**a record whose target sits inside marker chrome is dropped.** That is what
keeps it from being a reinstatement of the old cycle — filling a berth writes
text, which is precisely the mutation class being observed. The filter is also a
narrower and more checkable rule than "don't observe the category": the watcher's
own writes are confined to three named elements, and nothing else in the document
is filtered. Verified in Chromium — the generation counter is stable for seconds
after boot on a deck with two overflowing slides.

### 4b. A sweep probes the band — and a backstop probes the deck

**The band alone was silent, and shipping it alone would have been the defect
this whole register exists to prevent.** Found by the Munger inversion and
reproduced on the real bundle: 12 stacked slides, every one over-stuffed,
viewport 1200×800.

| | marked |
|---|---|
| loaded, never scrolled | **3 / 12** |
| after `page.pdf()` — the print / marp-cli shape | **3 / 12** |
| during a continuous scroll | **no new coverage at all** |
| after everything settled | **11 / 12** — one slide fell between two sampled bands and was never measured |

Two whole classes of render target, not corner cases. A printed document and an
**Export-to-Marp bundle** are never scrolled by anyone — and that bundle renders
*through this runtime* inside marp-cli, where it is the only marker producer
(`tools/export-marp.js` ships `lattice-runtime.min.js`; the emulator's
full-document watcher is not on that path). A band-scoped sweep measures the
first viewport and stops. That is the silent clip `2026-07-30` made `reader` the
export default to prevent, reintroduced one layer down. The third row is its own
bug: the scroll trigger was a *trailing* debounce, and scroll events arrive every
~16ms, so each one reset the timer and none ever fired.

**The fix is not to drop the band** — it is what makes an edit cheap — but to
stop it being the last word:

- **A completeness backstop.** Every sweep re-arms an 800ms idle timer; when the
  deck goes quiet it sweeps the WHOLE document at the **current generation**. The
  cache then skips every slide already measured, so only the never-measured ones
  cost a probe. Measured through the bench at **0.1–0.4 ms** across these decks —
  against 4.4–23.6 ms for the same coverage *with* a generation bump. That gap is
  the whole reason the shape works, and it is now a blessed bench column so it
  cannot quietly stop holding.
- **A max wait on the interactive debounce.** A trailing debounce is right for an
  edit burst and wrong for a continuous gesture; 250ms of pending work now runs
  rather than being pushed out again.
- **`window.latticeSweep.complete()`**, for a host that wants every slide to have
  a verdict *now* without waiting out the idle timer. It is deliberately a
  different entry point from `sweep({ all: true })`: same coverage, an order of
  magnitude apart, because `sweep()` invalidates first. The bench measured the
  wrong one and reported the backstop as expensive as a whole-document sweep —
  which is how that distinction earned both a test and this paragraph.

Re-verified after the fix, same harness: **12 / 12 in all four scenarios**,
including after `page.pdf()`.

### 4b (continued). What the band still decides

Within a generation each section is probed at most once, and only while it sits
in the **sweep band** — the viewport plus one viewport either side. The cache key
is `(generation, width, height)`; the box is in the key because a lazily-decoded
image or a late chart can resize one slide with nothing bumping the generation.

**Why a rect test and not an `IntersectionObserver`.** The band test reads
`getBoundingClientRect()` on the **section**, which under `contain-intrinsic-size`
is answered from the placeholder without laying the subtree out — so the filter
does not de-virtualize the thing it is deciding whether to probe (0.1ms for 117
sections). An `IntersectionObserver` costs about the same, adds an observer
lifecycle, and its first callback lands a frame late — so the boot sweep would
have nothing in play and the first paint would carry no ring.

**Every "cannot tell" fails toward measuring.** A null rect, an all-zero rect, no
viewport height: all in band. A watcher that goes quiet whenever it cannot see is
the exact failure this register exists to prevent (#1299 shipped 24 cut text
rects at `over: false` because one selector was missing from a hand-kept list).

**Skipped work is counted, not silent** (HARD RULE #25): `planFitSweep` returns
`{ measure, skipped: { offBand, current }, total }`, so a caller can say "3
probed, 55 off-band" rather than implying it covered the deck.

**The cache records MEASUREMENT, never intent** — and the first cut got this
wrong in the one direction that silences a slide. It wrote `fitState` from the
PLAN, before `check()` had probed anything. `check()` is a single loop over the
batch, so a throw on slide *k* left slides *k+1…N* unprobed but stamped `current`
at that generation — and because the scroll path deliberately does not open a new
generation, they were then skipped as already-done on every subsequent scroll
sweep. Reproduced on the real bundle: two slides overflowing by 1300px carrying
no ring and no tab, which scrolling them back into view did **not** recover,
contradicting the recovery this change's own gotchas entry promises. Only a fresh
generation cleared it.

Now `check()` guards each slide individually, returns the ones it actually
probed, and the caller records only those. A bad slide costs its own verdict and
nothing else, and the next sweep retries it. The failure is also reported once
per document, because a probe that throws throws on every sweep and a console the
author cannot read past is its own outage.

The **boot** sweep is guarded for a different reason: everything after it is
registration (the font re-measure, the content hook, both listeners,
`window.latticeSweep`). Letting a throw escape there would disable the watcher
for the document's whole life over one bad frame — where the old shape lost only
three registrations to the same throw. That is a pre-existing fragility this
change would otherwise have made materially worse (HARD RULE #18).

### 4c. The marker's chrome belongs to the markup

`lib/core/fit-berth.js`. Three empty, out-of-flow, `display: none` elements land
as the last children of every slide section: `.overflow-tab`, `.illegible-tab`,
`.fixme-tab`. The engine's string adapter emits them; the runtime's DOM adapter
mirrors it; **both watchers only ever fill them.**

This deletes three shipped defect classes rather than guarding them:

- **`off` cannot leave a stray tab.** It used to append one that survived purely
  because CSS hid it, while the emulator's inline watcher skipped the branch —
  two producers, different DOM, same level.
- **Two producers no longer reconcile.** A `--fluid` export runs the emulator's
  inline watcher *and* the runtime's. They each minted a tab, which is why the
  runtime carried a branch for *"a tab ANOTHER producer already drew, whose
  wording belongs to a different level"* — the hybrid that shipped a calm reader
  pill reading "Overflows".
- **There is no childList mutation to observe.** Filling a berth is a text write.

**It has to run LAST on both paths**, and that is a requirement rather than a
preference: the berth must be a *direct child* of the section, and the Form
composition sweeps everything from the masthead band to the end of the slide into
`.cell-stage` (`masthead-lift`), while `applyImageStructure` folds loose children
into `.image-text`. A berth emitted by the markdown pipeline would be buried
inside the very box it reports on.

**The berths had to be named in `IMAGE_TEXT_KEEP_OUT`** (`lib/core/bg-image.js`),
and the first cut named only the one that was already there. That list kept
injected chrome out of the `.image-text` panel and named `overflow-tab` alone —
correctly, for as long as a watcher created that tab *late*, after the panel had
already been built. Emitting all three as markup made the gap reachable: measured
on a real `image` slide, `.illegible-tab` and `.fixme-tab` were folded into the
panel and duplicated, leaving `section.image .image-text > :last-child` resolving
to an empty marker div instead of the author's last block. Nothing moved — a
composition rule ties that selector on specificity and wins on source order — but
an invariant this file's own docstring calls load-bearing was being violated
invisibly, one specificity tie away from displacing author content.

`berth()` **mints on a miss** rather than returning null. The miss should be
unreachable — every render path berths — but the alternative is the marker going
silent on a document this transform never touched, and that is the one failure
mode the whole register exists to prevent. Minting is safe here in a way the old
create-per-tick was not: at most once per section, and nothing observes childList.

### 4d. Fix-Me is drawn in the slide

The overlay was a `position: fixed` layer in `document.body` holding one
absolutely-positioned box per culprit, rebuilt from `getBoundingClientRect()`
every pass and re-synced on a `scroll` listener. It was written that way to honor
a real constraint that **still stands**: a marker must never become a DOM child
of the cell it reports on, because appending even an absolutely-positioned child
shifts `nth-child` for every sibling selector inside that cell — and a marker
that perturbs the layout it measures can manufacture the overflow it reports
(HARD RULE #20; an in-flow tab once took 50px out of the `.cell-stage` it was
reporting on).

`outline` honors that constraint outright, and better:

- **Drawn outside the box model** — no reflow, no space consumed, no child
  appended, so no index moves and no measurement changes.
- **Tracks scroll for free.** The overlay's coordinates were viewport-relative
  and went stale on any scroll without a coincident mutation; the `scroll`
  listener existed solely to re-measure rects. Deleted.
- **Tracks scale for free.** Every preview surface scales its slides. A fixed
  overlay in the host document sits outside that transform and had to be
  positioned from already-scaled rects — the same visual-vs-layout pixel
  confusion behind the Playground/Studio overflow disagreement
  (`2026-07-29-section-cq-icb-leak.md`). An outline is inside the transform by
  construction.
- **Survives the sweep being scoped.** One global layer rebuilt from the last
  pass would have been wiped for every slide a scoped sweep skipped. Per-element
  state has no such coupling.

The **label** is section-level (the `.fixme-tab` berth) rather than per-cell,
because an absolutely-positioned tag on the cell needs the cell to be
`position: relative` — which changes the containing block for every
absolutely-positioned descendant it holds. Author content moving because a QA
marker was drawn is not a trade worth making. The section is already the
containing block the other two tabs use.

---

## 5. The numbers

`npm run bench -- --sweep`, headless Chromium, filmstrip-virtualized (the styling
`deck-preview.js` actually applies), 1440×900. Both figures are measured on the
**same page in the same run**, so the "before" is the old *shape* re-measured
rather than a number from an older commit on different hardware:

| Deck | slides | overflowing | whole-document | scoped | × cheaper | backstop |
|---|---|---|---|---|---|---|
| normal (jargon) | 58 | 1 | 10.4 ms | 0.5 ms | **20.8×** | 0.4 ms |
| charts | 15 | 0 | 4.4 ms | 0.7 ms | **6.3×** | 0.1 ms |
| overflowing (×40) | 40 | 40 | 23.6 ms | 2.3 ms | **10.3×** | 0.2 ms |

**An earlier revision of this table was measured on slides with NO ENGINE CSS,
and the numbers above replace it.** The tier called
`api.render(src, { theme })` where the signature is `render(markdown, theme)` —
an object where a string belongs, which resolves to no theme and returns empty
CSS. Every slide it measured was unstyled: no clip cells, no container queries,
a fraction of the real element count. Both arms saw the same DOM so the *ratio*
survived roughly intact, but the absolute costs described a deck nobody renders,
and the `overflowing` column was pure artifact — the shipped decks mostly FIT
once they are actually styled (6 → 1 and 6 → 0), while the synthetic
all-overflowing deck stays at 40/40 and goes on carrying the expensive path.
Found by following the inversion's export finding into the same harness.

**A browser tier had to be built for this**, and its absence is part of the
story: the probes run over laid-out DOM, so the in-process render tier cannot see
them and the whole-cycle export tier drowns them (a few ms inside an 8-second
export). That is how a whole-document per-frame scan shipped and stayed.

`overflowing` is a first-class dataset because the sweep's cost is dominated by
whether `probeContentClipped` runs — a text-node walk with a Range rect per node,
an order of magnitude dearer than the geometry probe, firing only when something
clips. A corpus of well-fitting decks measures the cheap half and reports a
healthy number for a path that is only expensive exactly when an author is
editing a broken deck, watching the ring, and generating the mutation bursts.

**The check gates a floor, not a percentage**, and the first cut got that wrong
in the direction that produces a gate nobody trusts. A ±40% band read
`normal (jargon)` at 23.5× when blessed and 13.6× on the next run of an identical
tree, and called it a regression: `scopedMs` there is ~0.4ms, close enough to
timer granularity that 0.1ms of jitter is 25% of the reading. The failure worth
catching is not "the ratio moved" but "the sweep stopped being scoped", which
collapses the ratio toward 1× from anywhere in the 8–24× range. A **3× floor**
catches every version of that and cannot be tripped by jitter.

---

## 6. What this costs

**The ring no longer updates mid-keystroke.** It updates when the render settles,
**about 320ms after an edit** — measured on the shipped bundle, not the 150ms an
earlier draft of this section claimed. The path is two stacked trailing-edge
debounces: `scheduleRun` (150ms) → the content pass → `onContentSettled` →
`scheduleSweep` (another 150ms). Understating an accepted trade by 2× in the
record the next reader budgets against is its own defect, so: ~320ms. This was put
to the maintainer as the one genuine behavior trade and accepted. It is a smaller
change than it sounds: the render is already debounced, and the Studio already
sampled `section.overflow` at load and again at 600ms (`single-slide-render.ts`)
rather than reading it live.

**A layout change caused by neither a DOM mutation nor a resize can be missed.**
Mutations are covered — `childList` via the content pass, `characterData` via the
observer above — as are fonts and the diagram queue. A late `<img>` decode that
resizes one slide is covered by the box being in the cache key. A layout shift
with no mutation, no resize and no box change behind it would wait for the next
trigger. (An earlier draft of this section made a broader claim, that only a
non-mutation change could be missed. That was false when written: `characterData`
was uncovered. Corrected rather than deleted — a cost stated too favorably in a
decision record is what the next reader budgets against.)

**Exported artifact bytes changed.** Every slide now carries three empty hidden
divs. No ink moves — they are `display: none` until a class reveals them, and the
rendered PDF is visually unchanged — but the HTML sidecar and the PDF's byte
stream differ, so this went through the export sign-off gate rather than shipping
on "it looks the same".

---

## 7. What was checked, and what was deliberately left alone

- **`patchSectionGeometry`** stays on the per-frame dispatcher. Measured at 0.1ms
  for 117 sections (§1c), and its `--_sec-1cqi` stamp is load-bearing for layout
  correctness on resize — moving it to a 150ms settle would trade a
  non-problem for visible reflow lag.
- **The author / reader / off register** (`2026-07-30-overflow-marker-register.md`)
  is untouched. It answers *who the signal is addressed to*, which is orthogonal
  to *when it is measured*, and it was right.
- **The probes themselves.** `overflow-probe.js` is unchanged apart from the
  marker-chrome selector following the Fix-Me rename. What each probe measures,
  and the long list of false positives it was tuned against, is not what was
  wrong here.
- **The Fix-Me signal in a rasterized artifact.** The old overlay was
  `position: fixed` in `document.body`, and the Studio's raster capture
  (`html-to-image`) clones **the section and its descendants only, not its
  ancestors** — so the overlay could never reach a PNG / PPTX / PDF. That safety
  was an accident of where the layer lived, and moving the signal INTO the slide
  silently moved it inside the clone boundary; the capture host builds its srcdoc
  with no export-settings block, so it resolves to `author`. Without a rule, a
  delivered raster would have gained a yellow FIX ME chip and a yellow outline on
  any overflowing slide. `.lattice-exporting` (the export-safe face the capture
  already stamps) now suppresses both — verified by reading computed styles
  through a simulated capture: shown on screen, hidden during capture, restored
  after. The ring and the "Overflows" tab are NOT included: they are section
  descendants already and have always ridden into a raster at `author`, which is
  a real question but a pre-existing one this change neither caused nor worsens.

  The first cut of that rule did not match anything, and how it failed is worth
  keeping: written as `.lattice-exporting > .fixme-tab`, it came out of the
  packer as `article.lattice > section .lattice-exporting > .fixme-tab` — a rule
  requiring the class to be a DESCENDANT of a slide, when the capture puts it ON
  the slide. Same leading-compound trap `lib/core/leading-is.js` exists for, and
  the same one the `data-lattice-overflow-marker` gate rides on the section to
  avoid. It was caught by measuring the computed style, not by reading the
  selector — which is the only way it *could* have been caught.
- **The berth list is now DERIVED, not re-typed.** The inversion counted five
  hand-copied places (`fit-berth.js` `BERTHS`, the runtime's `MARKER_CHROME`
  filter, `overflow-probe.js` `MARKER_CHROME_SELECTOR`, `fluid-view-policy.js`'s
  `off` sweep, `bg-image.js` `IMAGE_TEXT_KEEP_OUT`) and pointed out that this
  change indicts forgettable guards while adding four more. Fair. Four of the
  five now derive from `BERTHS`; a fourth register is covered by all of them the
  day it is added rather than the day someone remembers.
- **Auto-split**, which was the last open question and is now closed. The
  splitter re-emits one slide as a cover plus N body pages, so there were two
  silent ways to be wrong: the berths counted as items to paginate (moving where
  the cut falls), or a page emerging with nowhere to draw its marker. Verified end
  to end — a 26-row portrait checklist split into **10 real pages** through the
  emulator, every page carrying exactly one of each berth as a direct child, none
  buried in a content cell, page count matching the PDF.

  One repair fell out of it. The splitter builds each **cover** fresh, so a cover
  carried no berth and the only thing drawing its marker was `berth()`'s
  mint-on-miss — a net documented as a branch that should never be taken, which a
  split deck would have taken on every cover. The export now re-berths after the
  split converges, folded into the re-render `applyRails` already does
  (`fitBerth.applyToDocHtml`). That form exists because the plain adapter cannot
  be pointed at an assembled document: embedded chrome mentions `<section …>` in
  prose, which derails the depth-aware walker into returning nothing — measured on
  a real sidecar. It slices the head prefix off at the first real slide, which is
  exactly what `resplitDoc` already does for the identical hazard.
- **The docs-site call sites.** `window.latticeSweep` is exposed and documented;
  `deck-preview.js` and `single-slide-render.ts` are not yet wired to it, because
  the observer path already covers the same ground within one settle window and
  rewiring the Studio's render bookkeeping is a separate change (HARD RULE #17).
