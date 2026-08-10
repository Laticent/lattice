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
  describing a catalog sample nobody can fix — while each frame ran a layout-forcing probe pass on
  every shared post-mutation dispatch. `<html data-lattice-thumbnail>` routes it to `off`, the level
  that already installs nothing. Measurement did NOT support the stronger claim that overflow is a
  second crash cause, and that is recorded too. The adversarial trio (#25) then found two real
  defects in the fix itself — a coalesced IntersectionObserver batch could poison the budget
  registry into the very leak it closes, and recycling wiped a module-level cache at scroll
  frequency — plus a hollow test and four overstated claims, all corrected here (§8). Records four
  traps: an unforced GC reads `Documents` as a leak; `resolve-overflow-marker.js`'s "the probe always
  runs" describes the export contract, not this watcher; the watcher installs no observer of its own;
  and a stepped test scroll cannot reproduce coalesced observer delivery. One pre-existing bounded
  residue logged, not fixed.
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

What a recycle costs differs by path, and the first version of this section got it wrong in both
directions. Corrected in place rather than deleted, because the wrong version is precisely what made
the trade look free:

- **The picker uses neither cache.** `key` is `null` unless `slideIndex` is a number, and the
  picker's tiles pass none — so they neither read nor write the whole-deck memo. A returning picker
  tile pays a full uncached render. The earlier claim that each tile "overwrites the single memo slot
  anyway" was false twice over: they are not in that path at all.
- **The overview uses both, depending on the deck.** A plain deck slices, hitting the 24-entry
  `sliceCache` — which `dispose()` deliberately does not clear. A deck carrying a deck-derived fact
  renders the WHOLE DECK per tile and shares one memo entry across the grid, which is the case the
  memo exists for.

That second case is where recycling first went wrong, and it was a regression this change introduced.
`dispose()` cleared the shared whole-deck memo unconditionally — harmless while a thumbnail never
unmounted, since dispose fired once, at grid close. Two-way windowing makes it fire at **scroll
frequency**, so every eviction wiped the memo for every other host on the page and the next overview
tile paid a cold whole-deck parse (~39ms on a 58-slide deck) where the grid had previously paid one
in total. It reached the Studio's own preview behind an open picker too.

`dispose()` now **refcounts live renderers** and releases the memo only when the last one goes. That
is the same argument `clearDeckMemo`'s own comment already makes for why dispose must not touch
`sliceCache` ("dispose() is PER-RENDERER while the slice cache is module-level and shared"); once
recycling exists, the memo belongs in that category. Pinned by three cases in
`single-slide-render.thumbnail.test.ts` — the middle one reproduces the regression exactly (engine
calls 1 → 2 with a single recycle in between) and goes red if the unconditional clear returns.

Rough edge, logged not fixed: `SLICE_CACHE_MAX` (24) sits below `PREVIEW_BUDGET` (32), so on a deck
longer than 24 slides a full traversal can still outrun the slice cache.

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
- The docs unit suite (2856 tests), lint, and typecheck are green, as are the neighboring e2e specs
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

2. **The cost is per-document, so it multiplies by the grid.** Be exact about what that
   cost is — the first version of this note was not, and the correction matters because a
   false cost claim shapes the next optimization.

   **What is NOT saved:** the observer. `startOverflowWatcher` installs nothing of its own —
   no `MutationObserver`, no resize listener, no rAF. It registers `check` with
   `schedulePostMutation`, whose shared observer + resize listener are installed by the
   first caller, and that is `patchSectionGeometry()` — which this change deliberately keeps.
   Measured by booting the real runtime with both instrumented: **3 MutationObservers and 1
   resize listener in both the thumbnail and the normal case, identical.** The earlier claim
   that each frame "arms a permanent MutationObserver plus a resize listener" was wrong, and
   it shipped in five places.

   **What IS saved,** per frame, on every dispatch of that shared rAF: the whole `check` pass
   — a cell-aware geometry probe, a text-rect walk over anything that clips, drill-down
   culprit resolution, and `drawFixMeTags` — all layout-forcing — plus the one `scroll`
   listener `drawFixMeTags` binds per document. Real, and smaller than first claimed.

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

`SlideThumbFace` — the one face every thumbnail grid shares — stamps `<html
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
  1336 → 1304, style recalc 1.15 → 0.97s. The listener delta was first attributed to "the
  resize handler the watcher no longer installs" — wrong, per the correction above; that
  handler belongs to `patchSectionGeometry` and is still installed. It is the `scroll`
  listener `drawFixMeTags` binds once per document, which fits ~34 overflowing frames.

## 7. What the adversarial trio found (HARD RULE #25)

Red team, Munger inversion, and an independent checker, run against the shipping diff. They found
**two real defects in the fix**, one hollow test of mine, and four overstated claims. Recorded
because the pattern is more useful than the patches.

### D1 — the fix could reinstate the bug it closes

`useInView` destructured `entries[0]`. `IntersectionObserver` accumulates records and delivers them
as one array, so under load a single target arrives with several — measured on the real Studio,
**4–10 coalesced `[intersecting, not-intersecting]` batches per flick-scroll of the gallery**.

The one-way version could read the first entry safely: a dropped record only delayed a mount that
was going to happen anyway. The two-way version keeps *persistent state* keyed off that read, so a
dropped record is permanent corruption. `[in, out]` mounted the tile and marked it `inBand: true`
while it was actually out of band, and `enforcePreviewBudget` skips in-band slots — so that slot
could never be reclaimed. The red team drove it to **96 mounted tiles against a budget of 32**:
#1463 in full, restored by its own fix. The mirror shape `[out, in]` recycled a tile the user was
looking at, falsifying §3's central invariant. One real-surface run of the stepped script even
reported `live = 62` — the exact pre-fix number.

Fixed by reading the last entry, which is the observer's current answer and the only one this hook
has a use for. (The repo's two other IntersectionObserver call sites already take `entries.some(…)`;
the destructure was the outlier.) Pinned by four cases that deliver real multi-entry batches — all
four go red against `entries[0]`.

### D2 — recycling wiped a shared cache at scroll frequency

`dispose()` cleared the module-level whole-deck memo unconditionally. See §4: fixed with a refcount.

### D3 — my "nothing is installed" test was a hollow gate

It asserted no ring and no tab after a mutation. jsdom lays nothing out, so `scrollHeight` and
`clientHeight` are both 0 and the probe finds no overflow **at any level** — the test passed just as
happily with the routing reverted. Exactly the shape this repo has shipped once before (a gate keyed
on a class only one of six emitting paths used).

Fixed by giving the harness geometry — a section reporting 2000px of content in a 700px box — plus a
`Range.prototype.getClientRects` shim, without which the content probe throws and aborts `check()`
midway. With a positive control asserting the *unflagged* document IS marked, five cases now go red
on revert where one did before.

### D4 — four claims that were not true

| claim | what the code says |
|---|---|
| "each frame arms a permanent MutationObserver + resize listener" | `startOverflowWatcher` installs **nothing**; `patchSectionGeometry` owns the shared observer and is kept. Measured identical in both cases. §6.2 |
| "the picker's tiles overwrite the single memo slot anyway" | they never touch the memo — `key` is `null` without a `slideIndex`. §4 |
| "1336 → 1304 listeners — the resize handler the watcher no longer installs" | that handler is still installed; the delta is `drawFixMeTags`' per-document `scroll` listener. §6 |
| "an in-band tile is never recycled" | was false via D1; true again after the fix, and now actually tested |

### D5 — the oracle could not see the defect it guards

The e2e scrolled in steps with a pause, which hands the observer a clean idle window and produces
**zero** coalesced batches (0 across 12 stepped runs, versus 4–10 in every rAF-continuous one). It
now flick-scrolls from inside a `requestAnimationFrame` loop, three traversals, and additionally
asserts the settled count — a scale-free property, unlike the ceiling, so it does not quietly become
a desktop-only assertion. Tagged `@crosswidth` so a 390px number exists at all.

### Still open, deliberately

- **`PREVIEW_BUDGET = 32` is device-blind**, chosen from one desktop measurement. All three lenses
  flagged it, and tagging the spec `@crosswidth` finally produced the number that did not exist:
  at **390×844 the grid settles at 32 live documents, 70 `Documents`, ~1.28GB RSS** after three
  flick traversals — against 33 / 72 / ~1.36GB on the desktop. The phone holds essentially the
  same working set as a workstation with twenty times the headroom, because the constant knows
  nothing about the device. That is bounded (the whole point), but it is not *tuned*. Scaling it —
  `inBand + slack`, or a `navigator.deviceMemory` clamp — is a real improvement and a separate
  change; what this note does is stop claiming the phone case is verified when only the desktop
  one was.
- **`SLICE_CACHE_MAX` (24) < `PREVIEW_BUDGET` (32)** — a long overview traversal can outrun the
  slice cache.
- **Two of the four grids show the author's own content, and §6's justification was written only
  about the gallery.** `ReshapePicker` previews the author's slide in each variant look, and
  Present's **slide overview** shows their whole deck — so "a catalog sample the author neither
  wrote nor can fix" is true of the picker and false of both of those. Naming Reshape while leaving
  the overview implicit was an oversight, not a decision; both are listed here now. The shape that
  would keep both wins is to make the level a property of the GRID rather than of `SlideThumbFace`:
  `off` for the picker's catalog samples, and the authoring level for the two grids showing the
  author's own slides. That is a product call, so it is surfaced rather than taken silently.

## 8. Logged, not fixed

Closing the gallery leaves ~69 documents resident (it was ~80 before this change) with only the one
live preview left in the page — a few hundred MB that the close does not hand back promptly. It is
**flat across five open/close cycles**, so it is a steady-state residue, not a leak, and it is not
what crashes the tab. It predates this change and sits off the path of it, so per HARD RULE #18 it is
logged rather than pulled into this diff.
