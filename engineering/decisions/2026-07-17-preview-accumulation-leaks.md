---
status: shipped
summary: (Leak fixes shipped; the runtime FPS=30 hardening is an evidence-gated open follow-up, tracked in the body.) An adversarial trio (red-team leak hunt + Munger inversion + across-refresh storage audit, then an independent checker) traced a field report of "the live preview degrades the longer a session runs AND across multiple refreshes; FPS pinned at 30." Verdict — the docs/src preview path is mostly well-defended; the REAL, confirmed accumulation is (1) createSingleSlideRenderer had no dispose(), so remounting hosts leaked a parsed ~560KB theme iframe each cycle; (2) specimen.js's onThemeChange MutationObserver on the immortal documentElement was never disconnected; (3) the service worker never version-evicted old content-hashed assets, bloating Cache Storage across deploys. All three FIXED here. The most-likely FPS=30 cause — a runtime rAF↔MutationObserver loop that never idles if a per-frame geometry/overflow write oscillates — is a GUARDED risk that can't be confirmed by static analysis; it needs on-device instrumentation before touching the shared runtime (export-sensitive), so it's a scoped follow-up, NOT shipped blind.
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

### Primary FPS=30 suspect — PLAUSIBLE, unconfirmed, NOT fixed here

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

## The follow-up (evidence-gated, separate change)

Do NOT harden the runtime loop blind: `lib/runtime/index.js` is the shared engine runtime and
feeds the **HTML-player export**, so a geometry/overflow change alters exported bytes → export
sign-off gate (QUALITY BAR) + real-device verification. Sequence:
1. **Instrument** — count `dispatchPostMutation` invocations on a *resting* (non-typing) preview;
   non-zero at rest ⇒ a guard is oscillating (confirms FPS=30 on the real device, HARD RULE #23).
2. **Harden** only what the evidence implicates — hysteresis on the `TOL` overflow flip, coarser
   `--_sec-1cqi` quantization, and/or a periodic forced full write every N patches to reset
   accumulated in-iframe state — then render a demo deck in both modes for export sign-off.

## Files
`docs/src/lib/single-slide-render.ts` (dispose + onThemeChange unsubscribe), `docs/src/components/DeckPreview.tsx`,
`docs/src/components/landing/FieldCardsLive.tsx`, `docs/src/components/landing/RestyleShowcase.tsx`,
`docs/src/playground/specimen.js` (teardown), `docs/public/sw.js` (version eviction). Tests:
`docs/src/components/DeckPreview.test.tsx` (dispose-on-unmount), `docs/src/lib/sw-version-evict.test.ts`.
