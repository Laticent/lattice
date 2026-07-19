---
status: shipped
summary: >
  Present mode rendered its own second DeckPreview iframe, so opening Present paid a cold
  srcdoc WRITE (~637ms local / ~2340ms on a slow phone) before the first slide showed
  (navigation was already a ~2ms patch — only OPEN was slow). Eliminated the second iframe:
  ONE hoisted DeckPreview lives at the studio root in a position:fixed host, positioned
  ("portal-by-positioning", never reparented — moving an iframe reloads it) into whichever
  SLOT is active — the editor pane's slot, or Present's slot when open. Opening Present from
  compose is now a warm PATCH/no-op (0 renders). A first "prewarm the second iframe" attempt
  was KILLED by an adversarial trio (second ~560KB theme iframe resident all session; theme-
  audition double-writes; invisible Anima loops) and dropped. The reshape's own trio confirmed
  the core sound (independently reproduced: open = 0 writes, exactly one iframe.live, nav still
  patches, editor flow unregressed, 818 tests) and caught two seam defects — both fixed:
  a Fabricate-exit that discarded unsaved fabrication work, and a snapshot-capture that could
  stamp a present-lens slide as an editor slide.
---

# Present — share ONE warm preview iframe with the editor

**Date:** 2026-07-19 · **Status:** shipped
**Trigger:** on-device (`lattice.style`) the Present HUD showed a red TOTAL/FRAME REBUILD
(~2340ms) on opening Present, while the rest of the app was sub-second (the cold-load program,
`2026-07-19-preview-bundle-hljs-common.md` + `2026-07-19-defer-editor-hydration.md`).

