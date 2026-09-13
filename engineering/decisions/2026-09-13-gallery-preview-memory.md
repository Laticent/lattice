---
status: in-progress
summary: >
  A phone reloaded its tab while browsing the Studio's add-slide gallery. Six metamorphic
  relations over the preview window found NO defect — retention saturates, the visible set is
  path-independent, close releases everything, a recycled tile comes back painted — on Chromium
  at two widths and on real WebKit. There is no leak either: a +144MB-per-cycle ratchet measured
  under CDP is the HeapProfiler detached-realm artifact `gotchas/memory-profiling.md` predicts,
  and four cycles re-measured off-inspector settle flat at 1011/1017/1024/1026 MB. The defect is
  PEAK, and its cause is that `PREVIEW_BUDGET = 32` was device-blind: a 390x844 phone showed
  THREE slides and held THIRTY-ONE live engine documents. Shipped: the ceiling follows the
  in-band set instead of a constant, which cuts peak ~50% on a phone, ~30% on a tablet and ~12%
  on the desktop with the visible tile count unchanged at all three. Viewport-AREA scaling was
  measured first and rejected — it fixes the phone and hands a tablet 24, which measures no
  better than 32. NOT shipped, and designed here with its feasibility measured: a poster cache.
  A tile can be captured in-browser at full fidelity on BOTH engines (148ms Chromium / 284ms
  WebKit) once one bug is fixed — the engine sheet carries 147 literal `<`, harmless in HTML's
  RAWTEXT `<style>` and fatal inside a foreignObject's XHTML, so the CSS needs CDATA wrapping.
  33 poster tiles cost +25MB against +600-1300MB for 33 live documents.
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

`useInView` and the `livePreviews` registry are module-global and shared by the add-slide
gallery, **Present's slide overview** and **Reshape's variant tiles**. All three get the same
retention. The overview is the one to watch: its tiles are the author's OWN slides with the
authoring alarms live, and each is a whole-deck engine parse.

**What this does not fix**, so nobody re-measures it: the band itself. An in-band tile is never
recycled, so ~12 live documents at 390 and 820 alike are irreducible *while a tile is an engine
document*. That is the remaining cost on a tablet, and only a cheaper tile addresses it.

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
