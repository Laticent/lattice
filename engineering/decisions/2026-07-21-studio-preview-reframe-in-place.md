---
status: in-progress
summary: A 6-lens expert panel (UI/UX, visual design, frontend-systems architecture, iOS/mobile-web, Munger inversion, red-team) assessed whether the Studio live-preview architecture's competing interests can co-exist. Verdict: MOSTLY yes, but ONE pairing is irreducible under the current design — "share one warm iframe via a hoisted position:fixed host measured onto an in-flow slot" ⟂ "iOS's split of visual vs layout viewport." The red-team proved no single visualViewport-offset formula reconciles keyboard-drift (needs +offset) with pinch-zoom-pan (fixed layers already move with the page → +offset double-applies), so patching keeps emitting bugs. The KEYSTONE root cause (architect): the box is sized with 100cqh on a container-type:size holder; container-type:size establishes a containing block for position:fixed descendants, so the iframe can't be a fixed child of the box → it's hoisted to a fixed root sibling → a controller must measure-and-track it every frame → the iOS drift. RECOMMENDATION — "reframe-in-place": size the box as a plain aspect-ratio letterbox (no 100cqh, no container-type), make the editor preview an IN-FLOW CSS member (so the drift is unreachable — no fixed element tracks anything), and reframe the SAME iframe node to position:fixed;inset:0 for Present (ancestor CSS toggles, node never reparents → never reloads → Present stays instant). Delete use-shared-preview-slot.ts, the empty anchor slots, and the inline compute-seed. This is a net deletion, Studio-only, does not touch the shared render kernel (HARD RULE #1), and preserves every UX bar (instant paint, ONE warm instant-open Present, deck-size-accurate box, full responsiveness). Ship the visualViewport-offset patch (direction A) only as a carefully-scoped interim (gate on scale===1, ?? 0-guard, decide Present's branch) — it fixes the confirmed steady-state drift but NOT animated jitter, zoom, or the never-paint blank. Independent hardening (orthogonal to the primitive): a never-paint reveal floor (the earlier trio's open blocker), the 100dvh keyboard-overlap gap (add interactive-widget=resizes-content, un-gate keyboard handling from the 699px cutoff to pointer:coarse), and the loader-ground (var(--bg)) vs slide-ground (hardcoded gray) light/dark mismatch. Everything iOS is UNVERIFIED until real-device (HARD RULE #23).
---

# Studio live preview — can the competing interests co-exist? (holistic assessment + reframe-in-place)

