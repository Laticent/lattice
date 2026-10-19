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
4. **A poster capture needs CDATA, every `url()` inlined as `data:`, and must be taken at native size (never scaled inside the SVG; §11c).** The engine stylesheet holds 147 literal `<`, which kills an
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
| 500 posters resident | about 27 to 29 KB each at 1280 (§11b: 14.6 MB per 500), about 14 MB encoded; decoded size depends on capture size | tile-size captures and a pooled list; Chromium self-bounds (a capped, purgeable decode cache, about 0.5 GB here), WebKit holds 2.5x to 3.4x more when every poster is mounted, so cap creation for WebKit (§11b correction) |
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
   Playground keeps a hand-written guard. Logged as the Fuoco report-defects follow-up (fixed);
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
  Each row is a delta over a baseline of 530 to 770 MB. **First-pass numbers; see the red-team correction
  below:** they summed every Chromium process on the machine and ran the arms one after another in one browser.

  | Engine | Poster size | Encoded | After mounting and scrolling all 500 | After dropping `src` on 475 |
  |---|---|---|---|---|
  | Chromium 131 | 1280x720 | 14.6 MB | +471 MB | +475 MB |
  | Chromium 131 | 320x180 | 2.7 MB | +86 MB | +89 MB |
  | Linux WebKit | 1280x720 | 14.6 MB | +1,340 MB | +880 MB |
  | Linux WebKit | 320x180 | 2.7 MB | +258 MB | +208 MB |

  **Capture at tile size.** A tile-size poster costs about 5x less than a full-size one on both
  engines, a gap well beyond the noise. At about 0.2 to 0.5 MB per tile it is also 40 to 100 times
  cheaper than the 18 to 40 MB per live frame implied by the earlier note's +600 to +1,300 MB for
  33 frames. The `removeAttribute('src')` column cannot be credited to the attribute (see the correction).
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

  First reading (superseded by the correction below): pooling looked useless on Chromium and 44% to 71% better on WebKit.
- **Correction from a red-team re-run (process-tree RSS and PSS over only the launched browser, a fresh browser per
  repeat, 3 repeats, plus a simulated critical memory-pressure signal on Chromium).** Repeats agree within about
  5 MB, so the earlier "200 MB noise" caveat was a property of the first method, not the browsers. Memory added,
  500 posters, after scrolling end to end:

  | Arm | Chromium | WebKit |
  |---|---|---|
  | pooled, 1280 | +488 MB | +409 to +418 |
  | all mounted, 1280 | +492 | +1,373 to +1,402 (one run fell to +915 after 10 s idle, untouched) |
  | pooled, 320 | +92 | +160 |
  | all mounted, 320 | **+147** | +263 to +268 |
  | pooled, 1280, **1,500 posters** | +560 | not run |
  | after one critical-pressure signal | back to baseline (-5, -1 and -32 MB) | not available |

  What this corrects: (1) **Chromium keeps decoded posters in a capped, purgeable cache** (about 0.5 GB on this
  machine; tripling the posters added only 72 MB, and one pressure signal drops it to baseline even with all
  500 mounted), so cost is not linear per tile and the "+86 MB for 500 tiles" line is the wrong model. (2) The
  earlier unbounded 320 figure of +86 ran second in a warm browser; a fresh one gives +147, so **pooling does
  help Chromium at 320, by about 37%**. (3) WebKit holds about 2.5x (at 320) to 3.4x (at 1280) more when every
  poster is mounted, and **released about 460 MB by itself within 10 s**, so the earlier "dropping `src`
  freed some on WebKit" is not attributable to the attribute. The lever "cap how many posters are created" holds
  for WebKit; Chromium self-bounds. Tile size and a pooled list remain the right defaults. Linux engines only.
- **The two lists differ rarely but really.** Across 281 example and baseline decks, the clear
  cases where the outline's slide count differs from the rendered section count are `focus.md`
  (11 authored, 14 rendered), `split-headings.md` (heading splits) and `auto-glossary.md`
  (5 to 6). My separator-count estimator over-counts (a `---` inside a fence), so treat that as a
  floor on certainty, not a rate. It does show the rendered index is needed for correctness, not
  for most decks.

**Still unmeasured:** a 2x tile, node removal as the release path, author images in a capture, iOS
Safari, pruned capture time, and any of the window, tier or hub work (nothing of Veduta itself is built).

## 11c. A throwaway prototype of the fidelity ladder (2026-10-17)

The owner asked to prototype the ideas borrowed from games and CGI (proxies, tile pyramids, derived-data
caches, budgeted streaming) and measure them. Scratch scripts only, not committed; Chromium 131 and
Linux WebKit, not iOS. Decks: `focus.md` in two themes (14 slides) and the 120-slide gallery, rendered
by the CLI. Every number below is a median-ish of 4 slides or one run; treat differences under about 2x
as noise.

**1. Capture at native size, then downscale. Never scale inside the SVG.** Against a real element
screenshot of the same slide (mean absolute pixel error, 0 to 255):

| Capture | Chromium | WebKit |
|---|---|---|
| native 1280x720, downscaled on a canvas to 320x180 | 0 | 0.01 to 0.27 |
| scaled to 320x180 inside the SVG (`viewBox`) | 0.75 to 1.8 | **4.2 to 17.7** |

This explains the earlier gotcha about scaled `foreignObject` on WebKit, and it settles the tile pyramid:
one native capture plus canvas downscales is **more correct** than capturing each size, and on Chromium 2 to
3 times faster than three captures. (Correction: the "180 to 200 ms" first quoted here was a 640x360 capture
scaled inside the SVG, the method this finding condemns; a native 1280 capture is 206 to 317 ms. One native
capture plus downscales is still faster than three.) It also retires the first
spike's "derived vs direct" comparison, whose direct side was the scaled, wrong one.

