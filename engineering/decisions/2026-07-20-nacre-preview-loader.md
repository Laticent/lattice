---
status: shipped
summary: The Studio live preview flashed a blank card while there was no slide to paint yet (cold boot, reload, the post-hydration gap while the ~505KB engine loads). We fill that "no slide yet" moment with a screen-only animated finish — Nacre — picked via the design-competition workflow and several rounds of user art direction, scored 9.3 against three pure-CSS alternatives (metaballs, oil-slick, @property-mesh). Nacre breaks the three ceilings that capped the others at ~7.5 — Performance (blur+hue-rotate are STATIC filters rasterized once; only transform:rotate animates, so the compositor spins cached bitmaps with no per-frame re-blur), fake iridescence (three co-present hues counter-rotate for spatially-varying nacre, not a global hue-swing), and dead spots (continuous rotation never stops). SHIPPED as an opt-in DeckPreview `loader` prop enabled only on the Studio's shared preview; palette-blind off the docs-root --accent/--bg tokens; screen→multiply blend flip keeps it visible on light grounds; prefers-reduced-motion freezes it. Preview-only — exported bytes unchanged. Verified in the real built Studio (dark+light indaco). TRACKED FOLLOW-UPS: iOS on-device perf sign-off (UNVERIFIED per HARD RULE #23 — the perf argument is reasoning about compositing, not a device measurement) and a pre-hydration instant-shell nacre variant for the returning-no-match blank.
---

# Nacre preview loader — a living "no slide yet" atmosphere for the Studio

**Date:** 2026-07-20 · **Status:** SHIPPED (live-preview integration). Instant-shell
integration + real-device perf sign-off are the tracked fast-follows below.

## Problem

The Studio live preview shows a **blank card** while there is no slide to paint yet —
cold boot, reload, the first render after hydration. The returning-visitor snapshot
replay (`docs/src/playground/snapshot-cache.js`, hardened 2026-07-20) covers users whose
last slide can be replayed pre-hydration, but the *genuinely empty* moments — a first-ever
visit, a returning user whose snapshot doesn't match, the post-hydration gap while the
~505KB engine bundle loads and renders — still flash blank. On a slow phone that gap is
seconds long. We wanted that unavoidable moment to be **beautiful and on-brand** instead of
dead space.

## What we chose

A **screen-only animated "finish"** in the preview pane. Finishes (`lib/base/base.finish.css`)
are deliberately static because they must export clean to PDF — but the preview pane never
exports, so it is free to animate. This is NOT a change to the finish system; it borrows the
finish *look* on a new screen-only surface.

The design was picked via the `design-competition` workflow (5 tracks) → the user narrowed to
a continuously-animated loader ("the moving finish IS the skeleton") → then several rounds of
art direction landed on **Nacre**, scored 9.3 against three alternatives (metaballs, oil-slick,
@property-mesh; see the scored artifact in the session).

## The technique — why Nacre beat the others

Three earlier pure-CSS approaches all capped at ~7.5, held back by the SAME three ceilings:

1. **Performance.** They animated *under* a live `filter: blur()` (and some `scale()`), which
   forces a full re-rasterization every frame — the one thing you can't afford while the page
   is hydrating.
2. **Fake iridescence.** A *global* `hue-rotate` swings every pixel's hue together — reads as
   "the color is changing," not nacre. Real iridescence is spatially varying.
3. **Dead spots.** `ease-in-out alternate` slows to a near-stop at each end — looks frozen in a
   2-second window.

**Nacre breaks all three at once.** Three layers, each a set of soft accent blobs, each carrying
a *different* hue (accent, +34°, −28° via a **static** `hue-rotate` filter), **counter-rotate**
at coprime speeds:

- `blur` + `hue-rotate` are static filters → **rasterized once per layer**; only `transform:
  rotate` animates, so the compositor spins **cached bitmaps** with no per-frame re-blur and no
  scale. Cheap enough to run during hydration. (Performance 5 → 9.)
- Three co-present hues whose overlaps continuously remix → **genuine spatially-varying
  iridescence** (nacre), not a global swing. (Iridescence 6 → 9.)
- Continuous rotation **never stops** → always reads alive in the ~2s window. (No dead spot.)

Palette-blind: every color is `color-mix()` of the docs-root `--accent` / `--bg` tokens (set per
`html[data-palette][data-mode]` before first paint), so it auto-matches all palettes + dark/light.
Light mode flips the layer blend `screen → multiply` so the cloud darkens the bright sky instead of
washing out to white. `prefers-reduced-motion` freezes it to a calm static nacre.

## Integration

- **CSS:** `docs/src/styles/nacre-loader.css` (`.nacre-loader` + BEM parts).
- **Live preview:** `DeckPreview` gains an opt-in `loader` prop. When set, it mounts the nacre as a
  single stable child *behind* the imperatively-appended `iframe.live`; the engine appends the iframe
  after it, so the opaque slide paints on top and covers it. On the first successful paint the loader
  flips to `is-done` — a 0.5s opacity fade **and** `animation: none` to stop the GPU work the instant
  the slide takes over. Enabled only on the Studio's shared preview (`StudioShell.tsx`); landing /
  showcase hosts render a known static sample and opt out.

Verified in the real built Studio (headless Chromium, dark + light indaco): the loader renders with
the live tokens and the fade/freeze hand-off fires on first paint.

## Honest gaps (tracked)

- **iOS is UNVERIFIED (HARD RULE #23).** The perf argument (transform-only over cached bitmaps) is
  reasoning about how compositing works, not a measurement on a real iPhone during real hydration.
  Confirming it on-device — or finding it needs a tweak (e.g. a smaller blur radius) — is what earns
  the "Performance 10 / honest 9.5." Do this before calling it done for mobile.
- **Pre-hydration instant-shell — DONE (2026-07-21).** This React loader only exists *after*
  hydration, so it covers the post-hydration render gap. A returning user whose snapshot doesn't
  match used to still see a blank *pre-hydration* card — the exact blank-on-reload reported on the
  user's iPhone (dark mode → newcomer instant-shell is gated to indaco+light, and no matching
  snapshot → the shell stayed `display:none` = blank). The fast-follow is now shipped: `studio.astro`
  inlines the nacre (scoped `SHELL_NACRE_CSS` + an `<template id="ssr-nacre">`) and `REPLAY_JS` drops
  it into `#ssr-slidebox` as the **universal fallback** whenever neither the snapshot nor the newcomer
  path fires, then flips `data-ssr-shell="on"`. So every reload now paints *something* immediately —
  cached slide, welcome slide, or nacre — with zero dependence on the live preview or iOS timing, and
  it's torn down with the shell by `dismissSsrShell`. Palette-blind via the render-blocking
  `--accent`/`--bg` tokens. Verified in the production `dist` build under Playwright WebKit (iPhone 13,
  dark mode, returning user, no snapshot): blank → animating indaco-dark nacre card (359×202) → shell
  torn down after hydration. (The live-preview render bug on real iOS Safari remains separately
  UNVERIFIED per below — this fallback makes the *load window* never blank regardless.)
- **Light-mode intensity** is a touch bold on some palettes; a blob-alpha trim is a cheap tuning pass.

## Files

`docs/src/styles/nacre-loader.css`, `docs/src/components/DeckPreview.tsx`,
`docs/src/components/studio/StudioShell.tsx`, `docs/src/pages/studio.astro` (pre-hydration
instant-shell fallback).
