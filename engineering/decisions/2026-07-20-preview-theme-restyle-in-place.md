---
status: shipped
summary: >
  Fixes the one real leak the corrected Studio audit found: a theme / palette / mode change
  re-rendered every live preview by REWRITING the iframe's whole `srcdoc`, which keeps the same
  <iframe> element but mints a fresh document + JS realm each time; the detached realms accumulate
  (~1.3MB per toggle across the live previews — the peak-memory driver of iOS tab-discard). Adds a
  RESTYLE fast path to single-slide-render: when only the theme/mode/palette changed (frame box +
  mermaid unchanged), swap the resident `<style id="lattice-theme">` textContent in place + patch the
  body — same iframe, same realm, restyled. No srcdoc rewrite, no new realm. Measured clean on
  landing (12 palette toggles, double-GC): heap growth +1.32MB/cyc → +0.17MB/cyc (~88% eliminated),
  nodes/frames/documents flat; visually verified the palette AND dark-mode both re-color correctly
  across all 7 live previews. Falls through to a full write only when there is no live doc, a write is
  still in flight, or the frame box / mermaid changed (which the resident <style>/<script> can't express).
---

# Preview theme-restyle in place — kill the theme-toggle realm churn

## The leak (from the corrected audit)

`2026-07-20-studio-audit-instrument-fix.md` isolated the one real, instrument-independent leak: a
theme / palette / mode change. Every live preview (`DeckPreview` → `single-slide-render.renderInto`)
re-renders on such a change, and the render **rewrote the iframe's entire `srcdoc`**. A srcdoc rewrite
keeps the same `<iframe>` element (so the frame count stays flat) but replaces its `document` and JS
**realm**; the outgoing realm detaches but is not collected (the element is still mounted, so React
never disposes it), and the detached realms accumulate — ~1.3MB per toggle across the live previews,
climbing to ~94MB over 40 toggles. Per the audit's iOS inversion, that peak footprint is what drives
the OS tab-discard the whole investigation was chasing.

The engine's theme caches are NOT the culprit — `ThemeStore.byName` is keyed by theme name and
overwrites; `_cssCache` is cleared on every `add()`. Both are bounded. The churn is the **realm**, not
a Map.

## The fix — a RESTYLE fast path between patch and full write

`single-slide-render.ts` already had two render regimes: `patch` (swap only the `.lattice` body when
the whole render signature is unchanged — the typing fast path) and `write` (rebuild the whole srcdoc).
A theme/mode change misses the patch signature (`theme|mode` are in it) and fell through to a full write.

This adds a third regime, `restyle`, sitting between them:

- The srcdoc's theme CSS is baked into ONE `<style>`; it now carries `id="lattice-theme"`, and its inner
  text is built by a shared `themeStyleContent()` helper (used by both `srcdoc()` and the restyle path,
  so they can never drift).
- A new `restyleSig = `${geom}|${mermaid}`` fingerprints only what a theme change CANNOT re-render in
  place: the frame box (sizes the `<style>`'s frame CSS + the iframe element) and the mermaid `<script>`
  presence (prop-driven, can't be injected post-hoc). Theme, mode, composed CSS, and author `extraCss`
  all bake into the swappable `<style>`, so they are deliberately absent — a change in any of them keeps
  the same restyleSig, hits the restyle path, and swaps the `<style>` instead of rewriting.
- When a live doc exists, no write is in flight, `restyleSig` matches, and the doc has both
  `#lattice-theme` and `.lattice`: set `#lattice-theme`.textContent to the new `themeStyleContent(...)`
  and `patchSlideBody(...)` the new section — same iframe, same realm, restyled. Returns `writePath:'restyle'`.
- Falls through to the full write (new realm) only when there is no live doc, a write is in flight, or the
  frame box / mermaid changed.

`__latticeRestyleSig` is stamped on the host by both the full-write path (so the next theme change can
restyle) and the restyle path itself.

## Evidence

Clean measurement (`.scratch` retainer-walk driver, no undisposed handles — see the instrument-fix doc
for why that matters), landing, 12 palette toggles, double-GC:

| landing palette toggle ×12 | heap growth / cyc | nodes | frames | docs |
|---|---|---|---|---|
| **before** (full srcdoc rewrite) | **+1.32 MB** | flat | 12 | 16 |
| **after** (restyle in place) | **+0.17 MB** | flat | 12 | 16 |

~88% of the per-toggle heap churn eliminated. The residual ~0.17MB/cyc is the hero tab-flip remount
transient (a genuine unmount→dispose→remount, collected the next cycle), not the theme churn.

Visually verified on the real built landing page (7 live previews): a palette toggle re-colors every
preview correctly (Indaco `#fff` ↔ Cuoio `#faf7f2`, the `<style>` content swapping each time), and a
dark-mode toggle takes the same path (bg → `rgb(21,17,13)` and back), structure intact. `writePath`
reads `restyle` on those renders.

## Scope / not in scope

- **Preview only.** `single-slide-render` writes the live *preview* srcdoc; it is not the PDF/PPTX/HTML
  export path, so exported bytes are unchanged (no export sign-off gate).
- Mermaid slides and a geometry (`@size`) change still take the full write — correct, since the resident
  `<style>`/`<script>` can't express those in place.
- The typing `patch` path is untouched (it's cheaper — it doesn't recompute the theme CSS).
- **Perf overlay.** `restyle` is a first-class render regime alongside `patch`/`write`, with its own
  `regimeBands` (`perf-metrics.ts`) so the overlay rates a theme toggle honestly instead of against the
  16ms patch budget (a maker-checker finding). Calibrated from a real 4× capture: FRAME median ~23ms,
  max ~84ms (the `<style>` swap is a quick synchronous op; the sheet reparse lands OFF-frame), TOTAL
  median ~186ms, max ~565ms — so its FRAME band sits just above patch and its TOTAL band just below write.