**2. Pruning the stylesheet saves bytes, not yet time.** Pruning font faces to the used families cut the SVG
17% (2,135 to 1,778 KB) with identical pixels. Pruning to the CSS rules the slide matches cut it **58% (to
about 900 KB)**, also pixel-identical, but computing the used rules cost 60 to 165 ms per slide, about what
it saved on average (per slide, Chromium gained time and WebKit lost it). It pays only with an index built once per theme and class set, as the export player's prune
effectively has. Not built.

**3. A poster cannot be captured in the background without jank.** Baking 40 tiles while the page scrolled
(frame gaps measured with a `requestAnimationFrame` probe; `longtask` is not available in WebKit):

| Mode | Chromium frames over 50 ms | WebKit frames over 50 ms |
|---|---|---|
| scroll only (control) | 0 | 0 |
| bake back-to-back | 39 | 53 |
| bake, 16 ms gap | 39 | 66 |
| bake, 100 ms gap | 39 | 75 |
| bake with used-CSS capture, back-to-back / 16 ms gap | 39 / 39 | 44 / 72 |

**Pacing spreads the hitches, it does not remove them.** Each capture is one 150 to 300 ms main-thread task
(decode 60 to 155 ms, rule selection 60 to 165 ms, base64 10 to 20 ms), so no scheduler on the page's own
thread can hide it; only the *number of consecutive* long frames changes. (Two corrections. WebKit does not run
one monolithic task per capture: its slowest frame was 96 to 183 ms, with 69 to 76 frames over 50 ms for 40
captures, where Chromium gave exactly 39. The phase split comes from the used-CSS capture. And a capture inside
a cross-origin iframe may run in another process under site isolation and might not block the page at all; that
arm was not run, so "bake it elsewhere" is a hypothesis until it is.) A budgeted scheduler is still right, but its job is to
bake only while the user is idle, one capture at a time, so a hitch is at worst one frame at the moment an
input arrives.

**4. A wireframe tier is cheap, and only a partial stand-in.** A layout-only SVG from the rendered boxes,
coloured by tokens: **0.8 to 2.5 KB, 0.3 to 2 ms** to generate, against 150 to 300 ms for a poster. Its
likeness to the real slide is moderate (luminance correlation 0.44 to 0.66 on Chromium, 0.30 to 0.52 on
WebKit; mean error 12 to 32), and my flat-gray baseline has zero variance, so the correlation comparison
against it is uninformative. After a theme switch (indaco to cuoio) the recolored wireframe was off by 11
to 20; the stale poster was off by 10 on three slides and 48 on the title slide, so a wireframe beats a
stale poster only where the theme changes the slide a lot. (The WebKit stale-poster rows used the scaled
capture from finding 1 and are not usable.) **Verdict: keep it as the tier for cold start and for
interaction time, when a poster cannot be afforded; do not treat it as a poster replacement.** It still
needs a look-at-it check before it ships.

**5. Content-addressed keys work if position is normalized.** Hashing all 120 slides took 50 ms. One text
edit changed exactly 1 of 120 keys. Inserting a slide at the top of the gallery is the real test:

| Key | Old keys still valid after the insert |
|---|---|
| raw `outerHTML` | **0 of 120** |
| without the slide index, `id` and pagination attributes | 14 of 120 |
| also with the visible page number (`<span class="lat-pagination">`) blanked | 107 of 120 (first pass; see below) |

The first pass said the remaining 13 differed only in `lat-svgt-79-1`-style ids; **that was wrong** (normalizing
those fixed 5; 8 were left). The rest were ids such as `url(#gantt-fill-pass-79-1)` and `#radar-area-85-1`, and
`data-slide="82"` in a notes `<aside>`. Normalizing any `-<n>-<m>` inside an id or reference attribute, plus
`data-slide`, keeps **120 of 120** on the real engine's re-render (checked against `gallery.html` and
`gallery2.html`). Two limits: the playground's own insert demo renumbers exactly what its key ignores, so its
"all valid" is true by construction and proves only the mechanism; and the "one edit changed 1 of 120 keys" test
edited the DOM in place, so it cannot show slides that depend on the rest of the deck (agenda, glossary, totals)
moving. Re-test the edit claim through a real engine re-render. Two consequences: (a) the poster's page number is deck-derived and
must be drawn by the map (which already draws the slide number) or excluded from the capture; (b) a diagram
slide's HTML differed between two page loads because the diagram had not finished drawing, so a key or
capture taken before it settles is unstable.

**6. The playground (an interactive build of the ladder; 4K gallery deck, 120 slides).** Scrolling the map
fast, baker off, so only tile binding is measured (frames over 50 ms, out of about 100):

| Tile kind | Chromium | WebKit |
|---|---|---|
| pills, posters (no wireframe fallback) | 0 | 0 to 1 |
| wireframes measured at bind | 0 | 1 to 4 (p95 46 to 48 ms) |
| live DOM at tile size | 0 | **7 frames in the whole scroll, about 465 ms each** |

