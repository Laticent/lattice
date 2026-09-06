---
status: shipped
summary: >
  A diagram slide in the Studio paints its raw ```mermaid source before it paints the
  diagram, and the report that it "didn't use to be that way" is half right. Two mechanisms
  cause it, both older than the report: the runtime hides the fence by writing
  `data-mermaid-state` from a 150ms-DEBOUNCED observer, and nothing hides it before that
  attribute exists; and the Studio's frame signature carries `mermaid` PER SLIDE, so moving
  from a text slide to a diagram slide misses the patch path and REBUILDS THE IFRAME REALM —
  6 of 6 measured — discarding the rendered-SVG cache with it. Both arrive with #1080 (July),
  and before it every render was a full rewrite, so no regressing commit exists; what changed
  is #1614 (2026-08-11), which zeroed the fence's padding so the source now sits flush under
  the title and reads as part of the slide. Measured on the real Studio with a new
  rAF-sampling bench (`docs/scripts/diagram-flash-bench.mjs`): typing one character on a
  diagram slide repaints the raw source for 10 PAINTED FRAMES even unthrottled, with the
  finished SVG in cache the whole time. Seven candidates were priced on that instrument. Two
  results decide it. A faster path shows MORE frames of source, not fewer (a free main thread
  has time to repaint the wrong state), so shortening the window and removing the flash are
  separate fixes. And replaying the cached SVG from the mutation MICROTASK — before the frame
  that write produces — takes every measured arm to zero wrong frames at 15-18ms. Recommended:
  E (same-task replay) + A (withhold the fence's ink, 3 lines of CSS, for the genuinely cold
  render), then D (deck-scope the mermaid flag) as its own change. C (cross-fade) is rejected
  on its own measurement — it leaves the source on screen 50-75% LONGER; F (render in the
  engine) on price — ~700ms idle and ~1.8s busy before anything appears, paid on the Studio's
  own thread; G (anime.js) on 116KB for what one `::before` already does.
  SHIPPED as A+E+D, re-measured from a real build rather than from injected candidates:
  typing 10 source frames / 172ms -> 0 source, 0 blank, 20ms; navigate-revisit 4 / 368ms ->
  0 source, 0 blank, 20ms with 0 of 4 realm rebuilds; a genuinely cold diagram is 0 source
  frames behind an empty slot at 455ms. Implementing E surfaced a LATENT DEFECT the bake-off
  had not: `diagramScopeKey` keyed the SVG cache on the section's raw inline `style`, which
  the runtime itself stamps (`--_sec-1cqi` from patchSectionGeometry, `--logo-*` from the
  deck logo) — and any `setProperty` makes the browser re-serialize the rest, rewriting
  VALUES as well as whitespace — so one slide produced two different keys either side of the
  stamp and the replay missed 100% of the time. The key now reads the CSSOM's own
  serialization (`style.cssText`) and drops runtime-written properties, which also stops the
  ordinary path missing on a re-serialized section. Failure direction is a miss (a
  re-render), never another slide's baked ink. An independent checker then caught two
  self-inflicted defects before merge, both fixed and both recorded in §5: the CSS rule
  blanked the source in EXPORTS (a `~~~mermaid` fence, which `preprocessMermaid`'s regex does
  not match, reaches the exported HTML unsubstituted with the runtime stripped), so the rule
  now requires a `[data-lattice-runtime]` attribute that only a builder injecting the runtime
  stamps; and the first normalization missed the CSSOM's VALUE re-serialization, so every
  slide carrying a `![bg](…)` would still have missed.
---

# The Mermaid fence flashes before the diagram — measured, and seven ways out

**Date:** 2026-09-05 · **Status:** shipped (A+E+D) · **Surface:** Studio live preview

A diagram slide in the Studio paints its raw ```mermaid source first, then swaps it
for the diagram. This note reproduces that, measures it, and prices seven candidate
fixes against each other on the same instrument.