## Root cause
`PresentOverlay` rendered its OWN `DeckPreview` (a second engine iframe), so opening Present
mounted it fresh → a cold `srcdoc` write (parse the 563KB theme CSS + boot the runtime in a
new iframe): ~637ms local, ~2340ms on the device. Navigation was already a ~2ms patch — only
the *open* was slow. The Studio already had a warm preview iframe (the editor's inline one);
Present spun up a redundant second.

## The rejected first attempt (prewarm) — recorded so it's not re-tried
"Prewarm the second iframe" (render it hidden after idle so open is instant) was implemented,
then KILLED by the adversarial trio: a second always-mounted `DeckPreview` holds a second
~560KB theme iframe resident all session (memory on the exact low-end phone this targets);
theme/palette/mode/finish edits drove a hidden *uncoalesced* background WRITE (doubling a hot
Studio interaction); and an Anima `scene` on the warmed slide played its rAF loop invisibly
behind the editor. The reshape avoids all three by construction — there is no second iframe.

## The reshape: one hoisted shared preview
Because relocating an `<iframe>` in the DOM RELOADS it, the shared iframe host NEVER moves in
the tree. It is a `position:fixed` sibling of the studio root, repositioned to overlay whichever
SLOT is active ("portal-by-positioning"):

- **`use-shared-preview-slot.ts`** (new controller): measures the active slot's
  `getBoundingClientRect` and writes `top/left/width/height/visibility` to the host; re-measures
  via `ResizeObserver` (slot + root) + window resize + capture-phase scroll, rAF-debounced (so it
  can't double-fit against `scaleFrame`'s own observer); synchronous pre-paint first placement on
  every slot switch; suspends during split-drag; explicit hide-when-parked (Fabricate / mobile
  edit pane / collapsed); a dev-only assertion warns if a transformed/`contain` ancestor ever
  appears (that would break `position:fixed` — Crux A).
- **StudioShell** hoists the ONE `DeckPreview` at the studio root (always mounted → warm in every
  path incl. Fabricate); the editor pane renders an empty `editorSlotRef`; Present publishes its
  current slide upward (`onPresentSlide` → `presentPreview`), and the host's `sample` is
  `presentOpen ? present slide : editor slide`. **`mermaid` is unified** to `hasMermaid(shown slide)`
  for both surfaces (the old Present hardcoded `mermaid={false}`, which under one shared iframe
  would flip the frame signature and force a write on open). Palette/theme/mode/extraCss were
  already identical across both.
- **PresentOverlay** renders an empty `slotRef` + its chrome as three layered `fixed` siblings
  (backdrop z-100 · shared host z-101 · chrome z-102 `pointer-events-none` with per-control
  `pointer-events-auto` and a transparent slide region so taps reach the host). Present's `idx`
  lazy-inits to `startIndex` to kill a one-frame slide-0 flash.

**Why no write on open:** the frame signature (`single-slide-render.ts` — theme|mode|geom|mermaid|
extraCss|extraTheme) is invariant across the editor→Present switch: same slide (`startIndex =
activeFullIndex`), unified mermaid, same theme props, and **geom is the engine's intrinsic slide
box, not the slot size** — the slot-size difference is absorbed by `scaleFrame`'s CSS transform.
So the render either no-ops or patches (~2ms). Closing reverts sample + retargets the controller
to the editor slot → a re-fit, not a write.

## Adversarial trio on the reshape diff (HARD RULE #25) — core sound, two seam fixes
Red team + Munger inversion + independent checker, on the actual diff. **Core independently
reproduced** (real `docs/dist`, 4× CPU): open Present = **0 renders** (byte-identical), exactly
one `iframe.live` on open/nav/close, navigation all patches, editor mode-flip write intact
(~512ms), lint+typecheck clean, **818 unit tests pass**. Two defects in the seams the reshape
added — **both fixed and re-verified**:

1. **Fabricate-exit → data loss (MUST-FIX, fixed).** An earlier `openPresent` did
   `setView('compose')` to force a *global* iframe count of 1, which unmounted `<Fabricate>` and
   discarded its unsaved in-progress work (component CSS, AI-generated drafts, theme edits — all
   in un-persisted `useState`); Escape landed in compose, not back in Fabricate. Root cause: the
   "exactly one `iframe.live`" acceptance metric was mis-specified — the real invariant is one
   warm *deck* preview (the shared host), which holds regardless of Fabricate's separate specimen
   iframes, and Present's z-100 backdrop covers Fabricate anyway. Fix: `openPresent` just opens;
   Present overlays Fabricate and Escape returns to it with state intact. Verified: Fabricate
   stays mounted under Present and is visible again on close.
2. **Snapshot-capture pollution (fixed).** `captureLastSlide` was re-pointed to the shared host
   but still stamps the *editor's* slide index; firing on `pagehide`/`visibilitychange` while
   presenting would bake a present-lens slide into the editor's boot snapshot. Fix: a
   `presentOpenRef` guard — skip capture while Present is open.

## Verification (real built `docs/dist`, 4× CPU) — and the honest tradeoff
- **Open Present from compose (the common path): 0 writes, exactly 1 `iframe.live`.** ✓
- **Navigation: patches only.** Close: no write, reverts to the editor slide. ✓
- **Fabricate: stays mounted under Present; Escape returns to it** (data-loss fix). ✓
- **Open Present *from Fabricate*: ~2 writes**, not 0 — because keeping Fabricate mounted means
  Present opens with Fabricate's *live-editing* theme context, which differs from the parked frame,
  so the shared preview reconciles. This is an accepted tradeoff: the common compose-open is warm
  (the win), open-from-Fabricate is a rare ⌘K path, and even there it's far better than the old
  cold-write-*every*-open — and it costs no data. Data integrity over shaving a rare-path write.
- Gates: lint + typecheck clean; 818 studio/DeckPreview unit tests pass.

**UNVERIFIED (HARD RULE #23):** real-device wall-clock of the Present-open on iOS; real
touch/gesture swipe over the slide (pointer-events layering is correct by construction and matches
the prior same-origin-iframe contract, but not exercised on a touch device). Wants an on-device look.

## Follow-ups (logged, #18)
- The positioning controller re-measures on slot/root *size* + scroll, not pure *position* shifts
  between switch boundaries — a narrow residual (Crux A bars transform-based ancestor motion; most
  pane toggles change the slot's own size). Low risk; noted.
- Open-from-Fabricate's reconcile write could be eliminated by pre-syncing the parked frame to
  Present's theme, but it's a rare path and not worth the coupling.