**Date:** 2026-07-21 · **Status:** IN PROGRESS — design accepted and IMPLEMENTED as the *decoupled*
variant (direction D), not the shared-node reframe originally recommended; see the implementation note
at the end. iOS zero-drift remains UNVERIFIED on-device (#23). · **Method:** 6-lens expert panel over a
shared brief (`scratchpad/preview-architecture-brief.md`), reconciled here.

## The question

The Studio live preview is a knot of interacting parts — a `client:only` React app with a
static instant shell; a resizable splitter; an engine that renders slides into an iframe; a
hoisted preview host shared editor↔Present; a Nacre loading placeholder; responsiveness; and a
slide whose size changes by splitter drag OR deck-size selection. These have competing
constraints, and the arc of this branch has been ~18 commits patching the same wound. The user
asked, holistically: **can all of this co-exist, or is there a better design — one that keeps
the UX close to what ships today?**

## The answer in one line

**Mostly it can co-exist — but one pairing is irreducible *under the current box-sizing
choice*, and that choice is the keystone that manufactures every hard problem. Replace it and
the conflict dissolves, the hoisting becomes unnecessary, and ~190 lines of the most bug-prone
code get *deleted* rather than patched.**

## The keystone (root cause)

Each link is forced by the previous:

1. The editor preview box is sized `width: min(100%, calc(100cqh × ratio), 760px)` on a
   `container-type: size` holder (a deliberate CSS-only choice to kill an old measure race).
2. `container-type: size` computes to `contain: size layout style`. **Layout containment
   establishes a containing block for `position:fixed` descendants.** So a fixed element inside
   the box resolves against the box — it can't fill the viewport for Present.
3. Therefore the shared iframe can't be a fixed descendant of the box. It's **hoisted** to a
   `position:fixed` sibling at the studio root, and the box becomes an empty anchor slot.
4. A fixed host at the root doesn't know where the anchor is, so a controller **measures** the
   slot every frame (`getBoundingClientRect`) and writes `top/left/width/height`.
5. **On iOS, `position:fixed` lays out against the LAYOUT viewport; `getBoundingClientRect`
   returns VISUAL-viewport coords.** When they diverge (keyboard, URL-bar, pinch) the host lands
   off by exactly `visualViewport.offset*` — the confirmed on-device 58px-@-offsetTop-59 drift.

The codebase already half-knows this: `assertNoTransformedAncestor` exists precisely because a
`contain` ancestor would break the fixed host. The whole hoist-and-measure edifice is the price
paid to keep the fixed host out of the `container-type` box. **Change the box so it needs no
`container-type`, and steps 2–5 evaporate.**

## What the panel converged on

- **Unanimous — retire the pixel-exact geometry-matching.** The placeholder is a *slide-shaped,
  rect-matched* card, which forces `persist-rect on unload → --sb-* seed → data-ssr-rect replay →
  computePreviewRect → SIZE_RATIO threading`, with the box math now transcribed in **three
  places** (TS function, inline seed, app CSS) and a parity test that **cannot catch app-side
  drift** (`h-[54px]→h-[60px]` leaves the test green while the seed silently diverges). No user
  can perceive 0.1px parity on a blurred rotating shimmer under a 200ms cross-fade. Replace the
  rect-match with a loader laid out by the *same* CSS box (coincide by construction) + a
  cross-fade to dissolve any residual delta.
- **The keep-vs-drop-the-hoist fork, resolved.** UI/UX and Munger wanted to drop the sharing
  (in-flow per surface, accept a Present-open reload). The designer objected: the flash-free
  Present open is the boardroom spotlight and desktop has no viewport split. The **architect
  dissolved the fork**: you don't have to choose — *reframe-in-place* makes the editor in-flow
  (kills the drift) AND keeps Present instant (same node, CSS-reframed, never reparented). The
  iOS specialist's posture-split hybrid (in-flow on touch, host on desktop) was the best answer
  *given the current box*; reframe-in-place is deeper — one primitive, correct everywhere.
- **Red-team — "keep and patch" is a dead end for the real state space.** The `visualViewport`
  offset patch fixes only the *settled* frame at `scale===1`. It leaves animated transients
  (keyboard/URL-bar ramp ~300ms — iOS fires vv events *sparsely*, so the host STEPS, and the
  patch makes the motion *more* visible), and it **actively breaks pinch-zoom**: fixed layers
  already scale/translate with the page, so `+offset` *double-applies* the pan. No single
  unconditional offset formula reconciles keyboard-drift with zoom-pan — proof that
  `position:fixed` + measurement is the wrong primitive for the animated/zoomed states.

## Recommendation — reframe-in-place (change the sharing primitive, keep the warm iframe)

> **What actually shipped (2026-07-21):** the DECOUPLED variant below (direction D), NOT this
> shared-node reframe — see "Implementation note" further down for why. So the "Present stays
> instant" promise in this section describes the *unbuilt* shared-node version; the shipped
> decoupled Present shows a brief loader on open (keep-warm is a follow-up).


**Keep the shell and keep the ONE shared warm iframe — but change sharing from
RELOCATE-A-FIXED-HOST to REFRAME-IN-PLACE.**

1. **Re-size the box as a pure letterbox:** `aspect-ratio: R; max-width:100%; max-height:100%;
   margin:auto` in a flex/grid pane. Remove `100cqh` and the box's `container-type:size`. This
   kills the 0-collapse race at the root (no cross-axis dependency) and removes the containment
   that forced the hoist. (`margin:auto` is the one already-sanctioned flex push.)
2. **Scope `container-type:inline-size` to the toolbar/header wrapper**, not the whole pane, so
   the preview subtree has no layout-contained ancestor.
3. **Editor preview = an IN-FLOW CSS member** of the studio layout. Delete
   `use-shared-preview-slot.ts`, the `editorSlotRef`/`presentSlotRef` empty anchors, and the
   measure-and-track loop. The iOS drift is now *unreachable* — nothing fixed tracks a slot; the
   browser keeps the preview glued through keyboard/zoom/URL-bar/rotate for free.
4. **Present = the SAME iframe node wrapped** `presentOpen ? 'fixed inset:0 z-[101]' : 'relative
   size-full'`. Ancestor CSS toggles; the node never reparents → the iframe never reloads → the
   existing same-signature sample swap keeps Present **instant**.
5. **Shell cleanup:** delete the inline compute-seed tier (the third formula copy); keep the
   static Nacre shell + decoupled dismissal; add a Nacre cross-fade at hand-off; keep
   `computePreviewRect` as a shell-only fallback (or retire once the shell reuses the box CSS).

**Why this satisfies every lens at once:** instant paint (shell kept); ONE warm, instant-open
Present (same node, no reload — the designer's bar); deck-size-accurate box for any aspect (the
letterbox — kept and improved); full responsiveness (CSS, no model); correct tracking through
keyboard/scroll/drag/zoom on iOS (in-flow — the UX/Munger/iOS bar); and a **net deletion**,
Studio-only, that does not touch the shared render kernel (HARD RULE #1) or any other DeckPreview
host (they already mount in-flow).

### Rejected alternatives
- **A (offset patch) as the destination** — steady-state only; breaks zoom; see red-team.
- **C (compute the app box from constants)** — doesn't fix the iOS drift (the mismatch is in the
  fixed positioning, not the number's source) and trades self-correcting CSS for a
  transcription liability. Keep compute shell-only; take the race-fix via the letterbox instead.
- **B naive (one fixed spot, CSS-clip)** — still a fixed element vs the visual viewport, and
  "one spot" is fiction against a variable split + aspect.
- **D (drop sharing, Present mounts its own iframe)** — matches reframe-in-place on the editor
  but throws away instant Present (a ~485ms cold srcdoc write on a throttled phone). Only the
  fallback if the `container-type` refactor proves infeasible.

## Interim (optional) — the offset patch, carefully scoped

If an immediate stop-gap for the on-device drift is needed while reframe-in-place is built, ship
direction A **with all three guards or not at all:** `?? 0`-guard the offset reads (else
`left: NaN px` vanishes the host on browsers without `visualViewport`); **gate the offset on
`scale === 1`** (else it double-applies under pinch-zoom and breaks a currently-working state);
and add the offset to the raw rect *read* (so Present, which skips the clamp, is covered). Even
then it fixes only the settled frame — not animated jitter, not the `dvh` overlap, not the
never-paint blank. Prefer going straight to reframe-in-place if scheduling allows.

## Independent hardening (orthogonal to the primitive — do regardless)

- **Never-paint reveal floor** (the earlier trio's still-OPEN blocker). A frame that never paints
  `.lattice` stays `opacity:0` forever; on non-loader DeckPreview hosts that's a permanent blank,
  and seating the host correctly (A or B) only makes the blank *more* visible. Add a bounded
  fallback: after a ceiling, force a fresh srcdoc write or surface a retry — an infinite loader
  must never be terminal.
- **The `100dvh` keyboard-overlap gap** (separate from the drift; reframe-in-place does not fully
  fix it — an in-flow preview in a `100dvh` pane still sits behind the keyboard). Add
  `<meta name="viewport" … interactive-widget=resizes-content>` (currently absent) and un-gate
  keyboard handling from the `≤699px` cutoff to `pointer: coarse` (so a landscape iPad — treated
  as desktop today — gets it), and/or make the pane height `visualViewport`-aware.
- **Light/dark ground mismatch.** The loader ground is `var(--bg)` (palette token) but the slide
  iframe body ground is hardcoded `#0c0c0c`/`#e7e7ea`; on a non-neutral palette the cross-dissolve
  visibly shifts ground. Match the loader ground to the slide's actual ground.

## What must be preserved (the UX bar — all of this survives reframe-in-place)

Instant paint / no blank; instant warm slide-navigation + theme-flip fast-paths; content-gated
reveal (never expose a broken frame); ONE warm, flash-free, instant-open Present; the pure-CSS
deck-ratio letterbox box; full desktop/tablet/mobile/landscape-cinema responsiveness.

## Verification (HARD RULE #23 — UNVERIFIED until real hardware)

Headless WebKit cannot reproduce the URL bar, the software keyboard, or the visual/layout
viewport split. The falsifiable claims to verify on a real iPhone AND iPad, portrait AND
landscape, across keyboard-up / pinch-zoom / rotate, using the `?vvdebug` overlay's `host↔slot`
readout:
- reframe-in-place: an in-flow, `aspect-ratio`-sized preview shows **zero** keyboard/URL-bar/
  pinch drift (no fixed element tracks it), and Present-open is a patch (no cold reload).
- the interim offset patch (if shipped): confirm it does not regress pinch-zoom (the `scale===1`
  gate) and does not vanish where `visualViewport` is absent.

## Implementation note (2026-07-21) — the DECOUPLED variant was chosen over shared-node reframe

Going into the code, the shared-node "reframe the wrapper to fullscreen for Present" version proved
much larger than the sketch: Present holds no iframe of its own — its chrome layers over a slide slot
the shared host was *positioned into* — so keeping ONE node meant restructuring PresentOverlay's whole
slot + sizing model to layer its chrome over a reframed editor box. That is a deep, cross-component
rewrite of the most-scarred code, unverifiable on iOS here — high risk of a Present/desktop regression.

So the **decoupled** variant (direction D) was implemented instead: the editor preview is in-flow in its
box (the drift fix — nothing is a fixed element tracking a slot), and Present renders its OWN in-flow
preview. Deleted: the hoisted host, `use-shared-preview-slot.ts`, the anchor slots, the
`presentPreview`/`onSlide` plumbing, and the dismiss-on-host-visible observer (shell dismissal now rides
the editor preview's `onFirstRender` + the 8s backstop). Verified in WebKit across write/read/mobile
(`fixed ancestor: null` — in-flow) and Present-open (own iframe, full chrome). The one cost vs today:
Present's iframe unmounts on close and remounts on open (a brief loader). **Follow-up (pending):**
keep-warm — keep Present's iframe mounted after first open so reopen is instant. Real-iPhone/iPad
confirmation of zero drift is still required (#23).

**Off-path findings logged (not fixed here, #18).**
- **`critical-css.mjs` is now orphaned.** Removing the pre-hydration `ssg-first-slide.mjs` (orphaned
  dead code) left `docs/scripts/critical-css.mjs` with no production caller — it is now imported only
  by its own test. It was already latent-dead (its sole caller, `ssg-first-slide.mjs`, was itself dead
  before removal), so deleting it (module + `critical-css.test.mjs`) is a separate cleanup, off the
  path of this reframe — tracked here rather than pulled into this PR (#8/#17).
- **Subsequent full writes on iOS have no reveal-poll backup (pre-existing).** The reveal poll that
  clears `__latticePendingLoad` when iOS drops the srcdoc `onload` is created ONCE, in the iframe's
  `if (!fr)` create branch — so it only guards the FIRST write. A later full write (a slide change, a
  structural edit the patch path can't absorb) re-arms `pendingLoad` but relies solely on `onload` to
  clear it; if iOS drops that `onload`, `pendingLoad` sticks true and edits fall to the slow
  realm-churning write path until a patch-eligible render. Correctness is fine (the frame still reveals
  via the content gate); it's an intermittent iOS *perf* degradation. The robust fix is a persistent
  paint-watcher (or re-arming the poll per full write) that clears `pendingLoad` off the `frameHasPainted`
  gate regardless of `onload` — a shared-kernel change worth its own PR + maker-checker, not folded into
  this reframe. UNVERIFIED here (needs on-device iOS, #23). This review's fix hardened only the
  first-write poll (stop on pendingLoad-cleared, ~30s budget), which is what changed in this PR.
- **`SHELL_NACRE_CSS` in studio.astro is a hand-copied subset of `nacre-loader.css` (drift risk).**
  The pre-hydration shell inlines a scoped (`#studio-ssr-shell …`), fallback-hex'd subset of the
  canonical loader CSS, kept in sync by a comment. Reading + auto-scoping the canonical file at build
  would DRY it, but the transform is non-trivial (prefix every selector, rewrite `@keyframes`/`@media`,
  inject fallback hexes) — more build machinery + risk than the small, stable copy warrants today. The
  `check:studio-shell` gate already guards the shell's *presence*; a build-time subset assertion is the
  cheaper future guard if it ever actually drifts. Left as-is (a deliberate copy), not folded.
- **Nacre loader CSS inlines into every docs page (~1.5KB).** `nacre-loader.css` is imported by
  `DeckPreview`, so Vite folds it into a shared chunk (`resolve-captions`, in `single-slide-render`'s
  graph) that every DeckPreview host — including landing's `HeroPreview` — pulls, and Astro's
  `inlineStylesheets: 'auto'` then inlines that small chunk into all ~13 pages. It's screen-only and
  fully scoped to `.nacre-loader*` (no visual/global leak), and moving the import between components
  does NOT change the chunking. Detaching it (an async CSS chunk, or splitting the loader into a
  lazily-imported component) is a bundling task worth a follow-up if the payload ever matters — not an
  import-site move, and off the path of the drift fix.

## Files (for the implementation that follows this decision)

`docs/src/components/studio/StudioShell.tsx` (box CSS 2683–2710; hoisted host 2897–2913;
container-type scoping; the Present JSX), `docs/src/components/studio/use-shared-preview-slot.ts`
(to DELETE under reframe-in-place; the offset patch at 115–116 if the interim is taken),
`docs/src/pages/studio.astro` (delete the compute-seed tier; add the cross-fade),
`docs/src/components/studio/preview-rect.ts` (keep shell-only), `docs/src/lib/single-slide-render.ts`
(the reveal floor; the hardcoded slide ground at ~249), the viewport `<meta>` (add
`interactive-widget`), `docs/src/components/studio/use-visual-viewport.ts` (un-gate from 699px).