Instrument: `docs/scripts/diagram-flash-bench.mjs` — drives the built site at
`/studio/`, types a four-slide deck (text · diagram · text · diagram) into the real
editor, and samples the preview iframe once per `requestAnimationFrame`. A rAF
callback runs immediately before the frame it belongs to composites, so the state
read there *is* what that frame paints. Pictures come from
`Page.startScreencast` over CDP, which hands over the frames the compositor actually
produced (a loop of `page.screenshot` would force paints and report a timeline that
never happened).

---

## 1. What the author sees

Two painted states share the diagram's slot, and the wrong one goes first:

| | what fills the slot | where it sits |
|---|---|---|
| before | the fence's source text, ~13px mono | flush left, directly under the title |
| after | the rendered SVG | centered, filling the slot |

Since #1614 (2026-08-11) the un-rendered `<pre>` carries **zero padding**, so the
source text now shares its left edge with the slide's title and dek. That is why it
reads as *part of the slide* rather than as an indented code block — and it is the
one dated change that alters how this flash reads. It did not create it.

## 2. Where the window comes from

Two independent mechanisms, both older than the reported change:

**The runtime tags the fence on a 150ms debounce.** `lib/runtime/index.js` hides the
`<pre>` through CSS keyed on `data-mermaid-state`, and nothing hides it *before* that
attribute exists. The attribute is written by `wrapFences()`, which the
MutationObserver reaches through `scheduleRun()` — `DEBOUNCE_MS = 150`. Every
re-render of a diagram slide therefore repaints the raw source for at least 150ms,
even when the rendered SVG is already in the runtime's own cache.

**The Studio's frame signature carries `mermaid` per SLIDE.**
`StudioShell.tsx` passes `mermaid={hasMermaid(slide)}` and
`docs/src/lib/single-slide-render.ts` folds that flag into the signature that decides
patch-vs-rewrite. So a text slide and a diagram slide never share a signature:
**every navigation across that boundary tears down the iframe realm and rebuilds it**
— re-parsing ~560KB of CSS, re-executing the 529KB runtime and the 3.16MB Mermaid
bundle, and discarding `mermaidSvgCache` with the realm it lived in. Measured: 6 of 6
such navigations were full rewrites, and a revisit costs the same as a first visit.

Neither is new. The patch fast path, the signature's `mermaid` term, and the 150ms
debounce all arrive together in #1080 (2026-07-19), and before it *every* render was
a full rewrite — so the flash predates the machinery that was supposed to remove it.
No single regressing commit was found; what changed on 2026-08-11 is how the flashed
frame is typeset, not whether it happens.

## 3. Baseline — what it costs today

Chromium, built site, median of 3 runs. "raw-source frames" counts frames the
compositor produced with the fence's ink on screen; `--cpu N` throttles through CDP,
because a race measured only on an idle machine is measured at its most flattering.

| scenario | CPU | raw-source frames | time to diagram | realm rewrites |
|---|---|---|---|---|
| navigate text → diagram, first visit | ×4 | **4** | 448ms | 2/2 |
| navigate text → diagram, revisit | ×4 | **4** | 368ms | 4/4 |
| navigate diagram → diagram | ×4 | **10** | 171ms | 1/4 |
| **typing on a diagram slide** | ×1 | **10** | 156–165ms | 0 |
| **typing on a diagram slide** | ×4 | **10** | 172ms | 0 |

Two things this table says that the report did not:

- **Typing is the worst case, and it happens on an idle machine.** Every keystroke on
  a diagram slide blinks the diagram back to source for ~160ms — the debounce,
  deterministically — with the finished SVG sitting in cache the whole time.
- **A faster path shows MORE frames of source, not fewer.** Diagram → diagram is
  twice as fast to the diagram (171ms) and paints 2.5× more source frames, because a
  free main thread has time to paint the wrong state repeatedly. Shortening the window
  is not the same as removing the flash; they are separate fixes.

Layout shift is 0 in every arm: `mermaid.css` already sizes the un-rendered `<pre>`
to the rendered slot. The "jump" is a *content* swap — small top-left text becoming a
large centered figure — not a reflow.

## 4. The candidates

Each measured on the same instrument, at ×4 CPU, medians. CSS candidates were injected
into the preview frame at document-start (the same moment a rule shipped in
`lattice.css` would apply); cascade position differs from shipping, so the winner is
re-measured from a real build before it lands.

