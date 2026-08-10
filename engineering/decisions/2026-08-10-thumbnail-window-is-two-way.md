---
status: shipped
summary: >
  The add-slide gallery could crash the tab because its "windowing" only ever mounted. `useInView`
  disconnected its IntersectionObserver on a tile's FIRST intersection, so `visible` never returned
  to false and every tile the author had scrolled past kept a live engine iframe for the lifetime of
  the grid. Reproduced and measured on the built site: one scroll through the browse grid took the
  page from 12 live preview documents to 62 and Chrome's resident set from ~1.1GB to ~1.6GB (~10MB
  per tile), and the count is bounded only by catalog size — expanded looks panels push it further.
  The competing hypothesis in the report, a chunk-load reload, is ruled out: that path never reloads
  by itself, it renders a card offering one. The fix makes the window two-way, with hysteresis from a
  SHARED BUDGET (32 mounted previews) rather than a second distance threshold — an out-of-band tile
  is recycled LRU when the grid needs the slot, an on-screen tile never is. Re-measured on the same
  surface: 33 live frames and ~1.35GB, flat across four full traversals and five open/close cycles.
  Also records one measurement trap (unforced GC reads `Documents` as a leak) and one pre-existing
  bounded residue logged, not fixed.
---

# The thumbnail window only opened — #1463

**Status:** shipped on `claude/issue-1463-315nxe`. **Date:** 2026-08-10.

## 1. What was reported, and what it actually was

Scrolling the Studio's add-slide gallery while a search was active crashed the tab, which then
reloaded. The report named two candidate mechanisms and — correctly — refused to pick one without a
measurement: an iframe-accumulation OOM, or the chunk-load path in `docs/src/lib/chunk-load.ts`
(a long-lived tab requesting a hashed asset that no longer exists).

**It is the iframes.** The chunk-load path is ruled out on its own terms: it never reloads by
itself. `isChunkLoadError` classifies a failed dynamic import and `chunkLoadMessage` produces copy
for a card that *offers* a reload — a user-clicked button, not the tab dying. What the reporter saw,
a tab that goes away and comes back on its own, is a renderer OOM and Chrome's sad-tab recovery.

The mechanism named in the report is real and is the whole of it. `useInView`
(`docs/src/components/studio/slide-thumb.tsx`) disconnected its observer the moment a tile first
intersected, so `visible` was a one-way latch and the mounted set was monotonic in "tiles the author
has ever scrolled past". The comment in `SlidePicker.tsx` — *"only the on-screen tiles render an
iframe; the rest cost a ref"* — was true on first paint and false from the first scroll onward.

A second, quieter half of the same defect: flipping `active` to false would not have helped anyway.
`DeckPreview`'s `active` gates **re-renders**, not the frame. Once a tile had rendered, dropping
`active` left the entire iframe document resident. Only unmounting runs the cleanup
(`renderer.dispose()` plus React removing the `<figure>`) that actually returns the memory. A fix
that only made `visible` two-way, without changing what `SlideThumbFace` renders when inactive,
would have measured as no fix at all.

## 2. The measurement

Driven against the built site (`astro preview`) with Playwright and CDP `Performance.getMetrics`,
desktop 1440×900, seeded to the Build posture — the real Studio, not a harness. `live` counts
`iframe.live` nodes; `docs` is Chrome's `Documents` metric; `rss` is the sum over Chrome processes.

**Before:**

| point | live | docs | heap | Chrome RSS |
|---|---|---|---|---|
| Studio loaded | 1 | 4 | 19MB | 917MB |
| gallery open, top of grid | 12 | 26 | 30MB | 1059MB |
| after one full browse scroll | **62** | **134** | 73MB | **1507MB** |
| three further passes | 62 | 134 | 72MB | 1503MB |

**After:**

| point | live | docs | heap | Chrome RSS |
|---|---|---|---|---|
| Studio loaded | 1 | 4 | 19MB | 917MB |
| gallery open, top of grid | 12 | 26 | 29MB | 1047MB |
| after one full browse scroll | **33** | **72** | 49MB | **1362MB** |
| three further passes | 33 | 72 | 49MB | 1354MB |

The headline is not that 62 became 33. It is that **62 was never a ceiling** — it is the size of the
component catalog, which is the only thing that stopped the count. Expand the looks panels and it
keeps climbing (a run that expanded variants reached 189 documents and 2.2GB before the fix; the same
run after holds at 33 live frames). 33 is a ceiling the code enforces, so the profile no longer scales
with how much there is to look at.

Both numbers are stable across repeated traversals, and across five open-scroll-close cycles
(129 documents before, 71 after, flat both times) — so neither version leaks across cycles. The
before-fix crash comes from a single long scroll on a device with less headroom than this sandbox,
not from accumulation over a session.

### The measurement trap, recorded so nobody re-derives it

