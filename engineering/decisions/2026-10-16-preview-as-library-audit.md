---
status: proposed
summary: >
  Audit of "the preview" as a candidate library. There is no one preview: the Studio shows one
  slide in a React wrapper over a pooled iframe, the Playground shows a scrolling filmstrip in one
  iframe with placeholder slides, the exported player shows sections with no iframe at all, and
  three more grids (overview, add-slide, reshape) share a frame pool. Each rebuilt the same four
  jobs: which units are mounted, what shows for an unmounted one, how to move, and how to stay in
  step with the editor. Most of the generic parts already exist as separate kernels (the Fuoco
  hub, the present-transport maths, the virtual-window arithmetic, the frame pool, the pinch-zoom
  module). Proposes one headless core that treats single, multi and picture-in-picture as three
  window policies over one list of units, a map with four kinds of tile, and a three-tier
  renderer (placeholder, poster, live), with Fuoco as its only source of focus. Lists the
  constraints earlier notes paid for, the other domains that fit, and four forks for the owner.
---

# The preview as a library: audit and proposal (2026-10-16)

**Status: proposed.** Nothing is built. The owner ruled forks 1, 2 and 4 on 2026-10-17 (§9); fork 3 is explained and defaulted there.

## 1. The answer first

The preview should become a library, and the work is mostly **joining pieces that already
exist**, not writing a new engine. It is a *window over a list of units*, where a unit is a
slide today and a page, cell, cue or photo elsewhere. The window decides which units are real,
which are a picture and which are an empty box. Three things you named fall out of that one
idea:

- **Single, multi and picture-in-picture are three window policies**, not three components.
  Single mounts one unit. Multi mounts the units near the viewport. Picture-in-picture is single
  plus a map that mounts its own window.
- **A map is a second window over the same units**, drawn with one of four tile kinds: pills,
  segments, live thumbnails, or posters (cached WebP images of the rendered unit). A map and a
  stage never talk to each other. Both read and write the Fuoco hub.
- **Every unit has a fidelity tier**: placeholder, poster, live. A unit climbs the tiers
  as it nears the focus, which is how a 500-slide deck stays cheap and still paints something
  real everywhere you look.

Fuoco already owns the sync, so the library has **no focus state of its own**. That is the rule
that keeps it small.

What I would not do: build it as a rewrite of `DeckPreview`. The Studio, Playground and player
each own a renderer for good reasons (§4). The library coordinates *which* units are mounted at
*which* tier and *how* you move; a connector per surface still does the drawing.

## 2. What exists today

| Surface | Code | Shows | Mounts how | Map | Move |
|---|---|---|---|---|---|
| Studio editor | `DeckPreview.tsx` (949), `FocusedPreview.tsx` (81), `single-slide-render.ts` (2,498) | one slide | one iframe, patched or restyled in place (no pool) | `SlideRail.tsx` (152): text pills | pills, keys, swipe, wheel, pinch-zoom |
| Playground | `deck-render.js`, `virtual-window.js` (106), `preview-virtual.js` | all slides, scrolling | **one** iframe; unseen slides are `<div data-lv-ph>` placeholders | none; a step dropdown and the Walk bar (`WalkBar.tsx`) in Explore | scroll, keys |
| Present | `PresentOverlay.tsx` (2,435), `PresentRail.tsx` (245), `stage-window.js` (952) | one slide, fit to the screen | stage document; the room's copy is a second window | `PresentRail`: segments grouped by section | keys, swipe, wheel |
| Slide overview | `SlideOverview.tsx` (126) | grid of every slide | `PreviewPool` (a fixed set of frames) | is the map | click a tile |
| Add slide, Reshape | `SlidePicker.tsx` (720), `ReshapePicker.tsx` | component skeletons (add slide); the author's own slide in each look (Reshape) | the same `PreviewPool` | tiles | click |
| Exported player | `lib/export/player-core.mjs` (3,445) | Present, Slides and Article views | **no iframe**; sections in one document | `#lp-toc`; `#lp-nav` | keys, swipe, wheel, `#lp-top`/`#lp-bottom` buttons |

