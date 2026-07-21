---
status: shipped
summary: On a real iPhone the Studio preview repeatedly showed a broken loading state — the slide in the top half, the Nacre shimmer bleeding into the bottom with a seam down the middle, sometimes huge/shoved/blank. Two independent expert teardowns (React/architecture + UI/UX) found the root cause was ARCHITECTURAL, not a timing bug: THREE placeholder/preview surfaces drew into the preview area during load — the SSR instant-shell (which painted a REAL cached-last-slide or a build-time welcome slide), the hoisted position:fixed live host (Nacre), and the live iframe — living in TWO different coordinate systems (the SSR slide centered in the full viewport vs the host over the app's preview box), with the shell's dismissal gated on the live-iframe reveal that iOS drops. The opaque z-15 host Nacre covered its own rect while the z-1 SSR real slide showed through everywhere else → the seam. Fix (user-directed "strip to the bare minimum, Nacre as the only skeleton"): make the instant-shell NACRE-ONLY (retire the snapshot replay + the SSG welcome slide — one 16:9 box, palette-blind, shown to every visitor); decouple shell dismissal from the flaky reveal (dismiss when the app's OWN identical Nacre host is visible); make the preview box a reliably-contained 16:9 (fix previewFitByHeight's default so a portrait phone is width-bound, not stuck height-bound tall → the Nacre no longer bleeds into a letterbox); keep the live iframe revealing ONLY when genuinely good (content-painted + width-scaled + on-screen clamp). One surface, one coordinate system, one honest signal — the seam is structurally impossible. The shared hoisted host is KEPT (desktop warm editor↔Present hand-off); snapshot-cache.js is KEPT (the Playground still uses it) — only the Studio's usage is removed. Verified in WebKit (iPhone): instant shell is Nacre-only in a 1.78 box, no two-surface overlap, clean reveal to a centered 16:9 slide. iOS on-device confirmation pending per HARD RULE #23.
---

# Studio preview — one skeleton, no seam

**Date:** 2026-07-21 · **Status:** SHIPPED

## Symptom

On a real iPhone (Safari, portrait), reloading the Studio repeatedly produced a **broken
loading state**: the real slide rendered in the *top* portion of the preview while a separate
Nacre shimmer bled into the *bottom* with a **seam down the middle** — and intermittently the
card was huge, shoved off the right edge, or blank. Timing patches (reveal-on-content instead
of the flaky iOS `onload`, an on-screen size/position clamp) removed the blank and the shove
but never the seam, because the seam is not a timing bug.

## Root cause (two independent expert teardowns)

**Three surfaces, two coordinate systems.** During load, up to three things drew a "preview":

1. the **SSR instant-shell** (`studio.astro`) — which painted a **real slide**: a returning
   visitor's cached last slide (snapshot replay) or a build-time welcome slide, centered in
   the **full viewport**, `z-1`;
2. the **hoisted `position:fixed` live host** (`StudioShell` + `use-shared-preview-slot`) —
   showing the **Nacre**, positioned over the **app's preview box** (below the header +
   toolbar + padding), `z-15`;
3. the **live iframe** inside that host.

The two rectangles cannot coincide. The opaque `z-15` host Nacre covered *its* box; the `z-1`
SSR real slide showed through everywhere else, and the edge between them **was the seam.** It
was guaranteed whenever the live reveal was slow (the common iOS case), because the shell only
dismissed on the live-iframe reveal — the exact signal iOS drops. A too-tall preview box
(from a `previewFitByHeight` default race) added Nacre bleeding into the letterbox below the
16:9 slide.

## Decision — strip to one skeleton

User direction: *"strip things to the bare minimum and just have Nacre as the only skeleton."*

1. **Nacre-only instant-shell.** Retired the snapshot-replay and the SSG welcome slide. The
   pre-hydration shell is now a single palette-blind Nacre in one contained 16:9 box, shown
   to **every** visitor. It can never be a real slide that mismatches the live one.
2. **One contained 16:9 box.** The Nacre fills only the slide's 16:9 rect; the letterbox
   around it is flat shell background, never Nacre. Fixed `previewFitByHeight`'s default
   (computed from the initial window aspect) so a portrait phone is width-bound instead of
   stuck height-bound-tall until a measure that iOS can skip.
3. **Decoupled dismissal.** The shell dismisses when the app's OWN (identical) Nacre host is
   visible — not on the live-iframe reveal — so there is no window where two surfaces coexist.
4. **Reveal only when good** (kept from the prior fix): the live iframe is revealed only once
   its slide has painted AND scaled to a real width, and the host clamp keeps it on-screen;
   the loader fades on that reveal. A broken/racing render is never exposed.

**Kept deliberately:** the shared hoisted host (desktop's warm editor↔Present hand-off is
worth it); `snapshot-cache.js` (the **Playground** still uses it — only the Studio's capture +
replay were removed); `ssg-first-slide.mjs` (used by `critical-css.mjs`).

## Verification

WebKit (iPhone 13, dark): the instant shell shows **Nacre only** (no `.lattice`) in a **1.78
(16:9) box**; **no two-surface overlap** across the load; the sequence is `shell up (nacre) →
shell dismissed → live slide revealed`, ending on a clean centered 16:9 card. Real iOS Safari
confirmation is pending per HARD RULE #23 (headless WebKit can't reproduce the URL-bar reflow).

## Files

`docs/src/pages/studio.astro` (Nacre-only shell), `docs/src/components/studio/StudioShell.tsx`
(decoupled dismissal, removed Studio snapshot capture, `previewFitByHeight` default),
`docs/src/components/DeckPreview.tsx` (skeleton reveal-watcher + anti-stuck floor),
`docs/src/lib/single-slide-render.ts` (content-driven reveal, no force-reveal of a broken
frame), `docs/src/components/studio/use-shared-preview-slot.ts` (on-screen size/position
clamp), `docs/scripts/check-studio-shell.mjs` (gate updated to the Nacre-only markers).