The first post-fix run looked *worse* than the baseline: `Documents` climbed to 606 and RSS to 2.8GB.
That reading is an artifact. Recycling constantly detaches documents, and `Documents` counts a
detached document until it is collected, so an unforced read shows the collection backlog rather than
what is retained. Forcing `HeapProfiler.collectGarbage` twice with a beat between, before every read,
is what turns the metric back into a statement about retention — and it is what shows the flat
plateau above. Any future preview-memory measurement in this repo should force GC first.

## 3. The design, and the tension it had to respect

The report flagged the constraint correctly: the shared grid deliberately reuses tile iframes across
the browse↔search transition (`tileKey` keeps a bare-name key for function-band tiles) so crossing
that boundary doesn't tear down the subtree, and "a naive unmount will trade a crash for preview
churn."

So the window is two-way, but its hysteresis comes from a **shared budget** rather than a second
distance threshold:

- A tile mounts when it enters the observer's band (`rootMargin` 250px — unchanged, so first paint
  is byte-for-byte the same behavior).
- Leaving the band does **not** unmount it. It becomes *evictable*, and the observer stays connected.
- `PREVIEW_BUDGET` (32) caps how many previews are mounted at once. When the count goes over, the
  least-recently-in-band **out-of-band** tiles are recycled until it is met.
- An **in-band tile is never recycled**, so the budget caps retention, never what is on screen. On a
  viewport tall enough to hold more than 32 tiles the budget simply runs over — the on-screen set is
  not negotiable.
- Recycling means `SlideThumbFace` renders a placeholder `<span>` carrying the caller's box classes
  (`aspect-video w-full` at every call site), so the tile's height — and the grid's scroll height —
  is unchanged. No jump, no reflow.

Why a shared budget rather than a mount-at-250px / unmount-at-800px pair: two thresholds set the
retention band by *geometry*, so the memory ceiling then varies with viewport height and column
count — the 4K desktop dialog and the 390px phone would land on very different numbers, and neither
would be the one anybody chose. A budget states the ceiling directly and lets the slack (budget minus
whatever is in band, about three rows on the desktop dialog) fall out of it. It is also shared across
both grids that use the hook, so the picker and Present's overview cannot each mint their own ceiling.

The churn this trades for is real and bounded: scroll far enough away and back, and those tiles
re-render cold. Verified on the real surface — jumping from the bottom of the grid straight back to
the top, every visible tile has repainted within 500ms at both 1440px and 390px, with no blank holes
in the viewport. A cold tile beats a dead tab.

## 4. Scope: both grids, one hook

`useInView` is shared by the add-slide gallery (`SlidePicker`) and Present's Slide Overview
(`SlideOverview`), and both carried the same false claim in their header comments. The overview has
the same profile on a long deck, so the fix lands in the hook and both surfaces get it; the two
comments are corrected in the same change.

The overview pays slightly more for a recycle than the picker does: its thumbs render the whole deck
narrowed to one slide, so a remount is a slice render. That is cheap and cached —
`single-slide-render.ts`'s `sliceCache` is a 24-entry LRU that `dispose()` deliberately does **not**
clear (its own comment explains why: a per-renderer dispose must not wipe a module-level cache every
other host is using). The picker's tiles take the whole-deck memo path instead, where each tile
overwrites the single memo slot anyway, so recycling costs it nothing that was not already lost.

## 5. Verification

- **Unit** — `slide-thumb.test.tsx` drives a stubbed `IntersectionObserver` over a 64-tile fake grid
  and asserts the four properties the fix rests on: a scrolled-past tile stays mounted while there is
  slack, the mounted set never exceeds the budget across a full traversal, eviction is LRU, an
  in-band tile is never recycled even past the budget, and unmount releases the slot. Plus the
  placeholder keeps the tile box.
- **E2E, real surface** — `e2e/gallery-preview-budget.spec.ts` opens the real Studio's gallery,
  traverses the browse grid and then a search result set, and asserts the live-preview count peaks
  under a ceiling with headroom (48) rather than climbing — and that it is still greater than one, so
  a fix that simply stopped rendering previews could not pass.
- **Visual, real surface** — screenshots at 1440px and 390px at the bottom of the grid, immediately
  after jumping back to the top, and mid-grid. Every visible tile is rendered in all of them.
- The docs unit suite (2772 tests), lint, and typecheck are green, as are the neighboring e2e specs
  (`insert-component`, `present`, `present-guide`, `slide-ops`).

## 6. Logged, not fixed

Closing the gallery leaves ~69 documents resident (it was ~80 before this change) with only the one
live preview left in the page — a few hundred MB that the close does not hand back promptly. It is
**flat across five open/close cycles**, so it is a steady-state residue, not a leak, and it is not
what crashes the tab. It predates this change and sits off the path of it, so per HARD RULE #18 it is
logged rather than pulled into this diff.