The shared kernels that already exist:

| Job | Kernel | Where | Generic today? |
|---|---|---|---|
| Where is the reader | `FocusHub` | `docs/src/lib/fuoco` | Yes: zero dependencies, the outliner is a plug-in |
| Key, swipe, wheel, fit-scale maths | `present-transport` | `lib/core/present-transport.mjs` | Yes: pure, DOM-free, inlined verbatim into the player |
| When is a key "turn the deck" | `deck-nav.ts` | `docs/src/lib/` | Mostly: the `ARROW_OWNING_ROLES` list is a Studio detail |
| Which units are in view | `visibleRange`, `windowRange` | `virtual-window.js` | Pure, but sits beside HTML placeholder code |
| Many thumbnails, few frames | `PreviewPool` | `preview-pool.tsx` (726) | React and Studio-shaped |
| Pinch and wheel zoom | `preview-zoom.ts` (390) | `docs/src/lib/` | DOM half is generic |

So the audit finding is not "nothing is shared". It is that the shared parts stop at the edges of
four jobs, and each surface wrote the glue between them by hand.

## 3. What is actually missing

**F1. The main stage has no picture map.** The Studio's pills carry a class label or a title
(`SlideRail.tsx`), not a picture. Navigable pictures exist only in the full-screen overview (`g` in
Present) and the add-slide and reshape pickers. Other pooled previews exist (print N-up, chat
figures, the preset picker), but none is a navigator. To find slide 47 by sight you leave the editor.

**F2. Two windowing strategies that cannot share code.** The Playground keeps all slides in *one*
iframe and swaps unseen ones for empty `<div>`s. The grids keep a *pool* of iframes and re-point
them. Both are right (§4) and neither can be the other, so a library has to window the
*decision* and leave the *mounting* to the connector.

**F3. On-screen first/last exists in one place.** Home and End work on every surface
(`PRESENT_KEYMAP`), but the buttons that jump to the top and bottom exist only in the exported
player's Slides view (`#lp-top`, `#lp-bottom`). I found none in `docs/src` or `lib/export` beyond that.
You are right that it is missing from the three you named. It is a command the core should own and
every map and stage can show.

**F4. Not every surface hears the hub.** The Studio is on Fuoco. The Playground keeps its own
slide scanner (`followups.d/2704-p4-playground-scanner.md`). Present follows the hub only in
part (`2704-p2`). The player has its own state. A shared preview inherits whichever of these is
still unfinished.

**F5. The poster tier was measured and shelved.** `2026-09-13-gallery-preview-memory.md` §5 found
that a poster costs **+25 MB for 33 tiles against +600 to +1,300 MB for 33 live frames**, at
about 13 KB of WebP per 1280x720 capture and 148 ms (Chromium) or 284 ms (WebKit) to capture. It
was not built; the note lists the open design work (§5) but does not give a reason. My inference is that the add-slide gallery was the only consumer. A shared map is a second consumer, and
the main one: a 500-slide deck cannot show 500 live frames, and it cannot afford a text pill
either if you want to see the slide.

## 4. Constraints earlier work already paid for

These are the failures the library must not rediscover. Each cites its note.

