---
status: shipped
summary: >
  A diagram slide in the Studio paints its raw ```mermaid source before it paints the
  diagram, and the report that it "didn't use to be that way" is half right. Two mechanisms
  cause it, both older than the report: the runtime hides the fence by writing
  `data-mermaid-state` from a 150ms-DEBOUNCED observer, and nothing hides it before that
  attribute exists; and the Studio's frame signature carries `mermaid` PER SLIDE, so moving
  from a text slide to a diagram slide misses the patch path and REBUILDS THE IFRAME REALM —
  6 of 6 measured — discarding the rendered-SVG cache with it. Neither is a regression: the
  debounce predates the runtime's May move out of `src/`, the patch path is #913 (2026-07-11),
  and the per-slide `mermaid` flag is #1062 (2026-07-18) — the commit that made diagram slides
  render in the editing preview AT ALL, so the flash arrived with the feature. What changed is
  #1614 (2026-08-11), which zeroed the fence's padding so the source now sits flush under
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
  typing 10 source frames / 172ms -> 0 source, 0 blank, 23ms; navigate-revisit 4 / 368ms ->
  0 source, 0 blank, 28ms with 0 of 4 realm rebuilds; a genuinely cold diagram is 0 source
  frames behind an empty slot at 517ms. Implementing E surfaced a LATENT DEFECT the bake-off
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
  was gated on an attribute; and the first normalization missed the CSSOM's VALUE
  re-serialization, so every slide carrying a `![bg](…)` would still have missed. A SECOND
  checker then found that gate was itself defective — it required `data-lattice-runtime`, a
  name `lib/runtime/index.js` has always written at boot, so the rule switched itself on in
  exactly the hosts it was meant to spare and hid a late fence permanently on any host with
  the runtime and no Mermaid. The runtime was never the right precondition: a fence is
  replaced by MERMAID, so the shipped gate is `[data-lattice-diagrams]`, stamped only when a
  builder injects the Mermaid script. That pass also found a SORT in the scope key that
  discarded last-one-wins (two blocks resolving to different colors normalized to one key)
  and a `--logo-*` drop that swallowed the `--logo-ink` color token; both fixed. A THIRD
  checker, spent on the round-2 fixes, found the export exposure surviving in a SECOND
  export path: the Studio's raster exports (PDF/PNG/PPTX) rasterize the capture frame
  itself, where the rule was live and `html-to-image` bakes the computed `visibility` into
  the artifact — so a Mermaid failure there exported an empty slot. That frame no longer
  stamps. It also found the CSS gate and the builder's stamp joined by nothing a test read
  (the seam that had been wrong twice), and two more runtime-written families in the scope
  key: the watcher marker CLASSES, and the FIT agent's `transform`, rewritten on every
  resize. All fixed, all mutation-proved; §5.
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
read there *is* what that frame paints — and that sampler, not any
picture, is where every frame COUNT in this note comes from. `--shots` additionally saves
three `page.screenshot` stills per diagram arm (0/60/140ms) for eyeballing; they are
illustrations, not measurements, because a forced screenshot perturbs the timeline it is
sampling. (An earlier draft of this paragraph credited the pictures to
`Page.startScreencast` over CDP. That was true of a throwaway capture script used while
investigating, which was never committed — the instrument in the repo screenshots.)

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

Neither is new, and neither is a regression — but the first version of this note got
the history wrong, in a way worth recording because the mechanism will fool the next
person too. **This sandbox had a SHALLOW CLONE**, truncated at `0bff960a` (2026-07-19,
the squash point of #1080). `git log -S` against a shallow clone reports the truncation
boundary as the origin of everything that already existed there — so three unrelated
mechanisms all appeared to "arrive together in #1080", and the note said so. They did
not. Re-derived after `git fetch --unshallow` (2124 commits, not 466):

| mechanism | actually arrives |
|---|---|
| the 150ms `DEBOUNCE_MS` observer | predates the runtime's move out of `src/` (2026-05-28) |
| the srcdoc signature + patch fast path | **#913** (2026-07-11) |
| the signature's per-SLIDE `mermaid` term | **#1062** (2026-07-18) |

#1062 is the interesting one. Before it the Studio's editor preview passed
`mermaid={false}` unconditionally: Mermaid was never injected, and a diagram slide did
not render in the editing preview at all. #1062 — *"render diagram slides in the editing
preview"* — is what started injecting it, keyed on the shown slide. So the flash did not
regress out of working code; **it arrived with the feature that made diagrams appear
there**, and has been the behavior for roughly seven weeks. What changed on 2026-08-11
(#1614) is how the flashed frame is typeset, not whether it happens.

Anyone re-deriving this from a fresh agent sandbox should check
`git rev-parse --is-shallow-repository` first.

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
drops runtime-written properties and normalizes whitespace while PRESERVING
declaration order (`normalizeScopeStyle`), which also stops the ORDINARY path missing on a re-serialized
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
export bytes. Reproduced with one CLI run. The rule was then gated on an
attribute — and the FIRST gate chosen for it was itself defective; see the second-pass
section below for what actually shipped (`[data-lattice-diagrams]`, stamped by
`previewDiagramsAttr` only when a builder injects the Mermaid script) — so the CLI export, the
`.html` player builder and any page we did not assemble keep the old behavior — and so,
after the third checker, does the Studio's offscreen EXPORT capture frame, which goes
through `buildSrcdoc` with a real Mermaid URL and would otherwise have stamped. It passes
`diagrams: false`. Why that matters is in the third-pass section below: the frame is
rasterized, and `html-to-image` bakes a computed `visibility:hidden` into the .pdf / .png /
.pptx. Every export path now keeps the pre-rule behavior. It is in the
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

**A THIRD checker, on the round-2 fixes, found a sixth boundary defect — in a second
export path.** The card's own `raise it by:` line, spent.

- **The Studio's RASTER exports (PDF / PNG / PPTX) did change rendering**, and both this
  note and the PR said the opposite. The `.html` player is re-assembled by a builder that
  does not stamp, so that half held; the raster paths are rasterized OUT OF THE CAPTURE
  FRAME ITSELF, where the rule was live. `html-to-image` clones the node and copies the
  COMPUTED style onto the clone — Chromium returns `''` for a computed `cssText`, so it
  `setProperty`s every longhand, `visibility` included — and
  `forceSectionVisibleForCapture` cannot save it, because that forces the SECTION visible
  against an explicit `visibility:hidden` on a descendant `<code>`. Driven through the real
  rasterizer: pre-PR root → `visible`, PNG contains `graph LR;A-->B`; post-PR root →
  `hidden`, PNG contains an empty slot. Fixed by not stamping there at all
  (`buildSrcdoc({ diagrams: false })`): the frame is offscreen and transient, so the
  anti-flash rule buys nothing in it and only costs export bytes when Mermaid fails. This
  is the SAME defect class the first checker fixed for the CLI, surviving in a second
  export path — and the QUALITY BAR's export stop-and-show had been excused on the strength
  of the sentence that was wrong.
- **Nothing in the tree joined the CSS gate to the builder's stamp.** They are coupled by a
  matching string and by nothing else: renaming either side (or restoring round 1's
  `[data-lattice-runtime]`) left `npm test`, `build:check` and the docs suite all green,
  because no test read `mermaid.css`. That is the one seam that has now been wrong twice.
  Pinned in `deck-preview.test.js`: the attribute the rule keys on must equal the attribute
  `previewDiagramsAttr` writes.
- **The scope key's CLASS half had the identical drift the style half was just fixed for,
  and no filter at all.** The runtime toggles `overflow` / `clip-marked` / `fit-marked` /
  `illegible` on a section as its watchers measure it, so a reader running while a diagram
  slide is transiently marked keys the render one way and the reader after the marks clear
  misses. Reproduced where slow theme CSS let the overflow watcher win its race with
  `themeSettled`: one slide rendered twice and the replay presented a blank slot. Filtered
  now — but NOT `finish`, which the runtime also adds and an author can also write, where
  dropping would alias a finish slide with a plain one.
- **A third family of runtime-written inline properties: the FIT agent's `transform` /
  `transform-origin` / `margin-bottom`**, written onto every section of a `buildSrcdoc`
  document and rewritten on EVERY pane or window resize. Driven in real Chromium: the
  geometry and logo stamps leave the key byte-identical across six engine-emitted styles;
  these three moved it in all six. Unfiltered, every resize invalidated the whole
  document's diagram cache.

Two doc claims it also falsified: `engineering/mermaid.md` still told the next reader the
key "normalizes … order" (the statement the sort-removal refutes, and the line the round-2
commit believed it had fixed), and §7 below still carried the pre-re-measurement 20/20
figures. Both corrected above.

Three rounds of independent review, ten confirmed defects — two, four, then four — every
one of them in the BOUNDARY of the change rather than its mechanism: which documents the
CSS reaches, which attribute names are already taken, what a normalization silently
discards, and which properties and classes the runtime writes. The mechanism — settle from
cache in the microtask — was right the first time and has not been touched since. The
third pass also re-verified the round-2 fixes it did NOT overturn: both are
mutation-proved, `LOGO_PLACEMENT_PROPS` is exactly `deckLogoPlacement`'s output (complete
and minimal against the repo's twelve `--logo-*` properties), the observer re-entrancy
terminates, and every document that stamps the attribute injects Mermaid.

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
is a count. The receiver is destructured (`const { target, preEl } = job`) rather than written as
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
- A's failure mode is now STRUCTURAL rather than argued: the rule requires
  `[data-lattice-diagrams]`, which only a builder injecting the MERMAID script stamps, so a
  document that will not draw the diagram cannot match it. Verified on a real export (the
  fence renders `visibility: visible`) and on the second checker's own late-fence repro.
  What is still not driven: a document that stamps the attribute and then fails to load
  Mermaid — a CSP that blocks the script, or a 404 on `mermaidUrl`. There the source stays
  hidden. That exposure was ALSO not preview-only until the third checker drove it: the
  Studio's offscreen export capture frame stamped the attribute too, and a Mermaid failure
  inside it rasterized an empty slot where the old behavior gave raw source — confirmed
  through the real rasterizer, and fixed by not stamping in that frame. So the residual is
  now genuinely preview-only: a WATCHED frame that stamps and then 404s or is CSP-blocked
  keeps the source hidden. Reasoned, not driven.
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
  to "when you open the deck", in exchange for 368ms → 28ms on that navigation and 172ms →
  23ms on every keystroke (§5's re-measured figures; an earlier draft of this paragraph
  carried the pre-re-measurement 20/20 and survived the pass that corrected them
  elsewhere in this same section). The recurring costs shrink; the one-time cost grows.

  **What the second costs, and why it is CPU rather than scheduling.** The ~1s is the browser
  parsing, compiling and executing a 3.16MB minified bundle inside a FRESH iframe realm. It is
  not network — the Studio loads a vendored `mermaid-v11.min.js` same-origin from
  `<assetBase>export/`, and `test/unit/docs/no-cdn-runtime.test.js` fails on any CDN URL
  creeping back (`engineering/decisions/2026-09-03-self-hosted-runtime-deps.md`) — and it is
  not script-blocking: an
  `async` tag measured +1543ms against sync's +1581ms — a wash, so moving WHEN the parse
  happens does not help when the parse IS the cost. (Scratch experiment, not committed:
  indicative, not a pinned number.) Note also that the slide-scoped arrangement was not free
  — it paid the same ~1s PLUS a realm rebuild on every crossing onto a diagram slide, 4 of 4
  measured. D turns a repeated cost into a single one; it does not add one.

  **The clean fix decouples the two things D conflates**, and the conflation is literal: in
  `single-slide-render.ts` ONE boolean does two unrelated jobs — it is a term in the frame
  SIGNATURE (`:1381`, patch vs. full realm rebuild) and it decides whether the
  `<script src=mermaid>` tag is IN THE DOCUMENT (`:873`). D had to widen the first to deck
  scope, and widening it dragged the second along because they are the same variable. The
  signature needs to be constant across the deck (that is what stops the realm rebuild); the
  3.16MB bundle does not need to be in the document from the first byte. Injecting it on first sight of a fence — from the
  runtime, inside the frame — would keep every measured win and hand back the second.

  **THE SECOND IS NOT THERE. Re-measured 2026-09-06 with a committed instrument, and the
  +1000ms above does not reproduce — so the clean fix was built, priced, and DROPPED.**

  The +1000ms came from a scratch script that was never committed, at 5 runs. `bench:flash`
  now carries the arm (`--scenario mount --deck diagram|prose`), so anyone can re-derive
  this: it types one of two decks that differ in ONE slide — the third is a diagram, or
  prose in its place, and the SHOWN slide is prose in both — reloads the Studio, and times
  the reload against the preview's first `.lattice`, using `performance.timeOrigin` on both
  sides so the two clocks are directly comparable. ×4 CPU, 11 runs, medians:

  | | before | with the loader |
  |---|---|---|
  | frame's own clock → `.lattice`, diagram deck | 490ms (395–642) | 494ms (378–584) |
  | frame's own clock → `.lattice`, prose deck | 441ms (268–597) | 448ms (376–490) |
  | **what containing a diagram costs** | **+49ms** | **+46ms** |
  | reload → preview revealed, diagram deck | 2274ms | 2032ms |
  | reload → preview revealed, prose deck | 2044ms | 2016ms |
  | window.mermaid ready, frame's own clock | 754ms | 1182ms |

  Two readings, and the second is why nothing shipped. The FRAME-LOCAL number — the
  low-variance half, because it excludes the Studio's own ~1.6s boot — says the eager tag
  costs about **50ms**, not a second, and the loader does not move it: `.lattice` is in the
  markup BEFORE the script tag, so the parser reaches it either way. The PAGE-TOTAL number
  is the one an author feels, and it is below this instrument's noise floor: four passes
  (9 and 11 runs, both builds) put the diagram deck's reveal cost at −61ms, +199ms, +230ms
  and +16ms. **The sign disagrees across passes.** A change that alters when a shared
  dependency loads for every preview surface cannot be justified by a number whose sign is
  not stable, and HARD RULE #19 says so outright: a perf win without a reproducible
  measurement is unproven.

  The prototype worked and is worth describing, because the next person will have the same
  idea. `mermaidLoaderAgent()` in `deck-preview.js` — an inline script in the frame that
  appends the same `<script src>` on the first of (a) a fence present at first paint, (b) a
  fence arriving later, (c) the document going idle. Every path fires inside the runtime's
  own ~10s bootstrap poll (`MERMAID_WAIT_CAP`), so it needs no hook into `lib/runtime`. Two
  callers must keep the plain tag: the Stage window (a diagram missing mid-talk is worse
  than a slower open) and the Studio's offscreen export capture frame, whose `rAF` and
  `requestIdleCallback` are paused or starved in a backgrounded tab — which is exactly where
  the print export runs. It also does NOT deliver the decoupling its own name promises: the
  warm-up still fires off the deck-scoped `mermaid` PROP, so the signature term and the
  injection switch remain one variable. Making the injection genuinely content-driven means
  dropping the warm-up, which puts the injection outside that 10s poll and needs a runtime
  hook — more blast radius again, for the same ~50ms.

  So the conflation stands, documented, at a measured price of about 50ms of frame-local
  work. Reopen this only with a measurement that separates the two arms by more than the
  instrument's spread — a slower machine, a heavier throttle, or a metric with less of the
  Studio's own boot in it.