**Corrections from the red team (2026-10-17).** The "pills, posters" row scrolled tiles with no baked posters (the
cache had been cleared), so it measured placeholders or wireframes, not posters. With all 120 posters baked, scroll
gave 0 frames over 50 ms in every run on both engines (3 repeats each). Binding a *cold* wireframe at bind time is
the real cost on WebKit: 7 to 15 slow frames across the cache and typing builds (a reviewer measured 13, 15 and 7
against 2, 3 and 3 for the build before them, about half of it the HUD's 400 ms refresh, now 1 s). Moving
wireframe measurement into an idle queue (one at a time, after input has stopped 150 ms) gave 0 slow frames and a
p95 of 17 ms on both engines, with every visible tile filled within 3 s of the scroll stopping. WebKit frame
counts vary more than 2x between sessions, so quote three or more repeats and a range.

Live DOM tiles are unaffordable in a scrolling map on WebKit even with a pooled list of 10, which is the
case for the ladder: the map must not use live tiles outside a small window. Wireframe measurement at bind
time costs WebKit a few frames, so it belongs in the idle queue, not in the bind path. In the same page,
inserting a slide at the top kept **120 of 120** cached posters valid on WebKit and 102 of 102 on Chromium,
against 0 with raw-HTML keys. Baking back-to-back while scrolling gave 31 to 66 frames over 50 ms in 148.

**7. Capture at a normalized size, not the authored size (the owner's `cqi` question).** The engine's font
tokens are `calc(N * var(--_sec-1cqi, 1cqi) …)`, but it writes `--_sec-1cqi` as a pixel constant from the
declared `size:` (38.4 px for a 4K deck), and bakes the section size into an `!important` rule. Forcing only
the section size left 112 px headings at 1280 wide (mean error 14 to 31 against the 4K render). Overriding the
size and the unit together (`--_sec-1cqi: 12.8px`) gave slides that are close at thumbnail size (a reviewer found up to 7.3 mean error and 6% of pixels off on one slide, where a line wraps one word earlier and px borders keep their authored thickness, so the match is not exact). A thumbnail map can therefore
capture at 1280x720 whatever the deck declares; the live stage keeps the authored size. Twelve slides, median
per slide, 4K against 1280x720 (960 and 640 behave like 1280 on time, and 640 is visibly worse on fidelity):

| | Chromium 4K | Chromium 1280 | WebKit 4K | WebKit 1280 |
|---|---|---|---|---|
| poster capture | 281 ms | **228 ms** | 198 ms | **156 ms** |
| wireframe measure, median (max of 12 calls, which includes the first) | 4 ms (29) | 3.4 ms (18) | 9 ms (185) | 6 ms (116) |
| canvas | 31.6 MB | **3.5 MB** | 31.6 MB | **3.5 MB** |
| mean error vs the 4K capture, 320 px poster | 0 | 2.4 (2.1% pixels off) | 0 | 3.9 (3.3% off) |

Capture time falls about 20%, not 9x; I infer the 1.8 MB stylesheet dominates it (not isolated by an experiment), and the canvas is 9x smaller.
**A regression found on the way:** the first version injected a `<style>` into the hidden measurer on every
`measure()` call, and WebKit's scroll degraded from 0 to 2 frames over 50 ms to about 50 (p95 124 ms), while
Chromium did not. Installing one persistent, `#measurer`-scoped rule fixed it (WebKit 0 to 2 frames at either
size). **Rule for the build: never add or remove a stylesheet on a hot path.** The override reaches into
engine internals (a private variable and an `!important` rule); the clean form is the engine's own size
geometry rendering at a requested size. Six slides were compared by eye and by pixel; line wraps at smaller
sizes were not audited.

**8. Typing and the cache (the owner's question; playground with a real Title field, an auto-typer and a
configurable cache).** Typing 44 characters, 90 ms apart, into the focused slide's title, with the full
incremental path (new key, one tile rebind, stage re-point): 1.1 ms per keystroke on Chromium and 2 to 3 ms on
WebKit, excluding the engine's own re-render. Baker and cache policy:

| Policy, baker | Captures while typing | Cache entries before to after | Frames over 50 ms (Chromium / WebKit) |
|---|---|---|---|
| supersede, idle gate (600 ms) | **0** (one capture after the pause) | 8 to 8 | 1 / 3 |
| supersede, back-to-back | 43 / 38 | **8 to 8** (44 / 39 superseded) | 45 / 47 |
| LRU only, back-to-back | 43 / 41 | 8 to 52 / 49 | 44 / 46 |
| unbounded, back-to-back | 43 / 41 | 8 to 52 / 50 | 44 / 55 |

A reviewer's re-run reproduced the capture and entry counts on both engines and the Chromium frame counts within 1, but counted more slow frames on WebKit (6, 94, 65 and 80 in the four rows above, against 3, 47, 46 and 55 here): the direction holds, and WebKit frame counts vary about 2x between runs.

Under the byte-budgeted LRU (0.25 MB, 50 entries) a full "bake every slide" held 13 entries and 0.24 MB, and every tile in the map's window still had its poster, because the window is pinned. **That first result hid a defect:** 124 to 260 captures for 120 slides was an endless re-bake loop, because the baker re-queued whatever the LRU had just evicted (a reviewer saw 69, 128, 187 and 245 captures at 15, 30, 45 and 60 s). Fixed with a 30 s cooldown after an eviction: a full bake is now exactly 120 captures and stops (Chromium 71, 120, 120 at 15, 30, 45 s; WebKit 93, 120, 120), holding 13 to 14 entries. The rule for the build: the baker's target set must fit the budget, or evicted keys need a cooldown. The edited
tile showed its old poster (a dot marks it) until the new one landed, then the dot cleared.

**Three more defects the review found, now fixed.** A failed capture was recorded against the slide's id, which superseded the last good poster and then was never retried; now a failure is recorded against the key only, leaves the old poster showing (verified with every capture forced to fail: the tile kept its old poster with the dot, nothing was superseded, and it was replaced once captures worked again), and is retried after 5 s. A stale poster was not pinned, so LRU could evict and revoke a blob still on screen; the latest baked key of every slide in a window is now pinned. And the key normalization was widened as described in item 5.

**A flaw the test caught in my first supersede design:** it linked each new key to the previous one, but with
back-to-back baking a capture can finish after the owner has moved on, so its entry was never replaced and the
cache grew to 50 anyway. The working rule is simpler: keep the **latest baked key per stable slide id**, show it
while the current key bakes, and drop the earlier one when a newer one lands, unless another slide still uses it.
Policy, byte budget, entry limit, stale display and the idle gate are all options in the page.

**Review status (2026-10-17).** Two independent agents reviewed §11b and §11c and the styles brief: a fact-check
(about 45 claims confirmed, 4 refuted, about 9 unverifiable from saved output, key experiments reproduced on both
engines) and a red team of the measurement methods (3 claims invalidated or reversed, 5 weakened, 6 playground
defects, several attacks that held). Every correction above and every fix in the playground came from them. What
survived: the capture recipe, native-size capture, the main-thread cost of a capture (39 slow frames per 40
captures on Chromium; more, but not one task per capture, on WebKit), position-free content keys (now 120 of 120 on
the real engine), the 1280 capture at thumbnail size, and the supersede and idle-gate rules.

**What this changes in the design**

1. Capture at the slide's native size and build the pyramid by canvas downscale. (Constraint 4 now says so.)
2. The poster excludes position chrome, or its key blanks it; the map draws the number.
3. The baker is single-flight and gated on user idleness; "no jank" is not claimed, only "at most one
   hitch at input onset", and it must be measured in the first real build.
4. The wireframe is the interaction-time tier, behind a visual check. The ladder reads placeholder,
   wireframe, poster, live.
5. Static content (the component gallery) and exports are baked off the user's machine (CI, export), because
   foreground baking costs a hitch per tile.
6. The used-rule CSS index is a candidate optimization, not a given.

**Not measured:** iOS Safari; capture time for the wireframe-to-poster crossfade; author images; decoded
memory of the pyramid sizes beyond §11b; a bundled build; any of Veduta itself.

## 11d. Design-verification spikes (2026-10-17)

The owner ruled that "medium-high" confidence in the design is not enough to build on, so the parts the design rests
on were tested against the real code, one spike each, in scratch space (nothing in the repo was edited).

**1. The rendered index can be derived for every real deck.** (Checker: totality, monotonicity and round trip mostly hold by construction, since the per-part counts add up to the whole render; the checks that can fail are that sum and the fingerprint (h1 and h2 text plus `data-focus`), which is empty for 46 of 2,604 sections. The copy coordinate is exercised by 3 sections in one deck. The 115 ms is a Node measurement.) Over all 281 decks (280 examples plus the gallery),
rendering through the Studio path (`appendAutoGlossary`, `render`, `splitForPreview`) and reading the outline:

| Section class | Sections | What marks it in the HTML |
|---|---|---|
| authored unit, first part | 2,591 | `data-lattice-slide="N"`, present only after `splitForPreview` |
| heading-split part (part > 0) | 6 | nothing |
| focus-step clone | 3 (all `focus.md`) | `data-focus`, which an authored slide can also carry |
| structural-split page (page > 1) | 521, in 35 decks | `data-lattice-slide="N.k"`, `data-split-run` |
| appended auto-glossary | 4, in 3 decks | nothing |
| unexplained | **0** | |

Rule: take units and parts from the deck outline, count the sections the engine renders for each part on its own,
and walk the rendered sections in order. The address is **{unit, part, copy, page}**: a *copy* coordinate is needed
because focus clones and pane splits are distinct sections of one part. Proven on all 281 decks at the deck's own
size and at 1280x720: total, strictly monotonic, round trip is the identity, every outline part resolves, 0 failures.
Failing arms go red (ignoring copies reddens `focus.md`; dropping the page suffix reddens 35 decks). **Three
consequences.** (a) The index must be built from the same `splitForPreview(width, height)` the frame displays: at
1280x720 the 35 portrait, square and story decks lose all 521 split pages (3,125 sections become 2,604), so an index
built at the authored size over a 1280-wide map would be wrong; unit, part and copy addresses are the same at both
sizes. (b) The rule works by re-rendering each part, which costs 115 ms extra on the gallery (a cheaper predict rule,
13 ms, fails on pane splits). (c) Two defects exist that no real deck triggers: an empty slide (the outliner drops empty
chunks, the engine renders them) and pane splits under the cheap rule. The robust fix is small and belongs in the
engine: stamp each section with `data-lattice-src` (source line), `data-lattice-copy` and
`data-lattice-synthetic`, making the index a lookup with no re-render and no positional counting. **This also
corrects an earlier number:** `count.mjs` never ran the structural split (unbundled, its capacity map is null), so the
"sections versus authored slides" counts understated the mismatch; 35 decks split into 521 extra pages.

**2. The core's invariants hold, and it drives both existing implementations with a small change each.** (Checker's
corrections: the nine properties first ran against a spike whose `settle` still learned a shortfall as the capacity,
which one empty report could turn into a permanent cap of 0; the committed `docs/src/lib/veduta/core.ts` enforces the
reported-capacity and stage-floor rules and has properties for both. "Multi equals `virtual-window.js`" is weaker than
it reads: the cold comparison nearly restates the same arithmetic, and the step-by-step replay is faithful to
`syncVirtual`'s cached path and `applyWindow` only, not to `mountAround`, its 1500 ms pin, the uncached path or fling
timing. The 976-of-2,000 hole figure is a property of a synthetic walk in which 20% of frames jump, not a usage rate.) A headless
core in plain JavaScript (`windowFor({ policy, stage, count, focus, viewports, overscan, budget, hysteresis,
previous })` returning ranked intent, and `settle(intent, satisfied)`), inlinable with `.toString()`. Nine properties,
300 runs and 1,000 runs on each of three seeds, every failing arm red: focus always in the stage set; mounted count
bounded by viewport and overscan alone for N from 10 to 100,000; **multi equals the real `visibleRange` +
`windowRange` from `virtual-window.js`** (imported, compared on random inputs and step by step against a replay of
`syncVirtual`); single is exactly one unit; pip's stage set equals single's even while the map scrolls; jitter below
the band changes nothing; ranking is monotone in distance from each window's own viewport; the live total never
exceeds the page-global budget; and a connector that satisfies only part of the intent reaches a fixed point without
being asked for more. Cost per call is **0.6 µs (single), 15 to 16 µs (multi with a map) and 13 to 14 µs (pip),
identical at N = 120 and N = 100,000**.
Fit: `PreviewPool` accepts the intent with a `rank` prop and an `onSettle` report, ordering tiles within its existing
on-screen and in-band tiers and still going through its 220 ms throttle, so the WebKit never-destroy rule is
untouched (typechecked only). The Playground filmstrip takes it through two new exports (`stageViewport`,
`applyUnits`) and a predicate form of `applyWindow` (jsdom smoke test only), and the focus seed replaces the 1500 ms
landing pin as long as the focus is a rendered-section index, which is spike 1. **Three design invariants were wrong
or missing, and are now rules:** (i) the live budget cannot be "units live now", because the pool never releases a
slot, so its cost is a high-water mark of retained documents (the pool reports `retained`), a tile over budget must
render as a poster before the pool sees it, and the budget needs a cost per connector (a filmstrip section is not a
WebKit realm); (ii) capacity must be *reported*, never inferred, because a pool also falls short for tiles outside its
150 px observer band and learning that as the cap starves visible tiles; (iii) a connector must hold at least one stage
unit. **A defect in today's `deck-render.js`** (not caused by this work): with its 1/3/5 constants a window move can
leave a one-slide hole of placeholders between mounted slides (settle at slide 20, land at 12: slides 9 to 15 and 17
mounted, 16 not); 976 of 2,000 random walks hit one, and `contiguous` then stays false so every scroll frame falls off
its fast path until the hole fills. The core always keeps one contiguous run. Also, `applyWindow` loops over every
section, so each move is O(N) in the DOM. Neither has an issue yet.

**3. Capture can leave the main thread on Chromium, not on WebKit.** The same poster capture (native 1280 wide, 24
captures while the page scrolled), run in the page itself versus in an iframe that holds the stylesheet once and
receives one slide's HTML by `postMessage`:

| Where the capture runs | Chromium: frames over 50 ms, p95 | WebKit: frames over 50 ms, p95 |
|---|---|---|
| no capture (control) | 0, 17 ms | 0, 17 ms |
| the page itself | 23, 233 to 250 ms | 39 to 40, 132 to 191 ms |
| same-origin iframe | 25, 217 ms | 39 to 41, 127 to 136 ms |
| sandboxed iframe (opaque origin) | **0**, 17 ms | 37 to 41, 140 to 145 ms |
| cross-site iframe (`127.0.0.1` against `localhost`) | **0**, 17 ms | 41 to 44, 102 to 125 ms |

Per-capture time on Chromium was 10 to 15% longer in the frames (282 to 303 ms sandboxed, 260 to 265 cross-site, against
249 to 260 ms in the page; a checker's three repeats and a 60-capture scroll agreed), and about the same on WebKit (150
to 200 ms). A browser-level target count shows why the jank disappears: the sandboxed and the cross-site frame are each
an out-of-process frame, the same-origin frame is not (the spike's own page-level probe wrongly read 0 for all of
them). So on Chromium a sandboxed or cross-site capture frame removes the jank entirely for a 10 to 15% throughput
cost; this depends on the browser giving the frame its own process, which Chromium can decline under process limits or
memory pressure (untested; one Chromium build, 131); on WebKit it raises the frames the
page gets in the same time about 1.75x (112 to 126 against 56 in the short run) but each capture still costs one 100 to
250 ms hitch, with 42 to 47 frames over 50 ms per 24 captures in the frames against 39 to 40 in the page (wider than the
37 to 44 first quoted), and in a 60-capture scroll as many as the page itself. Design
consequence: capture runs in a sandboxed frame by default (it also holds untrusted markup in an opaque origin, the
safer posture under HARD RULE #22), and the WebKit hitch is still handled by the idle-gated, single-flight baker.
Tauri on macOS is WebKit, so the desktop app should prefer a native snapshot there (unverified).

**4. Fuoco works with a scrolling stage once three defects are fixed.** In a model-based test (an editor, a map
issuing `go` and `step`, a paged stage, and a scrolled stage that reports every slide a smooth scroll crosses, a
settle report and a late scroll-anchoring report), all four problems reproduced on the repo's hub: (a) a no-op report
cancelled a pending "insert, then go" (focus 0, wanted 1; with the editor subscribed last a double key press published
4 times); (b) a report made during a delivery was judged against stale focus (`key last` ended at 5, wanted 6); (c) a
stage that could not centre the last slide pulled the focus back (one key press made 3 publications); and two
scrolled views that break a boundary tie differently pushed the focus back and forth forever. The fix is 272 lines
(+130, -65, mostly moving two bodies into inner functions; `git apply --check` passes) and chooses four rules: a
report clears the pending move only when it publishes; `report` and `reportUnit` go through `guarded()`, which now
brackets only the subscriber loop, so each queued call is judged against the focus the earlier ones left; each report
records the focus sequence it was made against and the hub drops it if a different origin has published since (the
same idea as `rev` for text); and `quiet` on `reportUnit` never publishes and never cancels a pending move. That last
rule makes a separate loop guard unnecessary. With it, the repo's `hub.test.ts` model passes at 5,000 runs, the new
properties pass, every failing arm goes red with a shrunk counterexample (`clearOnAnyReport`, `eagerReports`,
`loudQuiet`, `ignoreBasis`), and five "next" presses with a scrolled stage and a map publish exactly once each (the
unfixed hub gave `3[keys,stage,stage]` on the fifth, a 5 to 4 to 5 flicker). **The fix holds only if every view marks its own programmatic scrolls quiet:** a checker added a second scrolled view that does not, and focus agreement failed on a scroll followed by a key press (focus 2, wanted 3), so any loud programmatic scroll breaks agreement, not only a late reflow report. The fix is applied on this branch
(`docs/src/lib/fuoco/hub.ts`, `scroll.test.ts`). Further limits the spike found: browsers do not say why a scroll
happened, so a stage must infer its own scrolls from input events (a loud reflow report sent before a frame-lane stage
catches up would still pull the focus back; a compare-and-set "I was reacting to focus X" field would close it and was
not built); `reportUnit` always publishes cause `caret`; views must select the unit id, not only the index (an edit and
a deferred go in one frame can swap which unit sits at an index, and ids follow separators, so after an insert an old id
can land on the new slide); a view does not hear its own `step`, so it reads `hub.get()` back; and `step`, `pages`,
`pick` and `update` are still judged immediately. Modeled, not observed in a browser.

**The design as it now stands.** (1) Two index models: the outline before the first render, and a rendered index
{unit, part, copy, page} after it, built from the same `splitForPreview(width, height)` the frame shows, with the
engine stamping `data-lattice-src`, `data-lattice-copy` and `data-lattice-synthetic` so the index is a lookup. (2) A
headless core, three window policies times two stage kinds, ranked advisory intent and a *reported* (never inferred)
capacity, a page-global live budget with a cost per connector decided before the pool, and at least one stage unit per
connector. (3) Fuoco is the only focus, with the four-rule fix above and views that select unit ids. (4) Capture runs in
a sandboxed frame at the slide's native size under a 1280 override, one at a time, gated on user idleness, with
position-free keys, supersede-then-LRU with pinned windows, stale-while-revalidate, and wireframes measured off the bind
path. (5) Connectors change a little (`rank` and `onSettle` on the pool; `stageViewport` and `applyUnits` on the
filmstrip), and a poster in the filmstrip needs a `SANCTIONED_RUNTIME_MARKUP_SINKS` entry. **Open:** real browsers for the
Fuoco model, the pool and filmstrip diffs, iOS, and the unreviewed spike results themselves.


## 11e. Inversion: what would make this fail (2026-10-17)

A Munger inversion of the design and the on-demand styles brief (an independent agent; nothing edited) concluded
**proceed with changes**. The core and the Studio map are worth building; what fails under inversion is the *order*
of work and two of the owner's 2026-10-17 rulings (fork 1's poster map, fork 2's publish). Findings, with the facts I
re-checked marked **verified**:

1. **The expensive part is the poster subsystem, not the library.** The core is 0.6 to 16 µs and nine properties
   pass; what is unbuilt is about twenty Lattice-specific mechanisms (Fuoco fix, engine stamping, pool `rank`, sandboxed
   capture frame, CDATA and font inlining, a private-variable override, a key normalizer, supersede-then-LRU, cooldowns,
   an idle gate, a #22 sanction), each failing silently. The prototype showed the decay: four silent defects in a day.
2. **The poster tier pays only past the pool cap.** **Verified:** across the 281 example and baseline decks the median
   is 8 slides, the 90th percentile is 10, and only 3 decks exceed 28 (`gallery-jargon.md` 58, `gallery.md` 120,
   `system-design-foundations.md` 232). **Caveat the inversion did not state:** this is the *example* corpus, a set of
   feature demos, not real boardroom decks, which are plausibly 20 to 60 slides; the right number is the owner's own
   deck sizes, which this sandbox cannot see.
3. **Posters cost most on the future runtime.** Tauri on macOS is WebKit, where capture is still a 100 to 250 ms hitch
   per poster; iOS and macOS WebKit are unmeasured. (Partial counter-evidence: the owner ran the playground, posters
   included, on a phone with 1,200 slides and reported it responsive with no crash or jank.)
4. **The foundation keeps deepening** (preview, posters, capture cost, stylesheet size, a CSS delivery rewrite), and
   the brief rests on an inference the note marks untested ("the 1.8 MB stylesheet dominates"), while measured results
   point the other way (rule pruning slowed WebKit capture; the 1280 override cut capture time only about 20%).
5. **"Uniform 16:9" is false across decks.** **Verified:** 36 of 281 decks are not 1280x720 or 4K 16:9 (21 at 1080x1350,
   12 at 1080x1920, and four more sizes), and at 1280x720 the 35 portrait, square and story decks lose all 521 split
   pages, so a map capture size must follow the deck's aspect ratio, not be fixed.
6. **Unpriced costs.** Engine stamping puts new attributes (source lines) into exported HTML, which would change export
   bytes, trigger the owner's sign-off gate, and contradicts §10's "does not change the bytes of an exported artifact"
   (the spike already shows the safer place: `splitForPreview` writes `data-lattice-slide` today and never reaches an
   export). A sandboxed capture frame is one more document that WebKit never frees and that counts against the live
   budget, and it owes a #22 justification. The poster key is defined two ways (constraint 4 says the renderer's own
   slice-cache key; §11c.5 normalizes `outerHTML` with a regex), and the regex is a standing invariant any new
   component that mints position-based ids can break silently. IndexedDB persistence adds versioning across engine
   releases. P2 needs the Fuoco fix, stamping, the pool API and capture together, which is the stacked-PR trap
   (HARD RULE #17). **Verified:** `@laticent/fuoco` is not on npm (404) and is `AGPL-3.0-only`, so a published package
   buys a demo page and API-freeze pressure but no users yet.
7. **A simpler design the note never compared against:** a Studio picture-in-picture whose map is the existing
   one-frame filmstrip (scaled) or the existing `PreviewPool` for decks of 28 slides or fewer, with pills and the
   cheap wireframe tier past that, first and last as plain commands, and the windowing core as a fenced module. It
   loses far-off pictures in big decks, cross-session caching and the claim of generality; it avoids capture, keys,
   the cache, the capture frame, stamping, the font and CDATA recipe, and the styles loader.
8. **Cheap falsifiers (under a day each):** put the existing pool overview beside the stage and look at it on a
   230-slide deck; open the playground in Safari on a Mac and on an iPhone (do captures decode, does the page survive
   baking); stamp at `splitForPreview` instead of the engine; capture one slide with the full sheet against a hand-cut
   100 KB sheet, three repeats, on both engines; apply the Fuoco fix and run five presses in a real browser.

**The three decisions it asks the owner to make or reverse now:** (1) ship the Studio map on live, wireframe and pill
tiles first and add posters later, as a tile kind, once the falsifiers show decks over the pool cap hurt; (2) fence the
core first and publish only after the Playground adopts it with no core change (the note's own tripwire, P3); (3)
decouple the styles brief from the poster tier, run only its baseline and the sheet-size test, and stamp at
`splitForPreview`. Posters are a tile kind in the design, so adding them later is an addition, not a rework.

## 11f. The owner's rulings after the inversion (2026-10-17)

These replace the matching 2026-10-17 rulings in section 9 and the phase order in section 10.

1. **Posters last.** The first Studio map ships on live, wireframe and pill tiles (and segments). Posters return as one
   more tile kind after the falsifiers in section 11e show decks over the pool cap hurt, so the foundation does not
   change when they arrive.
2. **Publish later, but build it as a complete library now.** `@laticent/veduta` gets everything a sibling has before it
   is published: a name, a mark, a README, a catalog entry, a live demo page and a guide page on the docs site, a build
   script and a boundary gate. The npm publish itself waits until the Playground has adopted the core with no change to
   it (the section 11 tripwire).
3. **The on-demand styles brief is decoupled from Veduta.** Run only its baseline (E0) and the stylesheet-size
   isolation test first; do not start the byte-identical split (E1) on an untested inference. Stamping source lines
   happens in `splitForPreview`, which never reaches an export, not in the engine, so no phase changes exported bytes
   and the export sign-off gate does not apply.

**Order of work (by what each unblocks):** the core with its property tests; the Fuoco fix
(the Fuoco report-defects follow-up (fixed)); the rendered index and stamping at `splitForPreview`; the library's
trappings (mark, catalog, docs, demo, guide, build, gate); then the Studio picture-in-picture on live, wireframe and
pill tiles; posters last.

## 11g. Built on 2026-10-19: the rendered index (P2)

`docs/src/lib/rendered-index.ts` is the rendered index §11d.1 proved on paper. The engine is not changed and
nothing reaches an export. Three findings changed the design:

1. **The slide number is not the part.** `data-lattice-slide` numbers the engine's sections after it has cloned
   slides, so a `_focusSteps` slide (`examples/focus.md`: 11 authored, 14 rendered) and a pane slide at a tall size
   (`examples/panes.md`, 35 portrait and square decks in all) shift every later number. Reading `N - 1` as the part
   was wrong for those decks, and a first version that did so left pages unexplained in 9 decks. The stamp is kept as
   the engine slide (`slide`) and the structural split's run (`run`, the `.k`); the **clone** is a third coordinate,
   `copy`, and the part comes from counting.
2. **Counting is the lookup, and it is rare.** `buildRenderedIndex(stamps, deck, perPart?)` joins stamps to the outline.
   When the engine's slide count equals the outline's part count (almost every deck) the stamps are the whole answer.
   Only when they differ does `renderedIndexOf` ask the engine how many slides each part makes on its own
   (`sectionsPerPart`: one render per part under the deck's front matter, memoized by part text, so an edit re-renders
   one part). §11d.1 priced this at 115 ms on the gallery, once.
3. **The bridge computes it lazily.** `RenderResult.index()` in `playground-engine.ts` returns one memoized promise
   and does no work, not even the outline parse, until a map asks, so a Playground with no map pays nothing per keystroke. The stamps come from the
   one `splitForPreview` call the frame shows.

4. **Two things the engine does that the outline does not.** The auto-glossary appends pages after the last part
   (`autoGlossarySections`), so they are marked `synthetic` and each part is counted with the glossary trigger removed
   (a part rendered alone would grow its own glossary page). An empty slide is rendered by the engine and dropped by
   the outliner; the index reports the surplus page as unexplained instead of shifting later pages onto the wrong
   part. Fixing the dropped slide at the source is the empty-slide defect in the next handoff (P7). Both came from an
   independent checker, not from the first test run.

**Evidence.** `rendered-index.test.ts` renders all 292 example and baseline decks through the Playground's path
(auto-glossary appended) at their own size, at portrait and at square (876 renders), and requires zero unexplained pages and zero unexplained parts at each, with the clone and
split paths exercised. Its failing arm reads the same decks without the clone counts and must flag `focus.md` and
`panes.md`. `playground-engine.index.test.ts` pins the laziness and the single split.

## 11h. Built on 2026-10-19: the Playground map rail (P1)

The first connector for Veduta's second window. Turn it on with **Map** in the Playground toolbar (remembered per
browser, off by default). Beside the preview on a wide window and under it where the panes stack (the 820 px split
breakpoint), it shows one tile per **part** (the rendered slides the PDF numbers) with first, previous, next and last.

- **Veduta.** `MapRail` asks `windowFor({ policy: 'pip', viewports: { map } })` each time the rail scrolls, resizes or
  the focus moves, and mounts exactly the intent: the tiles in and just around its own view, the nearest `liveBudget`
  (8) at `live` and the rest at `wireframe`. Every other tile is an offset in a spacer. It reports what it mounted with
  `settle`, and a host with no pictures reports a live capacity of zero.
- **Tiles.** Wireframe tiles are sketched from the slide's source (`wireframe.ts`, microseconds, no render). Live tiles
  are the Studio's pooled preview frames (`studio/preview-pool.tsx`), so the Playground grows no second thumbnail
  renderer and a WebKit frame is re-pointed, never destroyed.
- **Fuoco.** `PlaygroundMap` owns one hub (`deckOutliner`). The preview *reports*: the walk's page in Explore, and in
  Edit the page with most of the view (the walk's own rule, with its hysteresis). The rail *asks*: `hub.go` and
  `hub.step`. Each names its origin, so a pick scrolls the preview and the preview's report never echoes back. Edit also
  holds the preview's reports until the pick's scroll has been still for 160 ms, so the scroll's slides on the way do
  not overrule it. The rendered index (section 11g) turns a page into its part and a part into its first page, so a
  portrait slide cut into pages, or a focus-step slide cloned into several, is still one tile.
- **Cost when off: none.** The map is a lazy chunk (`React.lazy`); `.pg-preview-row` is `display: contents` until the
  map is on, so the preview's layout is byte-for-byte what it was.
- **Left for the Studio.** The rail takes a count, a focus and callbacks only; the Studio will feed it from its own hub.

## 11i. Closed on 2026-10-19: the WebKit "placeholder under the middle" (P4)

The 2782 follow-up said a jump to 25% of the 15-slide `kpi` deck on WebKit at the tablet box left a placeholder under the
middle of the view 600 ms later. **The probe was wrong, and the filmstrip is right.** On real WebKit 26 (Playwright build
2215) at 1180x703, the frame's vertical middle (y = 248) at 25% falls in the 29 px gap between slide 4 (bottom 242) and
slide 5 (top 271), and `elementFromPoint` there answers with the `ARTICLE.lattice` container. Both slides in view are
real sections; the same holds at 75% (slides 11 and 12). The old probe read "not a section" as "a placeholder".

Re-measured with the right oracle (every slide touching the viewport, not the element at one point): 15 jumps (five
fractions x three repeats) at the tablet box and 15 at the phone box on WebKit, with the map off and with it on, show
**0 placeholders in view in all 60**. `playground-filmstrip-jump.spec.ts` pins that oracle on desktop, mobile and
`webkit-tablet`, with a failing arm that plants a placeholder in view and must see it. `syncVirtual` is unchanged.

## 11j. Built on 2026-10-19: the Studio picture-in-picture (P3)

The Studio's focused preview now has the same map rail (`studio/StudioMap.tsx` over `map-rail/MapRail.tsx`), turned on
by the map button at the end of the slide navigator bar (remembered, off by default). It sits beside the slide on a pane
at least 560 px wide and under it otherwise, measured on a wrapper the rail does not resize.

- **One hub, no second focus.** The Studio's Fuoco hub already holds the focused part and every view reports to it, so the
  rail only reads it (`useFocus`) and picks through `onRailPick`, the call a pill makes (it expands a collapsed preview and
  moves the hub). First, previous, next and last resolve to a part in the view and take the same call.
- **The viewed set.** A reader lens reshapes the deck, so the rail's units are the parts of `viewChunks`, numbered within
  the view as the counter and the pills are. A focus the lens hides sits on the nearest earlier shown part
  (`StudioMap.test.tsx`).
- **Live tiles** are the Studio's pooled frames, given the main preview's look (palette, mode, finish CSS) and the viewed
  deck as context, with the part alone as the fallback when the engine's slide count differs (`_focusSteps`).
- **Allowed web images.** Tiles get the shell's `deckOptions` (which carry `webOrigins`), so an image the reader has allowed in the
  main preview loads in a tile too.
- **Cost.** A lazy chunk; the Studio's eager bundle grows 0.7 KB gz (498.9 to 499.6), inside the 2 KB per-PR allowance. The map
  stays mounted once opened and is only hidden (`ui/keep-mounted.tsx`), so toggling it re-uses its pool frames; a test counts the
  documents created across three close/open cycles and requires none.
- **What this does and does not prove about Veduta.** The rail takes its windowing from Veduta (the band, the map's own
  viewport ranking, the live/wireframe tiers) and reports the held run through `settle`. It does **not** report a pool capacity:
  today `settle` reads only `cap`, the pool sizes its own slots (10, up to 28) and the rail keeps its live budget under that ceiling
  (the tiles on screen, at most 24) instead of learning it. The Studio's stage is not driven by Veduta, and the page-global live
  budget priced per connector has one connector. So the 11f.2 tripwire ("the Playground adopts the core with no change to it")
  is met for the band arithmetic and the map window only; the capacity report, the joint stage-and-map budget and the poster tier
  have no production caller. Publishing to npm should wait for those (`followups.d/*-p2-veduta-pool-capacity-and-stage.md`).
- **Found by the trio and fixed before merge.** A scrollbar loop (React #185 wherever scrollbars take layout space; the scroller
  now always carries its track and the measuring effect no longer re-runs with `refresh`), arrow keys that handed focus to the
  editor after one step (a key now picks quietly), a hidden focus before every lens-shown slide (no tile is highlighted and Next
  goes to the first), stale or out-of-range tile pictures while typing (a tile keeps its sketch until its slide settles), a rail
  left over in phone-landscape cinema mode, a `mapStacked` observer left on a detached node after a breakpoint crossing, and a
  fixed live budget of 8 that left tiles on a large screen as sketches.

## 11k. Closed or filed on 2026-10-19: the two defects the audit found and never recorded (P7)

**The filmstrip window hole is fixed.** `syncVirtual` unmounts what is more than five slides from the view and mounts three
either side, so a jump could leave an old slide inside the new keep range with a never-mounted slide between it and the new
run: from slides 0..7 mounted, a jump to slide 12 left `[7, 9..17]`, a placeholder at 8. Nothing showed on screen, but
`contiguous` stayed false and every later scroll frame left the cached fast path until the hole filled. The reproduction is
`deck-render.hole.test.ts` (a deterministic case and a seeded 4,000-step walk with 20% jump frames; both red before the fix).
`applyWindow` now keeps a slide inside the keep range only while mounted slides connect it to the run just mounted
(`joined`); `mountAround`'s landing pin is its own island and is kept whole, and `mountAround` itself is unchanged. Measured on
2,000 seeded walks of 60 steps with 20% jumps: 559 walks (674 of 120,000 frames) hit a hole before and 0 after. The 976-of-2,000 in
section 11d.2 used longer walks. `deck-render.window.test.ts` still pins the arithmetic, and all 398 `src/playground` tests pass.

**The empty-slide defect is reproduced; the map no longer suffers it, and the outline half is filed.** The outliner drops an
empty chunk and the engine renders it. A checker pointed out that the map is the surface this PR adds, so the index now finds the
blank page from its markup (`blanksOf`), gives it no part, and keeps every other page on its own (tested through the real engine
on decks with one and three blank slides). The outline still drops the slide, which the Studio's pills and counters inherit; that
unit model is read by every editor path, so it is `followups.d/*-p3-outliner-drops-empty-slides.md`, with an `it.fails` arm in
`rendered-index.test.ts` that turns red the day the outline counts it. No shipped deck has a blank slide (0 of 292).

## 12. Next step

Ruling on §9, then P0. The decision doc is the deliverable for now; no code changes with it.