### A — withhold the fence's ink until it is tagged  (3 lines of CSS)

`visibility:hidden` on the `<code>` of an untagged mermaid fence. The `<pre>` keeps
its box, so the slot stays reserved and nothing moves.

| | raw-source | slot state | time to diagram |
|---|---|---|---|
| navigate, revisit | **0** | 4 frames empty | 367ms |
| typing | **0** | 10 frames empty | 181ms |

**Pro** — the smallest possible change; kills the flash outright; zero layout shift;
works before any JavaScript runs, including during the realm rewrite.
**Con** — it converts the flash into a *blank*: on a keystroke the diagram vanishes
and returns 160ms later, which reads as a blink rather than a glitch but is still
motion. And if the runtime never loads (JS blocked, a CSP that stops the script) a
diagram slide shows nothing where it used to show its source.

### B — A, plus a drawn placeholder in the reserved slot  (~20 lines of CSS)

Three node boxes and the rules between them, in `--diagram-stroke`, breathing on a
1.6s cycle, silent under `prefers-reduced-motion`.

| | raw-source | slot state | time to diagram |
|---|---|---|---|
| navigate, first visit | **0** | 5 frames skeleton | 454ms |
| navigate, revisit | **0** | 4 frames skeleton | 366ms |

**Pro** — everything A gives, and the empty slot now says "a diagram is coming"
instead of "something is broken"; costs nothing (no library, no JS, one `::before`).
**Con** — on a keystroke it is a *pulsing* blink rather than a quiet one, which is
worse for the case that hurts most; and a placeholder that appears for four frames is
its own kind of noise. Pairs badly with C-class fixes that already remove the wait.

### C — keep the fence and cross-fade it into the diagram  (~15 lines of CSS)

Stack the SVG over the `<pre>` in the same slot and dissolve between them over 240ms.

| | raw-source | time to diagram |
|---|---|---|
| navigate, first visit | **7** (was 4) | 488ms |
| navigate, revisit | **6** (was 4) | 356ms |

**Pro** — nothing on the slide ever moves abruptly; the transition reads as
deliberate.
**Con** — **it makes the measured complaint worse, by design.** Softening the swap
means the source is on screen 50–75% *longer*, and the thing the report objects to is
seeing the source at all. It also needs the SVG absolutely positioned over the `<pre>`,
which puts a `position:absolute` into the diagram slot that the Fit spine and the
overflow probe both measure. Measured and rejected, not dismissed.

### D — give the frame signature a DECK-scoped mermaid flag  (1 line in the Studio)

`hasMermaid(editorSample)` instead of `hasMermaid(slide)`, so moving onto a diagram
slide patches the resident document instead of rebuilding the realm.

| | raw-source | time to diagram | rewrites |
|---|---|---|---|
| navigate, revisit | 10 (was 4) | **175ms** (was 368ms) | **0/6** (was 6/6) |

**Pro** — halves time-to-diagram, ends the realm churn, and keeps the runtime's SVG
cache alive across navigation — which is what makes E possible at all.
**Con** — on its own it makes the flash *look worse* (10 painted source frames
instead of 4, per §3), and it injects the 3.16MB Mermaid bundle into every full write
of any deck that contains a diagram anywhere, including its text slides.

### E — replay the cached SVG in the SAME TASK as the swap  (~30 lines in the runtime)

A MutationObserver callback is a microtask: it runs after the parent's `innerHTML`
write and *before* the frame that write produces. Doing the cache lookup there means
the first painted frame of the new slide already carries the diagram.

| | raw-source | blank | time to diagram |
|---|---|---|---|
| typing (with the SVG cached) | **0** | **0** | **18ms** |
| navigate, revisit (with D) | **0** | **0** | **15ms** |
| navigate, first visit | 10 | 0 | 367ms |

**Pro** — the only candidate that removes the transition rather than restyling it:
on a revisit and on every keystroke the diagram never leaves the screen. Needs D to
help *navigation* (without it the cache dies with the realm each time); helps typing
on its own.
**Con** — does nothing for a genuinely cold diagram, which is why it wants A or B
beside it. The replay must key on the palette scope exactly as the runtime's cache
does, or a theme change replays a stale-colored SVG — the prototype keyed on source
text alone and would have.

