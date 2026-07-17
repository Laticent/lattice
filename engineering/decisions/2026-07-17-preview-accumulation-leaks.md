---
status: shipped
summary: (Leak fixes shipped. The FPS=30 follow-up is now RESOLVED — measurement DISPROVED the runtime oscillation: the preview settles to zero at-rest mutations on every slide tested and rAF runs a full 60/sec, so FPS=30 was environmental, NOT a code bug. No runtime change shipped; instead a settle-check guard + a display-ceiling-relative FPS rating in the overlay.) An adversarial trio (red-team leak hunt + Munger inversion + across-refresh storage audit, then an independent checker) traced a field report of "the live preview degrades the longer a session runs AND across multiple refreshes; FPS pinned at 30." Verdict — the docs/src preview path is mostly well-defended; the REAL, confirmed accumulation is (1) createSingleSlideRenderer had no dispose(), so remounting hosts leaked a parsed ~560KB theme iframe each cycle; (2) specimen.js's onThemeChange MutationObserver on the immortal documentElement was never disconnected; (3) the service worker never version-evicted old content-hashed assets, bloating Cache Storage across deploys. All three FIXED here. The most-likely FPS=30 cause — a runtime rAF↔MutationObserver loop that never idles if a per-frame geometry/overflow write oscillates — is a GUARDED risk that can't be confirmed by static analysis; it needs on-device instrumentation before touching the shared runtime (export-sensitive), so it's a scoped follow-up, NOT shipped blind.
---

# Preview performance — accumulation over a session / across refreshes

