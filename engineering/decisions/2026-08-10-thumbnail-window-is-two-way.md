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
  A second pass then stops the engine runtime's overflow/type-floor watcher from running in a
  thumbnail at all: every frame was booting it at `author` level, so the shipped gallery painted an
  "Overflows" tab on the `image` tile and type-floor alarms on `state-chart`/`quadrant` — QA chrome
  describing a catalog sample nobody can fix — while each frame armed a permanent MutationObserver
  and a forced-layout probe, once per frame across the grid. `<html data-lattice-thumbnail>` routes
  it to `off`, the level that already installs nothing. Measurement did NOT support the stronger
  claim that overflow is a second crash cause, and that is recorded too. Also records two traps: an
  unforced GC reads `Documents` as a leak, and `resolve-overflow-marker.js`'s "the probe always
  runs" describes the export contract, not this watcher — believing it nearly bought a redundant
  bypass. One pre-existing bounded residue logged, not fixed.
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

## 6. The second half — a thumbnail is watched by nothing

Raised while reviewing the fix: *"any slide that overflows crashes it too — for these
multi-slide previews we should disable overflow detection."*

**The first half of that is not supported by measurement, and the second half is right
anyway.** Both are worth stating precisely, because the reasons differ.

### What the overflow watcher was doing in a thumbnail

Every preview frame boots the engine runtime, and a frame with no export-settings block
resolves to `author` — the loudest level, by design (`resolve-overflow-marker.js`: "the
live preview and the Studio always show `author`, because you are the one who can fix a
clipped slide"). Confirmed in a real Studio frame: `data-lattice-overflow-marker="author"`,
and on an overflowing slide, an `.overflow-tab` plus three Fix-Me culprit overlays.

In a grid of thumbnails that is wrong twice over:

1. **The signal has no addressee.** It is unreadable at ~260px, and in the add-slide
   gallery it describes a *catalog sample* the author neither wrote nor can fix. A census
   of the shipped gallery, scrolled to the bottom, found real chrome on real tiles:

   ```
   frames=33  .overflow=1  tabs=1  illegibleTabs=2
      · image:       tab=["Overflows"]
      · state-chart: type-floor alarm
      · quadrant:    type-floor alarm
   ```

2. **The cost is per-document, so it multiplies by the grid.** Each frame arms a
   permanent `MutationObserver` over `document.body` (`subtree + childList +
   characterData + attributes`) plus a resize listener, rAF-dispatching a full-document
   scan whose probes force layout — once per frame, across every frame the grid holds
   open.

### What it was NOT doing: crashing the tab

Measured honestly, and it does not support the stronger claim. A 40-slide deck where
*every* slide overflows, through Present's overview:

| | fits | overflows |
|---|---|---|
| nodes at the bottom of the scroll | 17,440 | 32,422 |
| Chrome RSS | 1282MB | 1442MB |
| CPU over 8 idle seconds | 0.36s | 0.26s |

Real, but not the dominant term — and the node difference is mostly the author's own
content, since the watcher's own chrome is about four nodes per slide. Nothing churns
once the grid settles. The 60fps redraw loop overflow *used* to cause was already found
and closed by `drawFixMeTags`' painted-signature guard. So this is waste and noise
compounding §1's frame accumulation, not a second cause of it.

### The fix, and the wrong turn on the way to it

`SlideThumbFace` — the one face all three grids share — stamps `<html
data-lattice-thumbnail>` on the frame it renders, via `SingleSlideOptions.thumbnail` →
`srcdoc()`. The runtime reads it and routes the watcher to `off`.

The first cut instead added an early `return` past `startOverflowWatcher` entirely, on
the belief that `off` still runs the probes. **That belief was wrong, and it came from
reading the wrong document.** `resolve-overflow-marker.js`'s header says the probe
"always runs" at `off` — true of the CLI/export contract it documents, and not of this
watcher, whose `off` branch is explicit: *"Sweep once, install nothing: no probe, no
observer, no resize handler."*

So the two options collapse into one, and the existing level is strictly better than the
bypass: it installs exactly as little, **and** it sweeps any pre-existing mark and stamps
the attribute the CSS suppression keys on, which a bare `return` would skip. Reusing the
tested vocabulary instead of adding a second way to be silent is HARD RULE #15.

Deliberately narrow: only the overflow/legibility watcher changes. `patchSectionGeometry`
still runs in a thumbnail — its `--_sec-1cqi` / `--_sec-1cqh` stamps and `data-orientation`
are load-bearing for portrait sizes and every container-query reflow, so a thumbnail that
skipped them would render *differently from the slide it depicts*: a worse defect than the
one being fixed. Verified: the mid-grid screenshot is unchanged after the switch.

The type-floor alarm goes with it — it lives inside the same `check()` — so `state-chart`
and `quadrant` lose their amber tabs in the grids too. That is the intended scope, not a
side effect: a reader of a thumbnail can no more resize a figure than fix a clipped one.

### Verification

- **Real bundled runtime in jsdom** — five cases added to
  `test/integration/parity/runtime-overflow-marker.test.js` (the harness that boots
  `dist/lattice-runtime.js`): a thumbnail resolves to `off`; a post-boot mutation draws no
  ring, tab or alarm (so *nothing is installed*, not merely "nothing is showing"); a
  pre-marked thumbnail is swept clean; the flag outranks an export-settings block; and —
  the control — a document without the flag is still `author`.
- **Real surface** — `e2e/gallery-preview-budget.spec.ts` walks every tile frame in the
  scrolled gallery and requires `level === 'off'` with zero chrome, then asserts in the
  same run that the Studio's own preview behind the dialog still reads `author`. Without
  that control, "every tile reads off" would also pass if the flag had been wired to
  every preview on the page.
- **The existing control still holds** — `e2e/reader-alarms.spec.ts` passes unchanged,
  including its positive control that injects a 4px figure into each landing preview and
  requires the watcher to react. Landing islands are not thumbnails and keep their
  watcher.
- **Census, before → after** on the built site: the gallery went from
  `.overflow=1, tabs=1, illegibleTabs=2` to zero across all 33 frames, and the `image`
  tile's red ring is visibly gone at 390px.
- **Cost**, same overflowing 40-slide overview: RSS 1442 → 1337MB, event listeners
  1336 → 1304 (about one per frame — the resize handler the watcher no longer installs),
  style recalc 1.15 → 0.97s. Modest, and the direction confirms the observers really are
  absent.

## 7. Logged, not fixed

Closing the gallery leaves ~69 documents resident (it was ~80 before this change) with only the one
live preview left in the page — a few hundred MB that the close does not hand back promptly. It is
**flat across five open/close cycles**, so it is a steady-state residue, not a leak, and it is not
what crashes the tab. It predates this change and sits off the path of it, so per HARD RULE #18 it is
logged rather than pulled into this diff.