1. **Never destroy a preview frame on WebKit.** A torn-down iframe document is not given back; five
   create-and-destroy cycles ratcheted 149 → 442 MB, against flat ~200 MB when frames are
   re-pointed (`preview-pool.tsx` header, #1538). So the live tier is a fixed pool, and "unmount"
   means "re-point or hide", never "remove".
2. **A placeholder is a `<div>`, never a `<section>`.** The slide runtime treats every `section` as a
   slide, and placeholder sections cost a 417 ms median frame on a 4x-slowed CPU
   (`virtual-window.js`, `2026-09-28-playground-virtual-filmstrip.md`). The same note measured the
   522-slide deck at **722 frame nodes against 25,494** and first slide at **3.4 s against 8.5 s**
   (1x CPU).
3. **One document or many is a safety choice.** One shared document is cheapest (~60 MB for 69
   tiles), but a local component's `extraCss` would then style every tile. Per-tile documents keep
   isolation (`preview-pool.tsx`). The library must let the connector choose.
4. **A poster capture needs CDATA, and every `url()` inlined as `data:`.** The engine stylesheet holds 147 literal `<`, which kills an
   SVG `foreignObject` (XHTML) but not an HTML `<style>`. Wrap the CSS in CDATA
   (`2026-09-13-gallery-preview-memory.md` §5). The cache key must include component skeleton,
   theme, palette, mode, `@size`, front matter, engine version and `extraCss`; miss one and the map
   lies about the slide. The red-team (§11a) found two gaps in the earlier note: the live sheets
   reference fonts by URL, which an SVG-as-image does not load (a URL face rendered exactly like a
   missing font in Chromium 131; a data-URL face rendered correctly), so the capture must inline
   fonts and images; and the key misses deck-derived output (page numbers, running directives,
   the divider rail), so it must come from the renderer's own slice-cache key.
5. **Untrusted content crosses a sanitizer on both channels** (HARD RULE #22). Placeholders read
   from the *sanitized* open tag; a poster is an inert image, so it is safer than the document it
   replaces, but the capture must read sanitized output and its CSS must pass `sanitizeStyleText`.
6. **One owner per input verb on a surface.** `preview-zoom.ts` owns swipe, wheel and pinch on the
   element it attaches to, because two sets of handlers turned the deck when the user meant to
   zoom (`2026-08-10-preview-pinch-zoom.md`). A picture-in-picture map beside the stage needs its own
   element and its own owner, and no verb may be gated on pointer type (`deck-nav.ts`, #1294).
7. **A fixed element must not move as content grows.** The map and the picture-in-picture inset are
   exactly that. They owe `npm run check:jank` (`engineering/jank.md`) and the z-plane rules in
   `design/forms.md` §5.2.
8. **Reflow is a cost to count.** Each mount in the Playground's frame costs a runtime pass over
   the whole document, so the window mounts three ahead and unmounts five behind to stop churn
   (`deck-render.js`). Any new policy needs the same hysteresis.

## 5. The design model

Axes, with the candidate values and my pick:

| Axis | Values | Pick |
|---|---|---|
| **Units** | before the first render, Fuoco's `Outline`; after it, a **rendered index** (one entry per rendered section, tagged unit, part, page or synthetic) published by the connector | two models, said plainly (§11a.1) |
| **Window policy** | `single` (1), `multi` (viewport ± overscan), `pip` (1 + a map window) | all three, one function: `windowFor(policy, focus, viewport) → ranges` |
| **Stage kind** | `paged` (re-point a frame) or `scrolled` (native scroll) | added by the red-team: it owns the input profile and how `next` is carried out (§11a.4) |
| **Tier of a unit** | `placeholder` → `poster` → `live` | all three; promotion by distance from focus and a budget |
| **Map tile kind** | `pill` (text), `segment` (a bar, Present's rail), `poster`, `live` | all four; `poster` is the default |
| **Map placement** | `rail` (a strip, horizontal or vertical), `grid` (overview), `inset` (picture-in-picture) | all three, as layout only; the core does not draw |
| **Commands** | `next`, `prev`, `first`, `last`, `top`, `bottom`, `go(n)`, `step` | one set; `top` and `bottom` are `first` and `last` on a scrolling stage |
| **Focus** | the Fuoco hub | the only source, no copy |
| **Mounting** | pool of frames, one frame with placeholders, or inline sections | the connector's job |

**The unifying claim, stated so it can fail.** Single, multi and picture-in-picture differ only
in *which ranges are mounted and at what tier*, **times two stage kinds** (paged, scrolled), which
differ in input and in how `next` runs. The first draft said "only"; the red-team showed that was too strong (§11a). If a prototype needs a mode-specific code path
beyond layout, the claim is wrong and the library is three components in a trench coat. This is
the same test the Fuoco demo set for itself in its §12: one set of views, three document types,
no per-domain change.

**Why uniform units are the lever.** A slide is a fixed aspect box, so "which units are in view"
is arithmetic: `visibleRange(y, h, top, pitch, count)` (`virtual-window.js`) is O(1). Variable-height
units (a notebook cell, a chat message) need measured sizes and a prefix-sum index. Doing both in v1
would double the surface. §9 asks.

**Progressive rendering, in order.**

1. First paint: placeholders carrying identity (number, id, title) for the whole list. Cost is
   O(window), not O(n), because the map is itself windowed.
2. Posters fill the windows nearest the focus first, then outward, from the cache; a miss is
   captured when the browser is idle, using Fuoco's `idle` lane for the scheduling model.
3. Live units are the focused one and its neighbors, held in the pool. A live unit that
   settles late (a motion chart, a Mermaid diagram) swaps in over its poster rather than a
   blank.

**What the library does not do.** It does not render a slide, parse Markdown, sanitize, or know
what a theme is. Those stay in `single-slide-render.ts`, `lib/core` and the engine.

## 6. Proposed shape

```
@laticent/<name>            core — zero dependencies, pure, inlinable
  model      units from a Fuoco Outline, ids, pitch/size per unit
  window     windowFor(policy, …) → ranked intent (a priority list); the connector reports back the set it satisfied
  tiers      promote/demote queue with a budget and hysteresis
  commands   next/prev/first/last/top/bottom/go, mapped through present-transport's keymap
  bind       subscribe to the hub with ignoreOrigin; report moves with origin
@laticent/<name>/dom        scroller, roving-tabindex map (listbox semantics), inset layout, zoom owner
@laticent/<name>/react      <Preview mode map /> and usePreview, optional peer
Lattice connector (docs/src/lib/, not published)
  live       PreviewPool (today) + single-slide-render
  filmstrip  deck-render's one-frame virtual list (today)
  poster     foreignObject + CDATA capture, key, store
```

The core is **inlinable** by the same rule as `present-transport`: no module-scope reads, so the
exported player can take its source with `.toString()` later without a rewrite. The player does
not adopt it in v1 (§9, fork 4). Today's player audit
(`2026-10-16-player-as-library-audit.md`) dropped a generic player; this is the *interactive*
viewer, so the two do not collide, but they share the shells idea, and this proposal keeps the
door open rather than walking through it.

**Name.** Siblings use Italian nouns. Working name **Veduta** ("a view, a vista"). Alternatives:
*Anteprima* ("preview", literal), *Pellicola* ("film strip"). The choice is cosmetic and belongs to
the owner.

## 7. Targets (to be measured, not promised)

| Target | Baseline from earlier notes | Check |
|---|---|---|
| DOM nodes in a 522-slide stage | 722 (virtual) vs 25,494 (all mounted) | stay within 10% of 722 |
| First slide, 522 slides, 1x CPU | 3,408 ms (virtual) | no regression |
| Map of 500 slides | none; the overview mounts a pool of 10 frames (`BASE_SLOTS`, capped at 28) | nodes O(window); a fling stays under 50 ms p95 |
| 500 posters resident | ~27 KB each (§11b), ~13 MB encoded; decoded size depends on capture size | tile-size captures; measured 0.2 to 0.5 MB per tile (§11b), so 500 tiles is +86 MB Chromium, +258 MB WebKit; bound the number created, since releasing is unreliable |
| Live frames | pool of a fixed N | N does not grow with the deck |
| Keystroke cost | today every deck-context tile re-renders on every keystroke (`DeckPreview.tsx:543` keys on the whole deck) | per-unit invalidation only where the unit needs no deck context; whole-tail invalidation on a position shift |

HARD RULE #19 applies to any claim of "faster": same-machine `npm run bench` numbers in the PR and
a scenario for the optimized path in `test/benchmark/engine-bench.mjs`. The Playground numbers
come from `docs/scripts/playground-bench.mjs deck`. **Unverified here:** iPhone and iPad memory.
The earlier notes could not reach those devices from this sandbox, and neither can this one
(HARD RULE #23); the first poster PR must drive them or mark them UNVERIFIED.

## 8. Other domains

The test for "does it fit" is two questions: is the content a *sequence of units that render on
their own*, and are the units roughly uniform in size? The first makes it a list; the second makes
it cheap.

**Already inside this repo, same shape:**

- **The three thumbnail grids** (overview, add-slide, reshape) become one map with a tile kind.
- **The player's Slides view, TOC and Present view** are a multi window, a list map and a single window.
- **Present's rail** is the `segment` map kind already built (`PresentRail.tsx`).
- **Live collaboration** (Tavola): `SlideRail` already takes `liveBySlide` and draws presence dots,
  which are decorations on a tile.
- **Reader lenses** (Lente): the hub's `step(…, { view })` already limits movement to a filtered set, which
  is a map filter.
- **Captions and narration** (Cadenza, Suono): the Fuoco demo already treats timed cues as units; the map is a segment bar.
- **Product tours** (Vetrina): steps are units, and picture-in-picture shows the target.

**Outside Lattice, strong fit (uniform units, a render that can be cached):**

- PDF and document page viewers, and e-book readers.
- Photo sets and contact sheets; the collage lightbox already has digit jumps.
- Test-run and trace viewers: a screenshot per step with a filmstrip, which is this layout.
- Storyboards, comics and design-review artboards.
- Slide sorters in any deck tool.

**Fits with more work (variable-size units):**

- Notebook cells, chat transcripts, code files (a text minimap is a `segment` map whose tiles are lines).
- Email and inbox preview panes (picture-in-picture is the reading pane).
- A video editor's filmstrip, where the tier model matches thumbnails at several zoom levels.

**Does not fit:** anything whose units cannot render alone (a spreadsheet's cells), or where the
"map" is spatial rather than sequential (a canvas).

## 9. Forks for the owner, and the 2026-10-17 rulings

I recommended the first option in each.

**Ruled 2026-10-17:** fork 1 = core plus the Studio's picture-in-picture (option a); fork 2 = published like its siblings (option a); fork 4 = name **Veduta**, the player adopts it later. Fork 3 is open: the owner asked what it meant. In plain words: every slide is the same shape, so the library can compute which ones are on screen with arithmetic. Things like chat messages differ in height and have to be measured first. v1 defaults to same-shaped units only (option a) unless the owner says otherwise.

1. **Scope of the first slice.** (a) *Core plus the Studio's picture-in-picture with a poster map*,
   proving the idea where you feel the pain; (b) core plus every surface at once; (c) the poster tier
   alone first, since it pays off in the existing grids. (a) because the Studio is on Fuoco already
   and F1 is its gap; (b) fails the stack-wins rule, and (c) ships a cache with no new surface to
   justify it.
2. **Published or fenced.** (a) A published package like its siblings, with a demo page at
   `/libraries/<name>/`; (b) a fenced module in this repo, as the player audit ruled for the packer.
   (a) fits the family and Fuoco's own §12 claim that a generic core must not be deck-shaped, and a
   fenced module is easy to publish later. Decide before the demo page, not before the code.
3. **Variable-size units in v1.** (a) Uniform only, which covers slides, pages and photos with O(1)
   arithmetic; (b) measured sizes from the start. (a), with the interface leaving room.
4. **Does the exported player adopt it?** (a) Not in v1, but keep the core inlinable; (b) plan the
   player's Slides and Present views onto it now. (a): the player's host-parity work comes first
   (`followups.d/2728-p1-player-host-parity.md`) and the player audit is measured in export bytes.

Also open, smaller: the poster store (memory only, or IndexedDB across sessions). Memory only for
the first slice; the key already carries the engine version, so a later persistent store can reuse it.

## 10. Phases

Each phase ends with something a reviewer can see, and each one that touches the screen carries
`tools/screenshot.js` evidence at ~1440, ~820 and ~390 px (QUALITY BAR). None changes the bytes of
an exported artifact, so the export sign-off gate does not apply. None renders a new *slide*, so
HARD RULE #9's demo deck is not owed; the evidence is the screenshots and the measurements.

- **P0. Measure before building.** Capture posters for the gallery deck on Chromium and WebKit,
  with fonts and images inlined as `data:` and the key taken from the renderer; compare a poster
  map against `SlideOverview` for memory and first paint; and prove the rendered index on
  `focus.md` and `auto-glossary.md`. *Done when:* the table in §7
  has real numbers and the poster tier's cost is confirmed or refuted.
- **P1. Core.** `model`, `window`, `tiers`, `commands`, `bind`. Property tests in the style of
  `fuoco/hub.test.ts`: random focus moves and resizes, with a failing arm for each property (the
  mounted set always contains the focus; the node count is bounded by the window, not the deck; a
  promoted unit is never demoted inside the hysteresis band).
- **P2. Studio picture-in-picture.** A poster map beside the focused preview, next/prev/first/last,
  and the pill carousel as a map kind. Retires nothing yet.
- **P3. Playground.** The filmstrip adopts the window policy; the Playground reads the deck outliner
  through a hub (`2704-p4`), deleting its scanner.
- **P4. Grids.** Overview, add-slide and reshape become one map. This is the phase that deletes code.
- **P5. Player.** The core is inlinable; adopting it is the fork-4 decision.
- **P6. Publish.** README, demo page, catalog entry, brand mark, if fork 2 is (a).

## 11. What could make this wrong

- **Config monster.** If `mode`, `map`, `tier` and `placement` interact in ways the tests have to
  enumerate pairwise, the model is too wide. The §5 claim is the tripwire: a mode-specific branch is
  a failed prototype.
- **Posters lie.** A stale key shows the wrong slide in the map. A relation test like the gallery's MR-5
  ("a recycled tile comes back painted") needs a twin: "a poster equals a fresh capture of the same key".
- **The pool and the filmstrip disagree about what "mounted" means.** The core must say *intent*
  ("this unit should be live") and let the connector satisfy it, or the Playground's one-frame list
  cannot use it. P3 is where this shows up.
- **Input collisions** between the stage's zoom owner and a map's own scrolling (constraint 6).
- **Capture cost on slow devices.** 284 ms on WebKit at 1280x720 is per poster; 500 of them is
  over two minutes of work, so capture must be idle-scheduled, cancelable and ordered by distance from the focus.

## 11a. The 2026-10-17 checks: a fact-check and a red team

Two independent Opus agents checked this note. The fact-check confirmed about 45 claims and found
six wrong or unsupported; those are fixed above. The red team broke the central claim in two places
and narrowed it in three more. I reproduced the two hub defects below on the real Fuoco build.

1. **The outline is not the list the stage windows over (breaks the claim).** `examples/focus.md`
   has 11 authored slides and renders **14** sections; `auto-glossary.md` has 5 and renders 6; pane
   splits and structural splits add pages only known after render. Three index spaces exist today:
   the Playground windows over rendered sections, `SlideRail` lists parts, `SlideOverview` lists
   authored units. A map built from the outline paints the wrong count, then jumps when the render
   lands. *Change:* add a connector-published **rendered index**, keep the outline as the
   provisional list, window over a **viewed projection** (the reader lens) of it.
2. **A poster built to constraint 4 is wrong (breaks the claim).** See constraint 4 above. The
   source note's "faces are data URLs" does not hold for the sheet the live surfaces load.
3. **Pool and filmstrip cannot take one "mount" set (survivable).** `PreviewPool` ranks by its own
   visibility, caps at 28, and throttles to one pass per 220 ms because a re-point during a write
   mints a WebKit realm. The filmstrip mounts through a whole-document pass and has no poster slot;
   a poster there is markup written into the frame after sanitize, which is HARD RULE #22 shape 4
   and needs a `SANCTIONED_RUNTIME_MARKUP_SINKS` entry with its justification. *Change:* intent is
   **ranked and advisory**; the connector reports the satisfied set; the pool gains an API that
   accepts an external ranking.
4. **Input and commands differ by stage kind (survivable, trips the §5 tripwire).** In
   `preview-zoom.ts` a plain wheel is navigation and the surface is `touch-action: none`; on a
   scrolled stage that would kill native scroll. `next` on a scrolled stage is `scrollWalk` (mount,
   smooth scroll, echo guard, reconcile timer). *Change:* the stage-kind axis above.
5. **Fuoco defects a scrolling stage would hit (survivable, reproduced).** (a) `reportUnit` and
   `report` clear a deferred "insert, then go" before deciding the report changes nothing, so a
   no-op scroll report cancels it (focus stays 1, wanted 3). (b) Reports made during a delivery are
   judged against stale focus (map `go(3)` ends at focus 2, origin stage). (c) `reportUnit` has no
   `quiet`, so a scroll-driven stage cannot tell its own scroll from the reader's, which is why the
   Playground keeps a hand-written guard. Logged as `followups.d/2704-p3-fuoco-report-defects.md`;
   each needs a failing arm in `hub.test.ts`. `ignoreOrigin` stops self-echo only, not a ping-pong
   between two scrolling views.
6. **Promotion "by distance from focus" is wrong for a map.** A reader scrolls the map to slide 300
   with focus on 5 and sees placeholders. *Change:* rank each window by its own viewport, focus as one
   seed, with one page-global live budget shared by the stage and every pool (WebKit memory is
   page-global).
7. **Missing constraints.** `hub.pages` has one slot, so only the stage reports pages. A pool
   slot's renderer is fixed at first mount (`specimen`), so a picture-in-picture map of the author's
   own slides must not share slots with specimen grids or the overflow alarms disappear. The
   220 ms re-point throttle belongs in the constraint list. The exported player's CSP is
   `img-src data:`, so a `blob:` poster cannot load there. The player's Article view is a
   variable-height list and falls under fork 3(b).

**Held under attack:** `ignoreOrigin` self-echo, the no-re-entry queue, Studio deck-context
alignment (it fails closed to the right slide with an honest number), and placeholder identity
sanitization.

**Not tried, still open:** author-image capture and the WebKit/iOS foreignObject path (UNVERIFIED),
the structural-split count in a bundled build, per-slide `@size` or mixed aspect against the uniform
pitch, whether stage plus map pool holds still under `check:jank`, and Present's partial hub
adoption (`2704-p2`), where a third writer would join the echo problem.

**Net effect on the proposal.** The idea survives; the first draft's one-line story does not. The
honest statement is: one core, **two index models** (provisional outline, rendered index), **three
window policies times two stage kinds**, ranked intent, and a poster that inlines its resources and
takes its key from the renderer. P0 grows to cover items 1 and 2 before any core code.

## 11b. Phase 0, first results (2026-10-17)

A throwaway spike (not committed; scratch scripts only) captured posters from the real `focus.md`
deck, rendered by the CLI, and compared each to a real element screenshot of the same slide.
Each browser ran 3 slides in 3 variants. Playwright's Chromium 131 and Playwright's Linux WebKit;
**not iOS Safari**.

| Variant | Chromium: mean error, pixels off by >24 | WebKit: mean error, pixels off by >24 |
|---|---|---|
| A. fonts embedded as `data:` | 0, 0% | 0.01 to 0.18, 0 to 0.09% |
| B. fonts by URL, captured as-is (what the live surfaces load) | 4.9 to 10.0, 3.3 to 11.0% | 6.5 to 9.7, 4.6 to 10.8% |
| C. fonts by URL, fetched and inlined at capture | 0, 0% | 0.01 to 0.18, 0 to 0.09% |

- **The red team was right and the fix works.** B is visibly wrong on both engines; C is
  indistinguishable from the real render. Constraint 4 stands as rewritten.
- **Cost of the inline step:** 31 to 45 ms for the fetch-and-encode (browser-cached fonts); the
  draw took 230 to 290 ms on both engines. That matches the earlier note's 148 ms (Chromium) and
  284 ms (WebKit) to within the noise of a different deck.
- **Correction to the earlier note: a poster is about 26 to 28 KB, not 13 KB**, at 1280x720 and
  WebP quality 0.8 on this deck. So 500 posters are about 13 MB encoded, not 6.5 MB.
- **Finding: the SVG was 2.1 MB**, almost all of it the 18 embedded font faces. A real capture
  must carry only the faces the slide uses (the player already has a prune that does this).
  Unmeasured: the time saved by pruning.
- **Decoded memory, measured (500 posters as `<img>` in a scrolling grid, whole process RSS).**
  Each row is a delta over a baseline of 530 to 770 MB; the earlier note put run-to-run noise at
  about 200 MB, so only the large gaps count.

  | Engine | Poster size | Encoded | After mounting and scrolling all 500 | After dropping `src` on 475 |
  |---|---|---|---|---|
  | Chromium 131 | 1280x720 | 14.6 MB | +471 MB | +475 MB |
  | Chromium 131 | 320x180 | 2.7 MB | +86 MB | +89 MB |
  | Linux WebKit | 1280x720 | 14.6 MB | +1,340 MB | +880 MB |
  | Linux WebKit | 320x180 | 2.7 MB | +258 MB | +208 MB |

  **Capture at tile size.** A tile-size poster costs about 5x less than a full-size one on both
  engines, a gap well beyond the noise. At about 0.2 to 0.5 MB per tile it is also 40 to 100 times
  cheaper than the 18 to 40 MB per live frame implied by the earlier note's +600 to +1,300 MB for
  33 frames. **Do not count on `removeAttribute('src')` to hand memory back:** it freed nothing on
  Chromium and some on WebKit within 2.5 s. Removing the `<img>` nodes themselves was not tested.
  So the map must bound how many posters it ever creates, not rely on releasing decoded ones.
  **Not measured:** a 2x (retina) tile at 640x360, which should land near 4x the tile-size cost,
  and any memory-pressure behavior (Linux has no iOS jetsam).
- **A pooled virtual list of posters, measured (the owner's question, 2026-10-17).** The same 500
  posters, shown through a fixed pool of 30 `<img>` elements re-pointed as the window scrolls
  (fixed row pitch, overscan of 2 rows), then scrolled end to end:

  | Engine | Poster size | Unbounded, all mounted | Pooled, 30 elements |
  |---|---|---|---|
  | Chromium 131 | 320x180 | +86 MB | +86 MB |
  | Chromium 131 | 1280x720 | +471 MB | +465 MB |
  | Linux WebKit | 320x180 | +258 MB | +145 MB |
  | Linux WebKit | 1280x720 | +1,340 MB | +392 MB |

  **Pooling bounds DOM nodes, layout and (critically) live frames, but it does not bound decoded
  image memory on Chromium**, which keeps its own decode cache whatever the element count; it helps
  WebKit by 44% to 71%. The levers for posters are therefore poster pixel size and a cap on how many
  are ever created, with the pool as the DOM-side half. Memory also stayed put after scrolling back
  to the top, so nothing here releases promptly. Same limits as above: Linux engines, not iOS.
- **The two lists differ rarely but really.** Across 281 example and baseline decks, the clear
  cases where the outline's slide count differs from the rendered section count are `focus.md`
  (11 authored, 14 rendered), `split-headings.md` (heading splits) and `auto-glossary.md`
  (5 to 6). My separator-count estimator over-counts (a `---` inside a fence), so treat that as a
  floor on certainty, not a rate. It does show the rendered index is needed for correctness, not
  for most decks.

**Still unmeasured:** a 2x tile, node removal as the release path, author images in a capture, iOS
Safari, pruned capture time, and any of the window, tier or hub work (nothing of Veduta itself is built).

## 12. Next step

Ruling on §9, then P0. The decision doc is the deliverable for now; no code changes with it.