**Date:** 2026-07-17 · **Trigger:** field report — after the cold-first-render fix
(runtime prefetch, #1031), the live preview still "degrades the longer a session runs
and the more I refresh; I suspect a memory issue or accumulation." Perf overlay showed
**FPS pinned at 30** on both the Studio and the landing.

## Method — adversarial trio (HARD RULE #25)

Three parallel hunters, each a distinct lens, then an independent checker (me) verified
every claim against the real code with explicit GC / bounds reasoning:

1. **Red team** — observers/timers/listeners/iframes created per mount but never torn down.
2. **Munger inversion** — "how would we GUARANTEE the preview gets slower over a session?"
3. **Across-refresh / persistent storage** — a refresh resets the JS heap, so cross-refresh
   decay must be persistent (localStorage / SW / IndexedDB).

Two of the three independently converged on the same primary suspect (the in-iframe runtime
loop), which is exactly the signal an adversarial trio exists to produce.

## Findings — verified

### Confirmed + FIXED

| # | Finding | Scope | Fix |
|---|---|---|---|
| 1 | `createSingleSlideRenderer` had **no `dispose()`**; `DeckPreview` unmount only cancelled the scheduler. The per-host `ResizeObserver` was anonymous (never disconnected) and its host stayed in the module-level `scaleTargets` Map (a GC ROOT). A remounting host — HeroPreview's Preview↔Source tab flip, the Slide Overview (one host per slide), the Studio overlays — leaked a fully-parsed **~560KB theme iframe** per cycle, pruned only opportunistically. | within-session (memory) | `dispose()` added — disconnects the tracked ResizeObservers, drops their `scaleTargets` entries, disconnects the theme observer(s), clears the reveal timers. Called from `DeckPreview`/`FieldCardsLive`/`RestyleShowcase` unmount and `specimen.js` teardown. |
| 2 | `onThemeChange` installed a `MutationObserver` on `document.documentElement` (a **permanent node** → never GC-able) with no teardown; only `specimen.js` calls it. Its closure pins the whole specimen renderer. | permanent (component pages; monotonic if Astro soft-nav is enabled) | `onThemeChange` now returns an unsubscribe; `dispose()` also disconnects it; `specimen.js` tears down on `pagehide`/`astro:before-swap`. |
| 3 | The service worker (`sw.js`) never version-evicted old content-hashed `playground/v/<hash>/` assets. `activate` only drops whole non-current caches and runs **only on a SW-strategy VERSION bump, never on a content deploy**, so each deploy's engine bundle / theme sheets accumulated in the `ASSETS` cache (bounded only by the coarse 300-entry FIFO). Cross-refresh Cache-Storage bloat. | across-refresh | Version eviction at `put()` time: caching a current-hash asset drops every OLDER-hash copy of the same logical asset (same suffix). Bounds versioned assets to ~one deploy regardless of history. |

The checker downgraded the storage hunter's scarier "quota eviction drops the CURRENT
engine bundle → cold refetch" mechanism: the FIFO trims oldest-inserted (old-deploy)
entries first and SWR re-puts current assets, so the current bundle is not the one evicted.
The real issue is Cache-Storage hygiene, medium — hence fix #3 keeps only the live deploy.

### Primary FPS=30 suspect — was PLAUSIBLE, later DISPROVEN by measurement (see the RESOLVED section below)

> **Update:** the hypothesis in this section was tested and did **not** hold — the runtime settles to
> zero at-rest mutations on every slide, rAF runs 60/sec, so FPS=30 is environmental. Kept for the
> reasoning trail; the verdict is in "## FPS=30 follow-up — RESOLVED" below.

Both the red-team and inversion hunters point outside `docs/src`, to the **injected runtime**
(`lib/runtime/index.js`): the patch fast-path keeps **one iframe document alive for the whole
editing session** (that's its purpose — skip the ~485ms srcdoc reparse), and the runtime runs
a `MutationObserver(attributes:true) → requestAnimationFrame` loop (`dispatchPostMutation`,
`index.js:1410-1428`) that re-applies section geometry (`--_sec-1cqi`, `:1448`) and the overflow
class (`:1672`). If a per-frame write **oscillates** — a section width that flip-flops between
two rounded `--_sec-1cqi` values, or the overflow state flickering around the 12px `TOL` — the
rAF loop never idles → **pinned at 30fps**, and accumulated DOM (overflow tabs, fix-me tags)
can grow each frame.

**Checker verdict: this is a real *failure mode* but a *guarded* one.** Both write sites are
already change-gated to settle (`if (getPropertyValue(...) !== v)`, `if (classList.contains(...)
!== over)`), with comments documenting this exact risk. It only fires for a slide whose
measurement genuinely oscillates — which **cannot be confirmed by static analysis**. Per HARD
RULE #23 it is NOT called "the bug" without evidence from the real surface.

Compounding this is per-flip amplification: every live preview installs its own palette/mode
`MutationObserver`, so one topbar flip fans out to N full-write renders (N = live previews on
the page). Real, but bounded by preview count, not monotonic on its own.

### Rejected (checked, NOT the cause)
`frame-scheduler` is single-flight and cancels on unmount; `PerfOverlay`'s rAF is the *meter*,
torn down on unmount, cannot multiply; the EMA / sanitize / theme / font caches are all bounded;
the detached-host `ResizeObserver` (pre-fix) was actually GC-collectable (unreferenced, observing
an unreachable node); every React-side palette observer disconnects; localStorage (snapshot-cache
240KB single-key + size-gated; studio deck store pruned-on-delete + capped) and IndexedDB
(auto-checkpoints capped) are disciplined. The user's suspicion was right in *kind*; most obvious
vectors were already defended.

## FPS=30 follow-up — RESOLVED: the oscillation is DISPROVEN; the cause is environmental

The follow-up was to confirm the runtime oscillation before touching the export-sensitive shared
runtime (HARD RULE #23) — because the "guarded write oscillates" story was never more than a
static-analysis hypothesis. **It was measured, and it does not hold.** A headless reproduction
(`docs/scripts/runtime-settle-check.mjs`) rendered representative slides in the REAL built
Playground preview and watched the live iframe at rest, replacing "count `dispatchPostMutation`"
with the equivalent black-box signal — **at-rest DOM mutations** (a settled runtime writes zero;
an oscillating one churns every frame):

| scenario | at-rest mutations (2s) |
|---|---|
| minimal / dense-overflow / borderline-overflow / piechart / mermaid / wide-code | **0 each** |
| Studio preview after a viewport RESIZE | **0** |
| landing hero (RestyleShowcase auto-cycling) | **0** |
| rAF serviced rate, resting Studio + landing | **60/sec** |

So the runtime's change-gated writes settle exactly as designed — no perpetual `rAF↔MutationObserver`
loop for any slide tested, and the frame loop runs a full 60/sec at rest. **The reported FPS=30 is
environmental** — a 30Hz panel, a power-saver / thermal rAF throttle (common on tablets/iOS), or a
backgrounded/occluded tab — not a code oscillation. Hardening the runtime would have "fixed" a bug
that does not exist, and changed HTML-export bytes for nothing. **No runtime change shipped.**

What DID ship instead:
1. **`runtime-settle-check.mjs`** (`npm run settle:check`, docs/) — a committed, on-demand guard that
   fails if any representative slide churns at rest. It turns the runtime's own "must settle" comments
   (`dispatchPostMutation`, `patchSectionGeometry`, the overflow watcher) into an enforceable check, so
   a *future* regression that reintroduces the perpetual loop is caught, not shipped.
2. **The perf overlay's FPS metric now rates against the display's OWN ceiling** (the max FPS seen this
   session, mirroring how MEM rates against the heap limit) instead of a fixed 60 band — so a steady 30
   on a 30Hz/throttled device reads healthy, and only FPS dropping *below its own ceiling* flags. The
   metric copy now says so. This is the fix for the actual user-facing problem: the overlay was
   flagging the device refresh rate as if it were jank, which is what triggered this whole hunt.

If a real on-device at-rest oscillation is ever found (a specific slide/finish/animation not covered
here), `settle:check` is the harness to capture it, and only THEN does the export-gated runtime
hardening (hysteresis on `TOL`, coarser `--_sec-1cqi`) become warranted.

## Second adversarial trio — verifying the fix (HARD RULE #25)

Because the fix touches shared renderer lifecycle + the service worker (real blast radius),
a second full trio (red team + Munger inversion + independent checker) was run **against the
diff itself**. Both fixes verified SOUND and every doc claim TRUE, but the trio found real
hardening the first pass missed — folded in before merge:

- **In-flight `renderInto` re-rooted the host after `dispose()` (Munger, top finding).** `renderInto`
  is async (awaits theme fetch + engine render); an unmount landing mid-render let the settling
  continuation re-run `scaleTargets.set(host,…)` + `ownedObservers.add(...)` *after* `dispose()`
  emptied them — re-rooting the detached iframe on the exact HeroPreview tab-flip surface the fix
  targets (degrading it from deterministic to opportunistic teardown). **Fixed:** a `disposed` latch;
  the continuation bails (before any DOM work) if `disposed || !host.isConnected`. Tested both the
  during-render and before-continuation guards.
- **`specimen.js` `pagehide` broke bfcache restore (red team + Munger).** `pagehide` fires with
  `persisted:true` on a bfcache freeze; disposing then left a restored preview dead (no theme
  observer / resize refit), and it prevented **no** leak (a real unload frees the heap anyway; the
  soft-nav leak is covered by `astro:before-swap`). **Fixed:** skip teardown when `event.persisted`.
- **`dispose()` left the `onThemeChange` debounce timer + the `whenReady` poll armed (red team +
  checker).** **Fixed:** theme watchers are torn down via their own unsubscribe (clears the debounce);
  the `whenReady` fallback `setInterval` is tracked in `ownedIntervals` and cleared.
- **Tests asserted wiring, not release (red team + checker).** **Fixed:** a new
  `single-slide-render.dispose.test.ts` exercises the REAL `dispose()` (RO/MO actually disconnected,
  idempotent, and the in-flight latch), and the SW test gained the self-skip (re-cache same hash) case.
- **SW cross-deploy-tab last-writer-wins (red team + Munger, LOW).** Two tabs straddling a deploy can
  evict each other's same-suffix copies; SWR re-fetches, so no breakage — documented as an accepted
  tradeoff in `sw.js`, no code change.

Rejected by the trio (not real): self-eviction of the current asset; `scaleTargets` deletion breaking
drag resume; `installVideoBridge`/`fr.onload`/scheduler-watchdog rooting the iframe; the `owned*` Sets
growing unbounded; a `FieldCardsLive`/`RestyleShowcase` null-crash. **StrictMode reuse-after-dispose**
was raised but confirmed **not triggered** — Astro's `react()` enables no StrictMode and every
"StrictMode-safe" reference is a defensive single-init guard; production remounts build a fresh renderer.
The `disposed` latch makes even that path safe (renderInto no-ops after dispose).

## Files
`docs/src/lib/single-slide-render.ts` (dispose + onThemeChange unsubscribe), `docs/src/components/DeckPreview.tsx`,
`docs/src/components/landing/FieldCardsLive.tsx`, `docs/src/components/landing/RestyleShowcase.tsx`,
`docs/src/playground/specimen.js` (teardown), `docs/public/sw.js` (version eviction). Tests:
`docs/src/components/DeckPreview.test.tsx` (dispose-on-unmount), `docs/src/lib/sw-version-evict.test.ts`.
