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
- **boot cost · scan** — a **live** timing of a full localStorage enumeration: the same
  O(n) read the boot path pays, near zero on an empty (or private-browsing) store and
  climbing with accumulation. This is the degradation, quantified.

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

## Logged follow-ups (#18) — the fixes the overlay makes measurable

Not in this change (which is the diagnostic); each wants HARD RULE #19 before/after
evidence, now capturable via the overlay's SCAN readout:
- **Cache the boot parse** — `loadDeckList()` re-`splitSlides` every deck on every load;
  only the active/boot deck needs full parsing at boot.
- **Trim the O(n) localStorage full-scans** off the hot boot path (`hasPriorStudioUse` /
  `deckContentStats` / `derivePosture`), or memoize them.
- **Cheaper SW `put()`** — skip the double whole-cache enumeration on every hit.