### F — render the diagram in the engine, ship the slide with its SVG

Measured cost of the diagram itself, in a real page:

| | CPU ×1 | CPU ×4 |
|---|---|---|
| load + parse + execute Mermaid (3.16MB, warm HTTP cache) | 630ms | 1487ms |
| `mermaid.render()`, 5-node flowchart, first | 85ms | 290ms |
| `mermaid.render()`, same source again | 33ms | 152ms |

**Pro** — one render path for preview and export; no swap to hide because there is
nothing to swap.
**Con** — the whole slide waits on the diagram: **~700ms on an idle machine and up to
~1.8s on a loaded one** before *anything* appears, on the first diagram of a session.
And the render would run on the Studio's own thread, so it is the typing loop that
pays it, not the preview. This is the trade the report already names, priced.

### G — an anime.js placeholder

**Rejected before measurement, on cost.** anime.js is 116KB minified and is not in
the preview frame today (Anima loads it lazily, for figures). The placeholder in B is
one `::before` and one `@keyframes` — a library buys nothing here, and a JS-driven
animation in the frame competes for the same main thread that is late tagging the
fence.

## 5. What shipped

**A + E + D**, in that order. Re-measured from a real build — the candidates in §4 were
injected into the preview frame, so these are the numbers that count:

| scenario | before | after |
|---|---|---|
| typing on a diagram slide | 10 source frames · 172ms | **0 source · 0 blank · 23ms** |
| navigate on, revisit | 4 source frames · 368ms · 4/4 rebuilds | **0 source · 0 blank · 28ms · 0/4** |
| navigate on, first visit | 4 source frames · 448ms | **0 source** · 10 frames empty · 517ms |

Layout shift stayed 0 in every arm.

**Implementing E surfaced a defect the bake-off had not.** The first implementation missed
the cache 100% of the time, and the reason was not in the replay: `diagramScopeKey` keyed a
rendered diagram on the section's RAW inline `style`, and the runtime writes to that style —
`patchSectionGeometry` stamps `--_sec-1cqi`/`--_sec-1cqh`, and a `logo:` deck gets `--logo-*`.
Touching the attribute also makes the browser re-serialize the rest with a space after every
colon. Measured on the running Studio, one slide therefore produced two keys:

```
authored   --theme:"cuoio";--class:"diagram";
stamped    --theme: "cuoio"; --class: "diagram"; --_sec-1cqi: 12.800px; --_sec-1cqh: 7.200px;
```

Any reader on one side of the stamp could never hit a cache filled on the other. The key now
drops runtime-written properties and normalizes whitespace and declaration order
(`normalizeScopeStyle`), which also stops the ORDINARY path missing on a re-serialized
section. The failure direction is stated in the code and is why this is safe: an unlisted
runtime stamp costs a cache miss — a re-render — and can never hand a slide another slide's
baked ink, because everything surviving normalization is still compared exactly. Pinned in
`test/unit/runtime/mermaid-per-slide-band.test.js` against the real strings above.

### What an independent checker found, and what it changed

Maker–checker on the diff (CLAUDE.md § MAKER-CHECKER) returned two CONFIRMED
self-inflicted defects, both outside the surface this change set out to touch. Both are
fixed above; they are recorded because each was asserted as *verified* in three
documents before anyone drove it.

