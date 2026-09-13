---
status: in-progress
summary: >
  A phone reloaded its tab while browsing the Studio's add-slide gallery. Six metamorphic
  relations over the preview window found NO defect and there is no leak either — a
  +144MB-per-cycle ratchet measured under CDP is the HeapProfiler detached-realm artifact
  `gotchas/memory-profiling.md` predicts. The defect is PEAK, and the cause turned out to be the
  windowing itself: WebKit never reclaims a preview document you tear down (five create/destroy
  cycles with zero frames alive read 149/230/282/401/442 MB, against Chromium's flat
  170/86/87/79/78), so browsing 69 tiles cost 69 documents whatever the budget said, and a
  tighter window recycled MORE. Shipped in three parts. One, the retention ceiling follows the
  in-band set instead of `PREVIEW_BUDGET = 32`, halving mounted documents 33 -> 14-15. Two, every
  frame gets the 640KB engine stylesheet as one shared `blob:` link instead of parsing its own
  copy (Chromium -63%, WebKit -21%; the per-frame document went from ~769,000 bytes to 2,508).
  Three, and decisively, the three thumbnail grids draw from a POOL of at most 10 frames that are
  re-pointed rather than destroyed — a full browse now mints 11 iframes and 15 documents instead
  of 69 of each, and WebKit retains a ~388MB median where it retained +648MB. NOT built, and
  designed here with its feasibility measured: a poster cache. A tile can be captured in-browser
  at full fidelity on BOTH engines (148ms Chromium / 284ms WebKit) once one bug is fixed — the
  engine sheet carries 147 literal `<`, harmless in HTML's RAWTEXT `<style>` and fatal inside a
  foreignObject's XHTML, so the CSS needs CDATA wrapping. 33 poster tiles cost +25MB against
  +600-1300MB for 33 live documents.
---

# The add-slide gallery's memory, and what a cached poster would buy

## 0. The ask

> "one of the cool things we do today is we actually render the real component when doing
> things like add slide in the studio. while this is fantastic and we spent quite a lot
> optimizing the experience on mobile am seeing memory issues and page reload and such on my
> iphone 15 pro and ipad air 4. I wonder if we still have bugs or if it is better to create a
> basic svg without color pallet that is a family of the chart as a placeholder. let's use
> metamorphic testing first to ensure things aren't broken and then decide."

Two questions, in the order asked: **is it broken**, and **should the tile stop being a real
render**. The answers are no, and no — but the second only because a third option beat both.

## 1. Is it broken? No.

`docs/e2e/gallery-preview-metamorphic.spec.ts` states six relations that need no oracle, which
is the point: "is 32 the right number for an iPhone" has no answer this sandbox can compute, so
a threshold assertion would be writing the answer into the test. A metamorphic relation survives
the budget being re-tuned, and therefore keeps being the gate afterwards.

