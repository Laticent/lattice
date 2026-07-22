---
status: shipped
summary: Why a reload is fast in private browsing but slowly degrades in a normal window — the app re-reads, deserializes, and re-scans accumulating client-side state (the Studio's localStorage + the service-worker Cache Storage) on every boot, and private browsing starts each session empty so it never pays that tax. Ships a live STORAGE diagnostic overlay (a debug popup in the PerfOverlay family) that surfaces the origin's quota usage, the localStorage footprint by category, the Cache Storage entry counts, and a live O(n) boot-scan timing, plus a Workspace → Diagnostics toggle. Read-only; the fixes it points at (cache the boot parse, trim the O(n) scans, cheaper SW put) are logged follow-ups.
---

# Storage accumulation — why private browsing reloads faster than a normal window

**Date:** 2026-07-21 · **Status:** SHIPPED (diagnostic overlay) — fixes are follow-ups
**Trigger:** "why is private browsing significantly faster on reload than regular
browsing… refresh 20 times in private and everything loads instantly; do the same
in regular and it's slow and gets slower over time."

## The diagnosis

The counterintuitive part is the tell: private/incognito has a **cold HTTP cache**,
so naively it should be *slower*. That it is *faster* means the accumulated state in
a normal profile costs more than a warm disk cache saves. That inverts the usual
expectation and points at **accumulation**, not the network.

**Private browsing starts every session from an empty, ephemeral client-side store.
A regular profile accumulates persistent state that this app reads, deserializes,
and re-scans on every boot** — so a returning profile pays a tax on each reload that
a fresh incognito window never does, and the tax grows with use ("slower over time").

Two accumulators, both touched on the boot path:

1. **localStorage — the Studio deck store (`docs/src/components/studio/studio-store.ts`).**
   Persists, per deck, across sessions: edited source, up to 25 checkpoints/deck
   (`SNAP_CAP`), up to 60 chat messages/deck (`CHAT_CAP`), chat drafts, review
   comments, and last-slide snapshots. Every boot does work proportional to what's
   accumulated: `loadDeckList()` re-runs `splitSlides(stripFrontMatter(source))` over
   **every deck** on every load, and `hasPriorStudioUse()` / `deckContentStats()` /
   `derivePosture()` do full O(n) `localStorage` scans. Incognito has none of it.

2. **Cache Storage — the service worker (`docs/public/sw.js`).** Stale-while-revalidate
   fires a background `fetch` + `put()` on every asset request even on a cache hit, and
   `put()` enumerates the **whole cache** twice (version-eviction + FIFO cap-trim). With
   a near-full assets cache (cap 300) that's real per-request work every reload. A fresh
   private window's cache is empty, so it skips all of it.

**What it is NOT:** there's no unbounded *per-reload* leak — the caps hold. The
degradation is **accumulation across usage** (more decks, more history, a fuller SW
cache) that the fixed cold-start boot path re-processes each time. This sits on top of
the known cold-start cost (hydration + engine/runtime fetch + 563KB CSS reparse) from
`2026-07-11-preview-performance-diagnosis.md`.

## The decision — make it visible before optimizing it

Folklore ("your profile is full") isn't measurement. Following the perf-overlay
precedent (surface the number on the real device, HARD RULE #23), we ship a **live
STORAGE diagnostic overlay** — a debug popup in the same family as Performance / Viz /
Viewport-debug, reusing the shared draggable chassis (`diagnostic-overlay.tsx`,
`useDiagnosticGate` + `DiagnosticPanel`), so accumulation is a number the user (and we)
can read on the surface where it actually bites.

### What it surfaces
- **quota · used** — origin-wide `navigator.storage.estimate()` usage / quota (counts
  Cache Storage + IndexedDB, not just localStorage). Rated by fraction.
- **local storage · footprint** — total keys + bytes, with a per-category breakdown
  (deck sources, checkpoints, AI chats, chat drafts, review comments, preview
  snapshots, settings & prefs, other origins) and the single largest entry.
- **caches · entries** — the SW's `lattice-v1-{pages,assets,fonts}` bucket entry counts.
- **boot cost · scan** — a **live** timing of a full localStorage *read* enumeration: the
  O(n) cost the boot path pays (`hasPriorStudioUse` / `deckContentStats`), near zero on an
  empty (or private-browsing) store and climbing with accumulation. It is the READ only —
  the per-deck parse the boot adds on top (`splitSlides` / `JSON.parse` in `loadDeckList`)
  is the larger cost and is NOT counted here (counting it would need the Studio import this
  module deliberately avoids), so the row is labeled a floor, not the whole boot. Browsers
  also coarsen `performance.now()` (up to ~100ms under Firefox private browsing), so the
  figure is shown as a coarse threshold (whole ms, "<1ms" floor), never a precise stopwatch.

Each row taps open a plain-language explanation (the debug-popup convention). Off by
default; flipped from **Workspace → General → Diagnostics** or the `?storage` URL param
(shared cross-surface pref `lattice-storage-overlay`, same shape as the other overlays).

### Files
- `docs/src/playground/storage-metrics.ts` — pure, dependency-free reads (localStorage
  scan + categorization + timing; `estimateQuota`; `scanCaches`). No Studio import, so
  the overlay stays light on every surface. Unit-tested (`storage-metrics.test.ts`).
- `docs/src/playground/storage-overlay-prefs.ts` — the shared pref (mirrors
  `perf-overlay-prefs.ts` / `viewport-debug-prefs.ts`). Tested (`…-prefs.test.ts`).
- `docs/src/components/site/StorageOverlay.tsx` + `.astro` — the island + wrapper,
  reusing the chassis + `Sep`. Included via ResourceHints / Header / features (parity
  with PerfOverlay); wiring locked by `StorageOverlay.test.ts`.
- `docs/src/components/studio/WorkspaceSheet.tsx` — the Diagnostics toggle.

### Scope decisions
- **Read-only.** Like the perf/viewport overlays. Clearing already lives in **Workspace
  → Privacy & Data** (`clearAllDecks`); the overlay points there rather than duplicating
  a destructive action (HARD RULE #15).
- **No Drawing Board toggle.** The Drawing Board is FROZEN (Studio succeeds it,
  `2026-07-03-studio-succession.md`); the overlay still works there via ResourceHints +
  `?storage`, but no new switch is added to a frozen surface.
- **Docs-site only.** Nothing about the engine or exported artifact bytes changes.

## Adversarial trio (HARD RULE #25) — applied to the shipped diff

This is a new, human-facing diagnostic whose entire worth is being *trustworthy* about
storage, so it got the full trio (red team + Munger inversion + independent checker) on the
shipped code. The inversion caught the sharpest class of bug — a diagnostic that reassures
you during the slowdown it exists to explain — and its findings were folded back:
- **SCAN over-claimed (Munger, fixed).** It timed only the localStorage *read* but was
  labeled "the same O(n) cost as `loadDeckList`," whose per-deck `splitSlides`/`JSON.parse`
  is the larger, uncounted part. Relabeled honestly as a READ floor (row text, comments,
  CHANGELOG, this doc).
- **Quota chip green-by-construction (Munger, fixed).** `storage.estimate()` returns a
  coarse, padded quota (often GBs; some browsers exclude localStorage from `usage`), so the
  ratio is ~0% however bloated the profile is. Dropped the rating (neutral dot) and added a
  caveat, so it can't show a false "good."
- **SCAN hidden from the glance-view (Munger, fixed).** Added a `scan` chip to the verdict
  strip — the thesis metric now leads instead of being buried.
- **Timer precision faked (Munger, fixed).** `performance.now()` is coarsened (≤100ms under
  Firefox private browsing); `formatMs` now shows whole ms / "<1ms", read as a threshold.
- **Unthrottled `storage` handler (red team, fixed).** A cross-tab write burst could fire
  one full synchronous store scan per write; coalesced to ≤1 rescan per animation frame.
- **Async poll race + hidden-tab churn (checker + red team, fixed).** Added a generation
  guard so a slow scan can't clobber a fresher one, and gated the 1.5s poll on tab visibility.
- **Category drift (Munger/checker, fixed).** The matchers are hand-mirrored from
  studio-store; exported the real prefixes and added a routing test that fails if one drifts.
- Labels made truthful ("other origins" → "other keys"; the `lattice-` catch-all →
  "app state & prefs"); `caches` state renamed to avoid shadowing the global; boundary +
  render tests added. Clean bills: XSS, data-leak (values are never rendered, only key
  names + sizes), ReDoS, cross-origin cache reads.

## Real-device iOS Safari verification (HARD RULE #23) — was UNVERIFIED, now VERIFIED

The build/screenshot verification ran in headless Chromium, so the overlay on **real
iOS Safari** (both normal and private) was explicitly marked UNVERIFIED. User-captured
screenshots on the deployed Cloudflare Pages site (`*.pages.dev`, iPhone, iOS Safari,
normal + private) close that gap and confirm the behavior:
- **It renders + reads correctly on the real device** in both modes — the drag chassis,
  the verdict strip, the breakdown bars, and the tap-for-detail all work.
- **Cache Storage genuinely populates on iOS** (normal: 2 entries just-opened; private:
  113 after browsing) — the row that read `0` in headless dev shows real numbers on device.
- **Two trio predictions confirmed on hardware, and folded into the shipped UI:**
  - *Quota excludes localStorage (Munger #2).* `estimate().usage` read **2.2 KB** while the
    localStorage footprint right below was **278 KB** — iOS Safari omits localStorage from the
    estimate. This is exactly why quota is UNRATED; the quota row now also *detects* the case
    (`usage < footprint`) and says so, turning the contradiction into an insight.
  - *Timer is coarsened (Munger #4).* SCAN read **0ms** on device (iOS clamps
    `performance.now()`), so the honest whole-ms / "<1ms" formatting was right — a decimal
    would have faked precision the clock doesn't have.
- **Surfaced one real bug, fixed:** quotas are disk-scale (~**38 GB** on the device), and
  `formatBytes` topped out at MB → it printed an unreadable "39321.6 MB". Added a GB tier.

Note the screenshots are point-in-time (a freshly-opened normal window had fewer cached
assets than a browsed-around private one), so they verify the *overlay*, not the long-term
accumulation curve — that still wants a genuinely aged profile to display in full.

## Logged follow-ups (#18) — the fixes the overlay makes measurable

Not in this change (which is the diagnostic); each wants HARD RULE #19 before/after
evidence, now capturable via the overlay's SCAN readout:
- **Cache the boot parse** — `loadDeckList()` re-`splitSlides` every deck on every load;
  only the active/boot deck needs full parsing at boot.
- **Trim the O(n) localStorage full-scans** off the hot boot path (`hasPriorStudioUse` /
  `deckContentStats` / `derivePosture`), or memoize them.
- **Cheaper SW `put()`** — skip the double whole-cache enumeration on every hit.

Residual from the trio (lower priority):
- **Full new-prefix drift detection.** The routing test catches a *renamed* studio-store
  prefix; a brand-new content prefix with no exported const still can't fail CI automatically.
  A canonical exported prefix LIST on studio-store (also usable by `deckContentStats` /
  `clearAllDecks`, which enumerate the same set inline) would close it — but that refactors a
  shared file, so it's out of this diagnostic's scope.
- **`deckContentStats` mislabels code-units as "bytes" (×1).** The overlay reports the
  byte-honest ×2; the in-app stat under-reports by half. Fix the label/×2 in studio-store
  (off-path here).