**The CSS rule blanked the source in EXPORTS.** `preprocessMermaid` (lattice-emulator.js)
matches ```` ```mermaid ```` and nothing else, so a `~~~mermaid` fence — a form the
Studio's own diagnostic accepts (`mermaid-check.ts`) — reaches the exported HTML
unsubstituted, with the runtime stripped. Un-scoped, the new rule hid it: the author's
only signal that the CLI never drew their diagram became an empty slot, silently, in
export bytes. Reproduced with one CLI run. The rule is now gated on
`[data-lattice-runtime]`, an attribute stamped by the three builders that inject the
runtime (`previewRuntimeAttr`, deck-preview.js) and by nothing else — so every export
path, the `.html` player and a hand-rolled Marp page keep the old behavior. It is in the
markup rather than set by script at boot because the window this rule covers starts at
first paint of a full document write. The cost is that marp-vscode's own preview, which
assembles its own page, does not get the rule.

**The scope-key normalization did not achieve the stability it claimed.** It handled the
two drifts measured above and not the third: the CSSOM re-serializes VALUES, so
`background-position:center` returns `center center` and `url(x)` returns `url("x")` —
which moved the key on every slide carrying a `![bg](…)`. The key now reads
`style.cssText` (the CSSOM's serialization, identical on both sides by construction)
rather than the `style` attribute; `normalizeScopeStyle` still drops the declarations the
stamp ADDS. Driven in real Chromium across five engine-emitted styles — plain, `url()`
background, data-URI background, color, and a value containing `;` — all five now stable,
with palette, `_class: dark` and a genuinely different background still splitting the key.

**A SECOND checker, on the shipping diff, found the first checker's fix was itself
defective — and that is the finding worth carrying forward.** The gate added in response
to the export regression required `[data-lattice-runtime]`, on the stated reasoning that
"only a builder that injects the runtime writes it". That was false:
`lib/runtime/index.js` has always written exactly that attribute on
`document.documentElement` at boot. So the rule switched itself ON in every document the
runtime booted in — precisely the set it was written to spare — and on a host with the
runtime but NO Mermaid (marp-vscode's markdown preview and its render-blocks-only stub, a
404 on the script, a CSP that blocks it) a fence arriving after boot was hidden
permanently: neither guard tags it, and the CSS hid it anyway. Driven on a hand-rolled
page, and the false claim appeared in four documents.

The lesson is not "check the attribute name". **The runtime was never the right
precondition.** A fence is replaced by MERMAID, so that is what a document has to promise,
and the gate is now `[data-lattice-diagrams]`, written by `previewDiagramsAttr()` exactly
when a builder injects the Mermaid script. Both halves re-driven: a CLI export carries
`data-lattice-runtime` (the runtime boots during the render) and NOT
`data-lattice-diagrams`, so the unsubstituted `~~~mermaid` fence still reads; the
late-fence repro now reports `visibility: visible`.

Three more from that pass, all fixed:

- **`normalizeScopeStyle` sorted its declarations**, which discards last-one-wins:
  `background:red;background-color:blue` and its reverse resolve to different colors and
  normalized to ONE key — the aliasing direction this key exists to prevent. Unreachable
  through the production caller (`style.cssText` de-duplicates first), but live for the
  plain-object caller the module's own header advertises. Order is preserved now; a
  reordered authored style misses instead, which is the safe direction.
- **The `--logo-*` drop also covered `--logo-ink`**, a color token. Narrowed to the five
  placement properties `deckLogoPlacement` actually emits.
- **`engineering/mermaid.md` still printed the un-gated rule** and the argument the first
  checker had already refuted — the one place a reader would have picked up the defective
  version.

Two rounds of independent review, four confirmed defects, every one of them in the
BOUNDARY of the change rather than its mechanism: which documents the CSS reaches, which
attribute names are already taken, what a normalization silently discards. The mechanism —
settle from cache in the microtask — was right the first time and has not been touched
since.

Three more findings from the FIRST pass, dispositioned:

- **The replay tagged fences with no Mermaid to render them.** `initAndRun` returns before
  `wrapFences()` when `window.mermaid` is a stub or absent; the replay had no such guard,
  so on such a host a fence arriving after boot would be tagged, hidden, and never
  rendered. It now opens with the same guard.
- **Two comments asserted the opposite of the code** (StudioShell's "unified to the shown
  slide", PresentOverlay's "keeps the render signature aligned with the editor"). Both
  rewritten — and the second exposed that Present was still slide-scoped, so a presenter
  moving between a text slide and a diagram slide rebuilt the frame's realm *mid-talk*.
  Present is deck-scoped now too.
- **D lengthening the life of the stale-palette-after-restyle hazard** — NOT REPRODUCED.
  Driven on the built Studio with a cached diagram: flipping the mode re-themed the slide
  surface and the diagram ink together. Recorded as driven for the mode toggle only.

One knock-on: extracting `settleFenceFromCache` collapsed what would have been a third
`target.innerHTML` site into one shared injection, and HARD RULE #22's runtime-markup census
is a count. The receiver is destructured (`const { target } = job`) rather than written as
`job.target.innerHTML`, so the census's text matcher still sees the sink it declares; that is
recorded in `SANCTIONED_RUNTIME_MARKUP_SINKS`.

## 6. Recommendation, as it stood before the pick

**E + A, then D.** In that order, and they are one change each:

1. **E** removes the flash where the author actually lives — every keystroke on a
   diagram slide, every revisit. 0 frames, 18ms, nothing moves.
2. **A** covers what E cannot: the first, genuinely uncached render. Three lines.
3. **D** halves time-to-first-diagram and stops the realm churn, which is also what
   lets E cover navigation. It is the one with a real cost to weigh (the bundle on
   text slides of a diagram deck) and it belongs in its own change.

Stacked, measured: first visit **0** source frames / 388ms; revisit and keystroke
**0** source frames, **0** blank frames, **15–18ms**.

C is rejected on its own measurement; F is rejected on the 700ms–1.8s it charges the
slide; G is rejected on 116KB for what CSS does for free.

## 7. What is not verified

- ~~The CSS candidates were injected into the frame, not shipped~~ — CLOSED: §5's table is
  from a real build, and A behaves the same shipped as injected.
- One machine, Chromium only, one deck, 3–4 runs per arm. The numbers are medians,
  not a distribution.
- Candidate B was not measured under the typing scenario; it differs from A only in
  what fills the reserved slot, so its source-frame count is A's by construction —
  but that is an argument, not a measurement.
- The `~~~mermaid` export gap this uncovered is REPORTED, not fixed: `preprocessMermaid`
  still substitutes only ```` ```mermaid ````, so those fences render as source in a PDF.
  Widening that regex changes export bytes, which is the QUALITY BAR's stop-and-show gate
  and a different change from this one. Off the path (HARD RULE #18), so it is logged here
  rather than pulled into this diff.
- A's failure mode with the runtime absent is now STRUCTURAL rather than argued: the rule
  requires `[data-lattice-runtime]`, which only a builder that injects the runtime stamps, so
  a document without one cannot match it. Verified on a real export (the fence renders
  `visibility: visible`). What is still not driven: a document that stamps the attribute and
  then fails to load the runtime — a CSP that blocks the script, or a 404 on `runtimeUrl`.
  There the source stays hidden.
- D's first-mount cost is now MEASURED, and it is not free. Same build, one variable — a
  three-slide deck whose third slide is a diagram, against the same deck with prose in its
  place — timing a reload to the preview's first painted `.lattice`, 5 runs each:

  | | idle (×1) | loaded (×4) |
  |---|---|---|
  | deck with a diagram (Mermaid injected) | 1038ms | 3715ms |
  | same deck, prose instead | 1022ms | 2715ms |
  | **cost of the injection** | **+16ms** | **+1000ms** |

  At ×1 the distributions overlap completely (1003–1054 against 1005–1047): noise. At ×4
  they do not overlap at all (3274–4117 against 2553–2824), so opening ANY deck that
  contains a diagram anywhere now costs about a second more on a loaded machine, whether or
  not the author ever visits that slide. Slide-scoped, that load was deferred until they
  navigated onto the diagram — so D moves roughly a second from "when you reach a diagram"
  to "when you open the deck", in exchange for 368ms → 20ms on that navigation and 172ms →
  20ms on every keystroke. The recurring costs shrink; the one-time cost grows.

  **The clean fix decouples the two things D conflates.** The signature needs to be constant
  across the deck (that is what stops the realm rebuild); the 3.16MB bundle does not need to
  be in the document from the first byte. Injecting it on first sight of a fence — from the
  runtime, inside the frame — would keep every measured win and hand back the second. Not
  attempted here: it changes when a shared dependency loads for every preview surface, which
  is its own change with its own blast radius. Logged rather than folded in.
