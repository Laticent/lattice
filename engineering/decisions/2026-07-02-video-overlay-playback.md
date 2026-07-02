---
status: in-progress
summary: Play an embedded video IN PLACE in the live preview by mounting the player in the PARENT document, over the poster — never an iframe inside the slide. The slide preview is a same-origin, transform-scaled `srcdoc` iframe where (a) `sanitizeSlideHtml` strips every `<iframe>` (HARD RULE #22) and (b) iOS mishandles nested/scaled iframes (the preview trap catalog). The parent-hosted player sidesteps both — the same pattern as the debug-overlay capture surface and chart-interact. The in-iframe link guard calls `window.__videoPlay(poster)` on a `.video-poster` tap; the parent builds an ALLOW-LISTED provider embed (`embedSrc` — a nocookie/player URL from the parsed video id ONLY, never the raw href) and positions a real `<iframe>` player over the poster's mapped rect. Returns true → the guard suppresses navigation; false (no overlay / non-embeddable provider) → falls back to opening a tab. Export is untouched (static poster stays in PDF/PPTX); playback is a live-preview enhancement. Prototype: YouTube + Vimeo, Playground only; on-device iOS confirmation gates the roll-out to Present/Studio.
last-updated: 2026-07-02
companion:
  - ./2026-07-01-debug-bounding-boxes.md
  - ./2026-07-02-preview-iframe-vs-shadow-dom.md
  - ./2026-07-02-video-component.md
---

# Embedded video playback — a parent-hosted player overlay

**Date:** 2026-07-02
**Status:** In progress — prototype (YouTube/Vimeo on the Playground) for on-device iOS confirmation.
**Prompted by:** the owner: "play the embedded video by having an overlay that allows us to do it and not open a new link — we did something similar in the debug bounding box solution. I really want embedded playback on iOS to work."

---

## 1. The constraint that shapes everything

The `video` component is a **static** poster + link + QR by design (`2026-07-02-video-component.md`): the primary output is a PDF (can't play video), and the engine **bars iframes** — `sanitizeSlideHtml` `FORBID_TAGS` includes `iframe`/`object`/`embed` (HARD RULE #22), and the DSL gate rejects them at author time. So a live embed can **never** live inside a slide.

On top of that, the live preview is a **same-origin, transform-scaled `srcdoc` iframe**, and iOS Safari mishandles nested + scaled iframes (the preview trap catalog in `engineering/gotchas.md`).

Two hard walls. Putting the player *inside* the slide loses to both.

## 2. The move: mount the player in the PARENT, over the poster

This is the **debug-overlay / chart-interact pattern** (`2026-07-01-debug-bounding-boxes.md`): the interaction lives on the parent side of the iframe boundary. The player is first-party parent DOM positioned over the poster — so:

- **#22 doesn't apply** — the player is never slide HTML, so it never goes through `sanitizeSlideHtml`. No security exception.
- **iOS touch works** — the player is unscaled parent DOM (the reason the debug capture surface works). And critically, it works **over the scaled filmstrip** — no need for a separate unscaled Present surface.
- **No nested-iframe trap** — the embed isn't inside the srcdoc frame.
- **Export untouched** — the static poster still renders in PDF/PPTX; playback is live-preview-only. "preview === export" holds for the artifact.

## 3. Mechanism

- **Bridge:** the in-iframe link guard (`deck-preview.js`) already intercepts `.video-poster` taps (clicks *do* reach the iframe on iOS — it's touch-move gestures that don't). It now first calls `window.__videoPlay(poster)`; if that returns true (a player mounted) it suppresses navigation, else it falls back to opening a top-level tab (existing behavior — preserved for non-embeddable providers and for surfaces with no overlay, e.g. the Drawing Board).
- **Overlay:** `docs/src/playground/video-overlay.js` `createVideoOverlay({ stage, getFrame })` sets `frame.contentWindow.__videoPlay` per render (like `chartInteract.rebind()`). On a tap it maps the poster's rect (iframe-viewport coords, already transform-scaled) into the parent viewport (`frameRect + posterRect`) and mounts a real `<iframe>` player + backdrop + close over it.
- **Wiring:** `PlaygroundApp.tsx` mounts it beside `createChartInteract` and `rebind()`s after each render.

## 4. Security — why a parent-mounted provider iframe is safe

- **Allow-list + rebuild-from-id.** `embedSrc(href)` only matches known providers and builds the src from the **parsed video id** (`[\w-]{11}` YouTube, `\d+` Vimeo) against a fixed template (`youtube-nocookie.com/embed/{id}`, `player.vimeo.com/video/{id}`). It never uses the raw author href as a src, so an author can't smuggle a `javascript:`/phishing origin (the id charset can't break out). Unit-tested.
- **Cross-origin sandbox.** The provider embed is a different origin, so the browser isolates it *from* the parent — it can't read the OpenRouter key or parent DOM.
- **Bring-your-own-key unaffected** — no `OPEN_ROUTER_KEY` exposure (HARD RULE #24); the embed is a third-party player, nothing more.

## 5. Scope + rollout

- **v1 prototype:** YouTube + Vimeo, **Playground only**. Non-embeddable providers (TikTok/Instagram — JS-widget embeds) keep the poster's plain link.
- **iOS gate:** deploy the Cloudflare preview, confirm on a real iPhone. On-device iteration found the control set matters: a `playsinline` embed is locked by iOS Safari to a small inline player with play/pause only and NO fullscreen (iOS reserves scrubber/volume/fullscreen for its native video player). So we **omit `playsinline`** — on play, iPhone hands off to the native fullscreen video player with the full control set, still in-page. Desktop is unaffected (inline, full controls). Cannot be verified from the headless sandbox (HARD RULE #23).
- **Increment 2 (this follow-up):** the player is now a MODULE-LEVEL SINGLETON with an `installVideoBridge(win)` entry, so any preview builder can carry it. Wired into the **Studio** (`single-slide-render.ts` — its own srcdoc now injects the shared `linkGuardAgent`, which also fixes the external-link-tap-blank on that surface, and installs the bridge on frame load). Added **TikTok** (its official `player/v1/{id}` iframe — UNVERIFIED on-device, poster-link fallback covers it). **Instagram** stays a poster + link (no public iframe player; we won't load their JS widget into the parent). Lightbox polish: `role="dialog"`/`aria-modal`, fade-in, background-scroll lock, focus the close button + restore focus. Owner-scoped this increment to **Studio only** (not the Drawing Board / Present / Practice filmstrips) — those remain a later follow-up.
- **Still deferred:** Drawing Board + Present + Practice playback; Instagram (would need their widget); richer positioning.

## 6. Decision

**Parent-hosted player overlay, allow-listed providers, singleton player shared across surfaces.** It's the only place the player can live that satisfies #22 AND the iOS constraints, and it reuses a pattern already proven on-device. Playback is a live enhancement; the static poster remains the export contract. Rolled out Playground (verified on iPhone) → Studio; other surfaces follow on demand.
