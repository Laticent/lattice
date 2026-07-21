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

## Follow-up — geometry seed (zero-jump hand-off)

The Nacre-only shell fixed the *seam*, but the shell box was a fixed approximation of the app
layout (hardcoded 16:9, `max-width:960`, screen-centered) while the hydrated app's preview box
is deck-ratio, `760`-capped, and lives in the split's right pane — so the shimmer visibly
**jumped** (position + size) at hand-off, worst on **tablet** (where the app uses the two-pane
split the shell didn't reproduce at all). An adversarial trio flagged this as inherent to a
*fixed*-geometry shell approximating a *variable* app.

Rather than re-derive the app's split/stop/ratio layout in the pre-paint seed (fragile,
guaranteed to drift), the shell now **replays the app's OWN measured box rect**:

1. `StudioShell` persists the live preview box (`previewBoxRef`) on `pagehide` /
   `visibilitychange→hidden` as **viewport fractions** (`{l,t,w,h}`) under
   `lattice-studio-preview-rect`. Geometry only — no slide content (the skeleton stays
   Nacre-only and state-blind). Skipped while Present is open or the box is parked/0-size.
2. The `studio.astro` seed script resolves that rect to **px in the current viewport** (not
   `vw/vh` units, so it matches whatever the app measures now), clamps it on-screen, and sets
   `--sb-*` + `data-ssr-rect`. The shell CSS then positions the Nacre box **absolutely** at
   that rect (its containing block is the `position:fixed` shell = the viewport).
3. No saved rect (newcomer, or the one transitional reload right after this ships) → the CSS
   falls back to a **centered full-bleed** box at the **deck's author-chosen aspect** — the
   seed resolves the active deck's `size:` the same way the app does (front-matter → the
   shared `SIZE_RATIO`, resting on the engine's own 16:9 only when a deck names no size), and
   the box fits the stage via container-query units so it letterboxes correctly for *any*
   aspect (square/portrait bind on height, landscape on width). Topbar corrected `52→54px`,
   the `960` cap removed. Slides have chosen sizes — the skeleton never assumes 16:9. The
   `SIZE_RATIO` map is now a single source of truth (`slide-size.ts`) shared by the app
   (`previewRatio`) and this seed, so the two can't drift.

Because the shell reimplements none of the layout math and just replays the app's own number,
it **cannot drift** from the app. A future layout change moves the persisted rect automatically.

**Verified** (WebKit, real build, `astro preview`) at desktop/tablet/mobile: on a same-device
reload the shell box lands **pixel-identical** to the hydrated app box (`dx=dy=dw=dh=0` at all
three widths); the newcomer fallback is within a few px on mobile/tablet and ~50px on desktop
(vs. the old ~380px cap-shrink). Real iOS Safari confirmation still pending per HARD RULE #23
(headless WebKit can't reproduce the URL-bar reflow that shifts `innerHeight` between the seed
and hydration; the on-screen clamp and same-viewport px resolution bound that error).

## Follow-up 2 — computed rect (option B): the box size is a function, not a measurement

Rect-replay works but exposes a deeper truth surfaced in review: the preview box has **no
explicit size** — the app derives it by laying out a flex chain (`container-type:size` +
`width: min(100%, 100cqh × ratio, 760px)`) and then **measuring** the result to place the
hoisted host. That is the root of two fragilities: the shell can't measure pre-hydration (so
it must replay), and the `100cqh` cross-axis dependency is what makes the red team's 0-width
collapse possible (a measured height of 0 → a 0 width).

**The box rect is actually a closed-form function of known inputs** — viewport, breakpoint,
stop (read/write), the editor|preview split share, the deck ratio, and a handful of CSS-fixed
chrome constants (topbar 54, mobile bar 53, holder pad 20/16, read chrome 0/49, write chrome
47/81.6, cap 760). `computePreviewRect()` (`preview-rect.ts`) implements it, and a probe of the
live app across the breakpoint × stop matrix confirms it reproduces the measured box to
**≤0.1px**. A `preview-rect.test.ts` fixture locks the constants so app-side drift fails a gate.

The shell now **computes** its box when there is no persisted rect (a brand-new visitor, a
cross-device first load) instead of falling back to the approximate centered box — verified
zero-jump on a FIRST load (read 0px all breakpoints; write split ≤1px at the default split,
exact once the persisted split is read). The geometry chain is: **persisted rect (replay,
exact, covers the Build stop's panels) → computed rect (exact for read/write/mobile) →
ratio-only CSS fallback**. Not yet modeled: the Build stop's side panels and the landscape-phone
cinema (replay still covers a returning visitor there).

The larger prize this unlocks (not yet taken): if the **app** and the **engine host** consumed
`computePreviewRect()` too — setting the box explicitly instead of measuring `100cqh` — the
measured-flex 0-collapse class of bug (red team #2) would be eliminated at the root, and all
three surfaces would share one source of truth. That is a StudioShell rendering change, tracked
as the next step.

## Files

`docs/src/pages/studio.astro` (Nacre-only shell + geometry + ratio seed + rect-replay/compute CSS),
`docs/src/components/studio/slide-size.ts` (shared SIZE_RATIO source of truth),
`docs/src/components/studio/preview-rect.ts` + `preview-rect.test.ts` (computePreviewRect: the
closed-form box rect, shared by the shell; validated ≤0.1px vs the live app),
`docs/src/components/studio/StudioShell.tsx`
(decoupled dismissal, removed Studio snapshot capture, persist preview-box rect on unload,
import shared `sizeRatio`),
`docs/src/components/DeckPreview.tsx` (skeleton reveal-watcher + anti-stuck floor),
`docs/src/lib/single-slide-render.ts` (content-driven reveal, no force-reveal of a broken
frame), `docs/src/components/studio/use-shared-preview-slot.ts` (on-screen size/position
clamp), `docs/scripts/check-studio-shell.mjs` (gate updated to the Nacre-only markers).