| relation | what it catches |
|---|---|
| MR-1 retention saturates | the monotonic-retention class (#1463) |
| MR-2 the VISIBLE set is path-independent | coalesced-IntersectionObserver-entry corruption |
| MR-3 open/close is idempotent | a per-open residue — the session-shaped leak |
| MR-4 a filter/search round-trip is a no-op | orphaned frames when the result set changes underneath |
| MR-5 a recycled tile comes back painted | the correctness half — every count relation above is satisfied by a window that mounts nothing |
| MR-6 a looks panel gives its previews back | expanded-panel accumulation |

13/13 green on Chromium 1440x900, Chromium 390x844 and real WebKit at the iPhone 15 Pro profile
— that result is from BEFORE the budget change. Two of the relations had to be re-stated once
the ceiling started tracking the band (MR-1 became one-sided; its floor became "the tiles on
screen are painted" rather than a count), and the suite is green on the shipped code at all
three surfaces after that.

**Three of the six were wrong in their first form, and the correction is the most useful thing
in this note.** They asserted "the same scroll offset holds the same number of live previews,
however you got there", which FAILED at 7 vs 18 at the top of the grid. It failed because it
contradicted the design: the budget caps RETENTION, not what is on screen, so the mounted set is
deliberately a function of where you have BEEN. Retention is not path-independent and must not be
asserted to be. The relations now split **mounted** (saturation) from **visible**
(path-independence) — the distinction the LRU window actually makes.

## 2. Is there a leak? No — and the first measurement said yes.

Six add-slide cycles under CDP showed RSS after each close climbing 1180 → 1276 → 1205 → 1275 →
1271 → 1325 MB: a +144MB ratchet. Re-measured with **no heap client attached** and a 30s idle
before each read, four cycles settle at **1011 / 1017 / 1024 / 1026 MB**. Flat.

This is exactly the artifact `engineering/gotchas/memory-profiling.md` documents:
`HeapProfiler.collectGarbage` is a V8 GC that does not force Blink's detached-context disposal,
and tearing down a tile mints precisely those realms. **Every number in this note is measured
off-inspector for that reason.** Had the rule not been written down, this note would have shipped
a leak hunt for a leak that does not exist.

## 3. What the defect actually is

**Peak, not retention.** iOS discards a tab on footprint under memory pressure, and that discard
is what a user reports as "the page reloaded" — so post-GC retained heap is the wrong meter and
peak is the right one. Browsing the gallery once at 390x844 took the browser from ~850MB to
**1.46-1.70 GB**.

The cause is one device-blind constant. At `PREVIEW_BUDGET = 32`:

| viewport | tiles the author can see | live engine documents held | ratio |
|---|---|---|---|
| 1440x900 | 7 | 31 | 4.4 : 1 |
| 820x1180 | 6 | 31 | 5.2 : 1 |
| **390x844** | **3** | **31** | **10.3 : 1** |

A phone was showing three slides and paying for thirty-one. Tracked as #1538, and the
`2026-08-10-thumbnail-window-is-two-way.md` note had already filed it under "still open,
deliberately" — "chosen from one desktop measurement… all three lenses flagged it".

Per-tile cost measures at **~10-13MB**, which independently reproduces the ~10MB/tile figure
from #1463.

## 4. What shipped, and the two shapes that lost

The knob now counts the tiles kept warm BEHIND the band — `PREVIEW_RETAIN = 4` out-of-band
previews — instead of capping the mounted TOTAL. That separation is the whole idea: the tiles on
screen are not negotiable and are decided by the viewport; the tiles retained behind you are
negotiable and are the entire memory question. A phone and a workstation both retain four and
differ only in how many they SHOW, which was never the budget's business.

**Mounted engine documents while browsing: 33 → 14-15, with visible tiles unchanged at 3 / 6 / 7.**

Two shapes were implemented and measured first, and both are recorded because each looks right:

| shape | why it lost |
|---|---|
| **Scale the TOTAL by viewport area** | Fixes the phone, does nothing for the tablet also in the report — it hands an iPad 24, and 24 measured no better than 32. |
| **Derive the TOTAL from the band** (`clamp(inBandCount, 8, 32)`) | Correct on paper, fragile in fact. The count came from the slots' own `inBand` flags, so ONE stale `true` did not merely fail to evict one tile — it raised the ceiling for *every* tile. Measured at 32 then 11 mounted documents at the same offset, and 10 then 17 on WebKit. |

That second failure also exposed a **real bug, present before any of this work**: the observer's
"left the band" branch was guarded on `visibleRef.current`, React state that is not yet committed
when a flick delivers the matching leave. The leave was dropped and the tile kept an in-band flag
while off screen — permanently, since stranded slots are never evictable. Counting the RETAINED
set contains the damage of a stale flag to its own tile; removing the guard fixes the stranding
itself. The mounted total went from drifting across identical runs to deterministic within ±1.

### What retention costs, and why 4

Peak resident set while browsing the gallery once, against tiles surviving a 700px scroll away
and back — measured by ELEMENT identity, because a remounted tile is present too and presence
proves nothing:

| retain | 390x844 | survivors | 820x1180 | survivors |
|---|---|---|---|---|
| 0 | +657 MB | **0/3** | +695 MB | **0/6** |
| **4 (shipped)** | +722 MB | **3/3** | +792 MB | 3/6 |
| 8 | +940 MB | 3/3 | +952 MB | 6/6 |

Retain 8 buys a tablet its second half for ~200MB, the wrong way round for the device being
discarded. **Retain 0 was measured, briefly shipped, and is a REGRESSION rather than a trade** —
it removes the two-way window's hysteresis entirely, so a phone re-renders every tile you scroll
back to. An independent checker caught it against a header comment still promising the slack was
there; it is the reason this section exists.

### Read the MB figures as ±200

Peak RSS is a noisy instrument and the earlier drafts of this note quoted it far too precisely.
Five IDENTICAL runs of the shipped code at 390x844: **730, 931, 931, 974, 991 MB — a 261MB
spread.** Two things survive that noise and are the honest claims:

- the arms do not **overlap** — five runs of this design span 730..991 against four of the fixed
  32 at 1237..1327;
- the **document count** is near-deterministic and halves: 33 → 14-15, a spread of ONE across
  those same five runs.

Prefer the count when re-deriving any of this. It is the quantity that actually moves, ~10-13MB
per tile converts it, and it is the only one of the two a single run can be trusted on. An
earlier draft reported "~50% on a phone, ~30% on a tablet, ~12% on desktop" from single runs,
picking the flattering before-figure for each — those percentages were not reproducible.

### This lands on three surfaces, not one

`useInView` and the `livePreviews` registry were module-global and shared by the add-slide
gallery, **Present's slide overview** and **Reshape's variant tiles**, so all three got the same
retention. All three are now on the pool instead (§4c), which is shared the same way. The
overview is the one to watch: its tiles are the author's OWN slides with the authoring alarms
live — it passes no `specimen` flag, deliberately — and each is a whole-deck engine parse.

**What this does not fix**, so nobody re-measures it: the band itself. An in-band tile is never
recycled, so ~12 live documents at 390 and 820 alike are irreducible *while a tile is an engine
document*. That is the remaining cost on a tablet, and only a cheaper tile addresses it.

## 4b. The sheet every frame was parsing on its own

The retention work above caps how many live documents exist. This is the other half — what one
costs — and it turned out to be the larger lever on the engine an iPhone runs.

**Measured cost of a preview frame, attributed one piece at a time** (16 same-origin frames):

| per frame | Chromium | WebKit |
|---|---|---|
| empty iframe (realm only) | 2.0 MB | 1.0 MB |
| + slide markup | 3.0 MB | 2.0 MB |
| **+ engine CSS inlined** | **9.9 MB** | **13.2 MB** |
| + engine CSS via a shared `<link>` | 6.2 MB | **5.6 MB** |
| + runtime via `<script src>` | 11.7 MB | 12.1 MB |

The CSS is the biggest single line and it was duplicated per frame for no reason: `out.css` is
"a pure function of theme-name + geometry" (2026-07-11), and every tile in a grid shares both —
so all of them wanted byte-identical CSS while each inlined its own copy into its own `<style>`,
which a browser cannot recognize as the same bytes.

**The runtime was already shared** (`<script src>`, one URL, cached), which is why it does not
appear as a fix here. After the change the only per-frame JS is two inline agents totalling
1.1KB. There is nothing else of size left to share.

**Delivery had to be a `blob:` URL**, because the sheet is composed at runtime and there is no
static URL to point at. Measured: a blob shares exactly as well as an http URL on both engines,
with all 16 frames verified styled. The preview CSP declares no `default-src` and leaves `blob:`
open, so nothing there needed changing.

**Result, A/B in one build** (the fallback path inlines exactly as before, so removing
`URL.createObjectURL` in the page reproduces the old delivery with everything else held
constant), peak RSS browsing the gallery once at 390x844:

| | inline (before) | shared `<link>` (after) |
|---|---|---|
| Chromium | +1041 / +993 MB | **+393 / +361 MB** (−63%) |
| WebKit | +1469 / +1399 MB | **+1189 / +1064 MB** (−21%) |

The per-frame document dropped from ~769,000 bytes to 2,508.

### The bug this nearly shipped, and why nothing caught it

A stylesheet's relative `url()` resolves against the STYLESHEET's base. A `blob:` URL is an
opaque-path URL with nothing to resolve against — so `url(/…/playfair-400.woff2)`, correct
inline, becomes unfetchable from a blob. `theme-fetch.ts` already absolutizes font URLs once, to
a root-relative path, and that is the right answer for the inline case and not enough here.

It failed in the most expensive way available. The sheet parsed — 3595 rules, every color and
every box correct — so the document was structurally perfect and rendered in **fallback faces**:
37 of 37 `@font-face` entries at `status: "error"` against 37 loaded inline, and the deck's
headline measuring 828px, the fallback width exactly, instead of 877px.

**Every check that counted things passed.** The gallery's budget and metamorphic suites passed,
because a tile with the wrong font is still a mounted, painted tile. `preview-font-swap.spec.ts`
passed. The unit suites passed — and could not have failed, because **jsdom has `Blob` but not
`URL.createObjectURL`**, so every one of them exercises the fallback and none of them can reach
the shared path at all. What caught it was rendering the same slide both ways and LOOKING at the
two screenshots.

Two things came out of that, and they are the durable part of this section:
- `single-slide-render.shared-sheet.test.ts` stubs `createObjectURL` so the shipped path is the
  one under test;
- `preview-shared-sheet.spec.ts` asserts the FACES loaded, not that a sheet arrived — verified to
  go red when the fix is reverted.

Render parity is now proven rather than assumed: byte-identical screenshots on both engines, and
identical computed box, background, color and family.

## 4c. The finding that made the budget beside the point: WebKit keeps every document you destroy

Everything above tunes HOW MANY preview documents are alive at once. That was the wrong
quantity, and the measurement that says so is the most important one in this note.

A preview document is not freed on WebKit when you tear it down. Isolated harness, five cycles
of "create 16 engine frames, destroy them all, idle 12s", each reading taken with **zero frames
alive**:

| cycle | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Chromium | 170 | 86 | 87 | 79 | 78 |
| WebKit | 149 | 230 | 282 | 401 | 442 |

Chromium reclaims and stays flat. WebKit ratchets, monotonically, with nothing on the page. So
browsing the 69-tile catalog costs about 69 documents' worth of memory on the engine an iPhone
runs, **whatever the window is set to** — and a tighter window is WORSE, because the window is
what creates the churn. Predicted 69 x ~11MB ~= 760MB; measured on the real Studio, +784MB
retained with 8 live tiles. The budget in §4 reduced how many exist at any instant, which is
still worth having for peak; it could not touch this, because the cost is per document ever
CREATED.

### What replaced it

`docs/src/components/studio/preview-pool.tsx`. One grid owns a small fixed set of frames for its
lifetime — ten, or as many as it has tiles on screen, stopping at 28 — in one absolutely-positioned
layer inside the grid's own scroll content, and RE-POINTS them over the tiles worth showing. Nothing is ever torn down, so there is nothing for
WebKit to fail to reclaim.

A re-point is nearly free because `single-slide-render.ts`'s render signature — theme, mode,
geometry, the mermaid flag, the author CSS — deliberately does NOT include the markdown. Same
signature means the patch path: the same iframe, the same realm, a new body. Same harness, five
rounds of swapping all 16 tiles to different content:

| | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| WebKit, recreate | 175 | 274 | 357 | 480 | 579 | 603 |
| WebKit, re-point | 197 | 195 | 198 | 205 | 209 | 213 |

Slots are keyed by that signature (`shapeKey`), so a tile prefers a slot it can patch into; the
mermaid bucket and saved local components (their own `extraCss`) are the only groups in a
gallery that differ.

**Measured on the real Studio**, four full traversals of the catalog at 390x844:

| | before | after |
|---|---|---|
| iframe elements created | 69+ | **11** |
| preview documents (srcdoc writes) | 69+ | **13** |
| WebKit retained after the browse | +648 MB | **415 / 427 / 466 MB** (median 427) |
| Chromium retained after the browse | ~105 MB | **84 / 93 / 94 MB** |

Read the MB columns with §4's ±200 warning; the COUNTS are the near-deterministic half, and
they are the quantity the finding is about. Three runs per engine, because one is not evidence.

### Three things that were wrong before this worked, all of them invisible to the gates

- **Un-throttled re-pointing outran the render.** A flick delivers observer callbacks every
  frame, so the first cut re-pointed every slot ~60 times a second; a re-point arriving while
  the previous write is in flight falls through to a full `srcdoc` write, minting exactly the
  realm this module exists to avoid. It produced 9 iframes (the pool working) and 50 extra
  documents (the pool defeating itself), +472MB. Fixed with `APPLY_MS` (assignments settle,
  they do not track) and `RELEASE_GRACE` (a tile keeps its slot briefly after leaving the band).
- **Priority order is load-bearing, not tidy.** Sorting by recency gave slots to the oldest
  tiles; sorting on `inBand` alone prefers tiles below the fold, because the band reaches 150px
  past the viewport and a downward scroll admits them first. On-screen wins, then in-band, then
  most recent — and the order has to decide who KEEPS a slot as well as who gets a free one.
  It did not, in one cut, and three tiles filling the screen rendered as empty cards while
  tiles in their release grace squatted on the slots. That one was found by LOOKING at the grid.
- **A patched slide lost the specimen flag's suppression.** A catalog tile resolves its overflow
  marker to `off`, and at `off` the runtime deliberately installs "no probe, no observer, no
  resize handler" — so nothing was left to stamp `data-lattice-overflow-marker` on a section
  that arrived by patch rather than by boot, and that attribute is what the CSS suppression keys
  on. Six of ten frames carried no marker after a scroll and never recovered, so an overflowing
  sample painted the loud red authoring ring at 260px. `patchSlideBody` now carries the level
  across the swap. The subtlety worth keeping: it stamps the article's own `<section>` children,
  because `data-lattice-slide` is written by the RUNTIME and is not yet on the sections a patch
  inserts — keyed on that attribute the stamp matched nothing at all (`matched=0`, measured).

### Two visual defects the pool introduces by construction

A pooled frame is positioned OVER its tile instead of inside it, and that has two consequences a
reviewer should expect to handle on any new pooled surface:

- **Chrome drawn over the preview box needs a positive `z-index`.** The layer paints above the
  grid, so the overview's slide number, Reshape's "Current" badge and the gallery's hover Insert
  overlay all disappeared behind the frame. Four overlays now carry `z-10`.
- **The tile can no longer clip its own preview.** `overflow-hidden rounded-xl` on the card does
  not reach a frame that is not inside it, so the slide painted square corners over the card's
  curve. The slot clips itself, copying the radius from the nearest clipping ancestor, per
  corner — a preview above a name row is rounded on top and square at the bottom.

Neither was caught by a gate, a test, or a full-page screenshot. Both came out of shooting ONE
tile at 2x and looking at it.

### What an independent checker found, after all of the above measured clean

The pool passed six metamorphic relations on two engines, a mutation-checked unit suite, every
gate, and a visual pass at three widths — and a checker agent driving the same built Studio found
four defects in an hour (HARD RULE #25). Two were serious, and both are instructive about what the
verification above could not see.

- **The slot ceiling starved tiles the reader was looking at.** `MAX_SLOTS = 10` was a constant,
  and a desktop gallery puts 11-12 tiles on screen at 1440x900. The losers rendered as empty cards
  — permanently, because nothing re-runs the assignment pass while a grid sits still. Measured at
  1440x900 scrolled to 60%, one fully-visible tile blank at 4s, 8s and 15s; at 1920x1200, two.
  **Every measurement I had taken was at 390x844**, where three tiles fit and the cap never binds,
  and the comment beside the constant said it was "sized above the largest in-band set measured on
  any surface (12-17 tiles)" — which argues for a bigger number than the one it introduced. The
  cap now follows the on-screen count, floored at 10 and stopped at 28.
- **`seen()` measured the WINDOW, and every one of these grids scrolls inside a CONTAINER.** A
  tile the scroller had clipped away still intersected the viewport, so it ranked as on-screen:
  19 "visible" against 12 really visible at one desktop offset. That collapsed the three-tier
  priority into the pure LRU the code's own comment says is not enough — and it made the unit test
  for that priority pass for a reason that cannot occur in any shipped grid, because the test
  stubs the rects. Same bug in the observer: `rootMargin` applies to the ROOT only, so rooting at
  the viewport bought nothing. Both now use the tile's real scrolling ancestor.
- **A query matching nothing destroyed every preview document.** `<PreviewPool>` sat inside the
  non-empty branch of the search conditional, so an empty result unmounted the pool: 11 frames → 1
  → 11 per bounce, reachable by any typo, and on WebKit that is ~100MB never returned. The pool
  now wraps both branches — it is supposed to outlive what it shows.
- **A slot's shape key went stale under a held tile**, so after a palette or mode toggle the
  shape-preference lookup matched an arriving tile against a document that no longer existed and
  sent it down the full-write path — a quiet loss of the one property the module exists for.

A fifth is worth recording because it is latent rather than live: `DeckPreview` builds its renderer
ONCE, on first mount, so `specimen` and the engine/runtime URLs are fixed per SLOT no matter how
many times the document is rewritten. A pool that re-pointed a catalog sample into a slot built for
the author's own slide would silence that slide's overflow alarm — the regression `specimen` exists
to prevent, reappearing inside the pool. Today's three grids are each uniform, so nothing triggers
it; slots are now partitioned by that identity so it stays impossible, with a test that goes red
when the partition is removed.

The common thread: **every one of these is a defect the gates cannot see, and three of the four
needed a viewport I had not measured.** A phone-sized measurement is not a measurement.

### What this costs, honestly

- **10 frames are held for the grid's lifetime**, including while you are looking at a filtered
  result of three tiles. The old design would have released them. That is the trade: a fixed
  ceiling you can reason about, instead of a variable cost that is permanent on WebKit.
- **Moving an iframe in the DOM reloads it**, so the layer repositions frames rather than
  reparenting them — which means positions are recomputed on layout changes, not on scroll. A
  layout move the ResizeObserver cannot see would leave a frame misaligned until the next pass.
- **The `useInView` window, the `livePreviews` registry and `SlideThumbFace` are gone**, along
  with their unit suite. The properties that matter are pinned instead by
  `preview-pool.test.tsx` (the slot ceiling holds; a slot is re-pointed rather than remounted —
  zero unmounts; an on-screen tile outranks a grace-holder), each verified by mutation, and by
  the six metamorphic relations on the real browser.

`PREVIEW_RETAIN` and the §4 numbers stay in this note because they are the record of how the
defect was found, not because the knob still exists.

## 5. The poster cache — feasible, high-fidelity, not built

The ask proposed a palette-blind SVG family glyph. **That trade is worse than it needs to be**:
the gallery is the one surface where an author sees a component in their own theme, and a
palette-blind placeholder gives that up permanently to fix a transient peak. The user's later
refinement is the right shape — *render the real thing once, keep an image of it, invalidate on
theme change* — and it was measured rather than argued.

**Cost.** 33 poster tiles as decoded `<img>` cost **+25MB**, against **+600 to +1300MB** for 33
live engine documents. A 1280x720 capture is ~13KB of WebP, so the whole 69-component catalog
caches in well under a megabyte.

**Feasibility, and the bug in the way.** There is exactly one browser mechanism for rasterizing
arbitrary DOM: serialize into an SVG `<foreignObject>` and draw it to a canvas. The first attempt
failed on BOTH engines, and the bisect is the finding:

| payload | result |
|---|---|
| trivial markup, no CSS | OK |
| real tile markup, no CSS | OK |
| tile markup + engine CSS | **FAIL** — SVG never decodes |
| trivial markup + same-SIZE inert CSS | OK |
| tile markup + engine CSS **wrapped in CDATA** | **OK** |

Not size, not the external `url()`s, not malformed markup. **The engine stylesheet carries 147
literal `<` characters.** In HTML, `<style>` is RAWTEXT and a bare `<` is fine; inside a
foreignObject the document is XHTML, where it is a parse error that kills the whole SVG. This is
the same RAWTEXT-versus-parsed distinction HARD RULE #22 is built on, running the other
direction, and it will bite anyone who tries this without knowing it.

With CDATA the capture succeeds on both engines — **148ms Chromium, 284ms WebKit** — and the
result is pixel-faithful: correct theme, correct palette, correct embedded webfonts (the engine
sheet's faces are data URLs, so they survive the no-external-subresource rule that SVG-as-image
imposes). WebKit mattering here is not incidental:
`engineering/gotchas/studio-playground.md` already records scaled-`foreignObject` breakage on
iOS, so a capture path that worked only in Chromium would have fixed the gallery on the devices
that were not complaining.

**What is NOT designed yet**, and is the real work if this is built:

- **The cache KEY.** A poster is only valid for one (component skeleton + theme + palette + mode
  + `@size` box + deck front matter + engine version + `extraCss` for a local component). Miss
  any term and the gallery lies about what will be inserted.
- **WHEN the win lands.** A cache does nothing for the FIRST browse, which still renders every
  tile live — so it is complementary to the budget, not a replacement for it. It pays from the
  second gallery open onward, which is most of a real session.
- **Storage and eviction** — in-memory only, or IndexedDB across sessions.
- **Whether a poster tile stays a poster.** A tile the author is looking at may want to be live
  (motion, a diagram that settles late); posters for everything else.
- **HARD RULE #22 posture.** A poster is an inert image, so it is strictly SAFER than the
  document it replaces — the capture reads already-sanitized output. Worth stating explicitly in
  whatever PR builds it, because "we render untrusted markdown" is otherwise the reflex objection.

## 6. Unverified

**Every number here is Chromium or WebKit RSS on Linux.** Neither has jetsam, a per-tab
content-process ceiling, or OS memory pressure. The relations passing is evidence the window
BEHAVES correctly; it is not evidence that an iPhone 15 Pro or iPad Air 4 survives the gallery.
That claim is unreachable from this sandbox and stays **UNVERIFIED** until it is driven on the
hardware that reported it (HARD RULE #23).
