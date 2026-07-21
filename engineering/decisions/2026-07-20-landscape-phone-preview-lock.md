---
status: shipped
summary: [Superseded by the "cinema morph" below — see §Iteration.] A phone held in landscape was a dead editing surface — wide enough (~844–932px) to fall into the Studio's two-pane tablet layout but only ~360–430px tall, so the editor|preview split was cramped and the iOS software keyboard buried the caret with nowhere to scroll. The fix detects "landscape phone" (`useLandscapePhone`: orientation:landscape + max-height:500px + pointer:coarse — the same triad the presenter view already uses; pointer:coarse also excludes a short desktop window) and repurposes that state: the shell folds into its mobile single-pane path (`mobile = bp==='mobile' || landscapePhone`) and locks to preview via a derived `effPane = landscapePhone ? 'preview' : mobilePane`. The editor stays mounted-but-inert so no keyboard can be summoned and rotating back is instant; the Edit/Preview toggle and the "Edit this slide" Read overlay give way to a single non-interactive "Preview · rotate upright to edit" chip (strict preview-only, no edit escape hatch, per the request). A small tablet in landscape clears the 500px height cutoff and keeps the full two-pane layout. Verified on a real Chromium at landscape-phone / portrait-phone / landscape-tablet viewports; the exact iOS Safari keyboard behavior is reasoned not device-tested (there is no editable element to summon it — HARD RULE #23).
---

# Landscape phone → preview-only lock

**Date:** 2026-07-20
**Area:** docs-site Studio shell (`docs/src/components/studio`)
**Status:** shipped

## Symptom

A phone held in **landscape** was an unusable editing surface. Reported from an
iPhone: rotate to landscape and the Studio is cramped; the moment the software
keyboard opens, the editor collapses to two or three visible lines and the caret
is buried — "if the keyboard comes up you are done."

## Root cause

The Studio chooses its layout by **width only** (`use-breakpoint.ts`):

| width | layout |
|---|---|
| ≤ 699px | mobile — one swappable Edit/Preview pane |
| 700–1099px | tablet — two-pane editor \| preview + sheets |
| ≥ 1100px | desktop |

A modern phone in landscape is **wide but short**: ~844px (iPhone 14) to ~932px
(Pro Max) across, but only ~390–430px tall. Width alone lands it in the **tablet
two-pane** layout — an editor and a preview side by side in ~400px of height.
That is already tight, and the iOS software keyboard then covers most of the
remaining height with nowhere for the writing surface to scroll (`visualViewport`
inset ≈ the whole pane). The result is the dead state in the report.

## Decision

A landscape phone is a legitimate **reading / glancing** posture, not an editing
one. Rather than fight the keyboard in ~150px of residual height, **remove the
editing surface entirely in that state** and give the whole screen to the deck.

- **Detect it** with `useLandscapePhone()` —
  `(orientation: landscape) and (max-height: 500px) and (pointer: coarse)`.
  This is the *same* triad the presenter view already uses for landscape phones
  (`drawing-board.css` `@media (orientation: landscape) and (max-height: 500px)`);
  `pointer: coarse` additionally excludes a short *desktop* window. Width-independent
  by design — the phone's landscape *width* varies (667–932px) but its landscape
  *height* is reliably ≤ ~430px. A small tablet in landscape (iPad mini ~744px tall)
  clears the height cutoff and keeps the full two-pane layout.

- **Fold it into the mobile single-pane path** (`mobile = bp === 'mobile' ||
  landscapePhone`) rather than adding a fourth layout — the mobile preview pane
  already renders the deck full-bleed with slide navigation, Present, and Share.

- **Lock the pane to preview** via a derived `effPane = landscapePhone ? 'preview'
  : mobilePane`. The editor stays *mounted but inert/invisible* (the existing
  both-panes-mounted design), so no keyboard can be summoned and rotating back is
  instant. The Edit/Preview toggle and the "Edit this slide" Read overlay are
  replaced by a single non-interactive **"Preview · rotate upright to edit"** chip
  — the one honest affordance (per the 2026-07-20 request: *full preview only*, no
  "edit anyway" escape hatch).

- **Strip the surface to view-only.** The lock is only honest if *nothing* on the
  surface summons the keyboard. Two follow-through fixes after a maker-checker pass:
  (1) the shared compact header gated its Coach/Chat/Settings openers on
  `bp === 'tablet'` — but a landscape phone *is* in the tablet width band, so they
  leaked into the header (duplicating the pane bar AND re-exposing text inputs);
  now excluded with `&& !landscapePhone`. (2) The mobile pane bar's **Chat** (AI
  composer) and **deck/slide Settings** (Inspector notes/header/footer fields) open
  text inputs, so they are dropped on a landscape phone. **Coach** (read-only
  assessment), **version history** (snapshot restore), **Present**, and **Share**
  stay — none is a text-entry surface. The deeper `⋯` overflow items (⌘K search,
  feedback) are a deliberate two-tap path and left as-is; the boundary is the
  top-level, one-tap controls.

### Why not literally enter Present mode?

Considered (and prototyped on a real landscape phone): auto-open `PresentOverlay`
instead of an in-shell preview. Rejected. On a 844×390 phone the Present slide is
the **same size** as the in-shell preview (both are a centered card with gutters —
Present is not bigger), but Present layers on *presenting* chrome (Rehearse,
Presenter-screen, closed-captions, audio, a play/timer) aimed at *giving* a talk,
not *glancing* at slides. Worse, Present is a **mode with an Exit (✕)** that would
dump the user back into the unusable editor and immediately re-trigger the landscape
state — a mode-exit trap that would force special-casing inside `PresentOverlay`.
The in-shell preview-lock is the lighter, correctly-weighted "read" surface; Present
stays reachable as a one-tap opt-in button for when the user *does* want to present.

## Alternatives considered

- **Shrink the editor / ride the keyboard.** Rejected: ~150px of residual height
  can't hold a usable editor no matter how it's tuned; the keyboard problem is
  geometric, not stylistic.
- **A brand-new landscape layout.** Rejected: the mobile preview path already *is*
  the full-bleed reading experience we want. Reuse over reinvention (HARD RULE #15).
- **Force portrait via the Screen Orientation API.** Rejected: unsupported on iOS
  Safari and hostile (yanks the device orientation out from under the user).

## Verification

Real Chromium (Playwright, coarse-pointer contexts) at three viewports:

| viewport | `landscapePhone` | result |
|---|---|---|
| 844×390 (iPhone 14 landscape) | true | preview-only; chip shown; no Edit toggle |
| 390×844 (portrait) | false | full editing preserved |
| 1024×768 (iPad landscape) | false | full two-pane layout preserved |

**UNVERIFIED (HARD RULE #23):** the exact iOS Safari keyboard behavior on real
hardware is reasoned, not device-tested from this sandbox — but there is no
editable element in preview-only mode, so no keyboard can appear.

## Iteration — from "view-only preview-lock" to the "cinema morph"

The first cut (above) kept the mobile shell's header, deck-actions toolbar, and
slide-navigator, and boxed the slide in a padded card — a *preview*, chrome and
all. On review the ask sharpened: **the slide should take up all the available
space and be swipeable** — the same underlying slide render that "morphs" between
the editor's preview slot and Present's slot should get a *third* morph for iPhone
landscape. So the design moved from "strip the toolbar to view-only" to "strip
*everything* but the slide":

- **No header, no toolbar, no navigator.** The header is suppressed
  (`!landscapePhone`), and the body renders a dedicated cinema branch (before the
  standard mobile branch) that mounts only `previewPane`. **Note the mount
  difference from the preview-lock cut:** that kept both panes mounted (mobile
  branch); the cinema branch mounts only `previewPane`, so the editor **unmounts**
  on entering landscape (text is safe — it lives in `source`; undo/caret/scroll
  reset) and remounts on rotate-back. No editor is mounted → no software keyboard.
- **`previewChromeless`** (`effectiveStop === 'read' || landscapePhone`) drives
  `previewPane` to drop its header/footer/navigator and fill the frame; the slide
  holder goes full-bleed on a `bg-muted` letterbox with slight vertical breathing
  room (`px-0 py-3`), fit to the measured axis so a 16:9 slide is as large as it can
  be uncropped.
- **Swipe** reuses the preview pane's existing `onPreviewTouchStart/End` handlers.
  Because screen readers intercept one-finger swipes, the cinema branch also carries
  `sr-only` **Previous/Next** buttons (wired to `goToSlide`), an `sr-only` intro, and
  an `aria-live` "Slide N of M" — so VoiceOver/TalkBack users can navigate and hear
  position (the visible counter is `aria-hidden`).
- **The whisper** (`LandscapeWhisper`) is the only overlay: a single, near-opaque
  `N / M` slide-progress counter that fades ~2.2s after each slide change or tap
  (`revealKey`) and reappears on the next. `pointer-events-none` so it never eats a
  swipe; `aria-hidden` (the slide carries the content). (An earlier cut also carried a
  "rotate upright to edit" hint pill; dropped — two pills was one too many, and the
  rotate affordance is self-evident on a phone.)

This made the earlier view-only toolbar work moot (the landscape phone no longer
renders that toolbar or header at all), so those guards were reverted — the whole
landscape behavior now lives in the cinema branch + `previewChromeless` + the header
suppression. **Present mode was still rejected** for the same reasons (§"Why not
literally enter Present mode?") — the cinema morph gives the same maximal slide with
none of Present's presenting chrome or its exit trap.

## Adversarial trio (pre-merge, HARD RULE #25)

Run against exactly what ships (`aa8b39a`): red team + Munger inversion + independent
checker, three fresh contexts.

- **Independent checker — 8/8 claims CONFIRMED**, empirically re-driving the real
  surface (Playwright, coarse pointer): cinema engages, the shared iframe renders
  non-blank (651×366), **0 textareas / 0 contenteditable** (the one `<input>` is a
  hidden file picker), counter "1 / 7", portrait keeps the full editor, non-landscape
  byte-identical, no page errors.
- **Red team — core robust** (swipe/tap, 0/1/100-slide decks, and Present-vs-cinema
  shared-iframe contention all held; no crashes, no data loss). Real hits at the edges,
  folded in below.
- **Munger inversion — defensible tradeoff**, not a wrong frame; one genuine flaw
  (discoverability), folded in below.

**Fixed in-diff from the trio:**
- **Accessibility navigation** — cinema was swipe-only with an `aria-hidden` counter,
  a regression for AT users (the replaced navigator had accessible controls). Added the
  `sr-only` Prev/Next + `aria-live` position + intro (above).
- **Stale comments / doc** — corrected the JSX comment and this doc's mount claim: the
  editor **unmounts** in cinema (it does not "stay mounted").

## Real-device fix — the slide was fit-by-WIDTH; the container was never the problem (a HARD RULE #23 lesson in four rounds)

The trio's checker verified 8/8 headless, but a real phone caught what emulation can't.
It took four rounds, and the first three chased a container-height problem **that did not
exist** — every fix was aimed at the wrong element, and two of them were validated against
*guessed* simulation inputs, which manufactured false confidence.

- **Round 1 (JS height pin).** `useVisualViewportHeight` pinned the cinema surface to
  `visualViewport.height` — applied in a `useEffect` after first paint; failed on-device.
- **Round 2 (offset "dual-hoist").** A trio reproduced with a *simulated* `visualViewport`
  of `offsetTop: 90`, concluded "vertical offset", and offset the fixed host by `offsetTop`.
  Validated in the simulation — but the `offsetTop: 90` was invented. Real device: still broken.
- **Round 3 (`svh`).** A fresh trio, reproducing with `offsetTop: 90` again, "measured" an
  offset; the on-device `?vvdebug` then showed **`off 0,0`** (no offset at all) and **`frame
  413px tall`** in a 313 viewport → the slide was **fit-by-width**, not the container being
  tall. Switched to `100svh`. Still wrong (see round 4).
- **Round 4 (the actual cause — from a fuller `?vvdebug`).** Readout: `inner 734x313 · vv
  734x313 off 0,0 · svh 333 dvh 313 lvh 333 · stage h 333 · frame h 309`. Two facts settle it:
  (a) **`dvh == 313 == innerHeight == vv.height`** — the `100dvh` root was *always* exactly the
  visible height; the container was never too tall. (b) The earlier `frame h` was **413**
  (`734 × 9/16`) — the slide was sizing to the viewport **width**. The real bug is purely the
  **fit axis**: a landscape phone viewport (~2.3:1) is wider than a 16:9 slide, so height must
  bind, but the measured-axis fit raced stale to width. (And `svh` was actively *wrong* here —
  this browser reports **`svh (333) > dvh (313)`**, so `100svh` over-sized the stage and clipped
  ~8px; the usual `svh ≤ dvh ≤ lvh` ordering is not guaranteed.)

**Fix (one line that matters):** force **fit-by-height** for the landscape phone
(`previewFitByHeight || landscapePhone` on the previewBox), and let the cinema surface simply
fill the existing `100dvh` root (which already equals the visible height). Every other round's
machinery — the `useVisualViewportHeight` pin, the `use-shared-preview-slot` dual-hoist, the
`svh` height — was **reverted**; the shared controller is back to original.

**Lessons (all #23):** (1) *validating against a guessed simulation input manufactures
confidence, not correctness* — rounds 2–3 both "passed" against an invented `offsetTop: 90`
that the real device (`off 0,0`) never had. (2) When a bug is device-only, **instrument the
real surface and read numbers before theorizing** — the *comprehensive* `?vvdebug` (svh/dvh/lvh
+ stage + frame) is what finally exposed a *fit-axis* bug that four viewport-height theories had
completely missed. (3) Don't trust the `svh/dvh/lvh` ordering — a real browser reported
`svh > dvh`. The `?vvdebug` readout stays shipped (opt-in) for future triage.

## Promotion — `?vvdebug` is now a first-class Viewport-debug overlay

The comprehensive readout that finally cracked this (§Real-device fix) was, in the fix
commit, an inline `LandscapeViewportDebug` component: a `<pre>` pinned to the cinema
stage, gated on a raw `?vvdebug` URLSearchParams check, only ever mounted on a landscape
phone. Useful enough to keep — the geometry it surfaces (layout vs. visual viewport,
what `svh`/`dvh`/`lvh` actually resolve to, the stage + preview-frame rects) is exactly
what headless CI can't see and what any future on-device layout bug will need — so it was
promoted to a standing debug lever, built to the **same pattern as the existing
Performance and Viz-diagnostics overlays** (HARD RULE #15 — reuse, don't reinvent):

- **`docs/src/playground/viewport-debug-prefs.ts`** — the shared-pref SSOT (localStorage
  key `lattice-viewport-debug`), mirroring `viz-overlay-prefs.ts`: `viewportDebugEnabled()`
  / `setViewportDebugEnabled()` / `onViewportDebugEnabledChange()` (same-page listener
  fan-out, so a switch flip mounts/unmounts the overlay live) / `applyViewportDebugUrlParam()`
  (the `?vvdebug` param writes the same flag — a phone still enables it without the drawer).
- **`ViewportDebugOverlay.tsx` / `.astro`** — a cloned `PanelPortal`: the draggable,
  `<body>`-portaled, grip-headed floating panel the other diagnostics overlays use
  (persisted position, on-screen clamp, singleton claim). It polls the geometry (~300 ms)
  and re-reads on every `visualViewport` resize/scroll. Renders nothing (and measures
  nothing) until the pref is on. It's a *real* debugger, not a raw dump:
  - a **verdict strip** computes the load-bearing answers — `insetPx` (keyboard / browser-UI
    overlap = `innerH − vv.h − vv.ot`, the same formula as `--cs-kb-inset`), `urlBarPx`
    (`lvh − svh`), and `frameFit` (the exact #1121 check: `frame.top ≥ 0 ∧ frame.bottom ≤
    stageH`, chip goes green/red) — so the raw rows rarely need reading;
  - **every metric row taps/hovers open** to a plain-language definition (`what`) *and* a
    **live relationship** to the others (`rel`, recomputed each render) — e.g. "visual is
    *N*px shorter than inner → the keyboard covers that much", "lvh − svh = the URL-bar
    height", "frame OVERFLOWS the stage by *N*px". The catalog lives in one `METRICS` table
    so each property's docs sit next to its value.
  - **Touch-first interaction.** A phone has no hover, so a **tap latches** the row's detail
    open (single-open, a second tap closes); hover-preview is *additionally* wired but gated
    to `(hover: hover) and (pointer: fine)` so a touch tap never sticks a hover state. The
    body is `max-h-[62svh] overflow-y-auto` so expansions never overflow the small phone
    panel. This is the "make it a real debug thing + mind the mobile experience" pass.
- **`WorkspaceSheet.tsx`** — a `<Switch>` row in the General → Diagnostics group, next to
  Performance / Read-aloud / Viz, gated by `VIEWPORT_DEBUG_AVAILABLE`.
- **`studio.astro`** — includes `<ViewportDebugOverlay />` next to `<VizDiagnosticsOverlay />`.

The inline `LandscapeViewportDebug` + the `vvDebug` const in `StudioShell.tsx` were
retired; the `data-cinema-stage` attribute on the cinema `<div>` stays — the new overlay
reads it. The overlay is no longer landscape-only: it reads on any surface (on desktop the
stage row simply shows `—`, since there's no cinema stage), so it's a general viewport
probe now, not a one-bug artifact. Verified on the *built* Studio driven in a headless
Chromium over `astro preview` (the shipped bundle, not the dev server): hidden by default;
`?vvdebug` shows correct live numbers at a desktop viewport (1440×900) AND an **emulated**
landscape-phone viewport (844×390 with touch — the cinema morph engaged, `stage h 390`,
frame fitting `[0,390]`); the Workspace switch mounts/unmounts the overlay live and its ×
writes the pref off; dark-mode chip legibility re-checked with a dark render. **UNVERIFIED
on real iOS/Android hardware** (HARD RULE #23 — an emulated width is not a device): the
geometry the tool reports is only ever as true as the device you actually read it on, which
is the whole point of shipping it. The chrome, the interaction, and the light/dark styling
are what's verified here.

## Known limitations / follow-up (logged, not fixed here — HARD RULE #18)

Off the path of this change; recorded so they aren't lost:

- **Hardware-keyboard phones false-positive.** `pointer: coarse` reflects the touch
  digitizer, not an attached Bluetooth keyboard, so a phone with a real keyboard (no
  software-keyboard problem) is still forced into view-only cinema. The *true* signal
  is the keyboard/inset condition (`visualViewport` delta / `VirtualKeyboard` API), not
  viewport shape.
- **`max-height: 500px` is a fixed guess that can rot.** A future phone taller than
  500px in landscape would silently fall back into the cramped two-pane layout —
  re-opening the original bug — with no boundary test guarding it.
- **Wide-short *windows* on capable devices.** iPad Stage Manager / freely-resized
  windows produce a wide-short viewport with `pointer: coarse`; the "iPad is ≥744px
  tall" exclusion only holds full-screen, so a resized tablet window can mis-trigger
  cinema. (Ordinary touchscreen laptops are correctly excluded — primary pointer is
  `fine`.)
- **Two-finger tap** can register a stray slide change (the swipe origin resets on the
  second `touchstart`). Cosmetic.
- **Discoverability (product decision).** With no visible "rotate to edit" cue, a
  sighted, orientation-lock-**off** newcomer who opens a shared deck already in landscape
  sees no sign an editor exists. The `sr-only` intro covers AT users; the visible cue was
  removed by explicit request. Revisit if landscape shared-link entry proves common.
- **`PanelPortal` is now cloned 4× (HARD RULE #15 debt — logged, not fixed here).** The
  draggable/on-brand diagnostics panel (grip drag, on-screen clamp, `<body>` portal,
  singleton claim, ~80 lines) now lives copy-pasted in `PerfOverlay`, `ReadAloudOverlay`,
  `VizDiagnosticsOverlay`, and `ViewportDebugOverlay`. Each was cloned deliberately (the
  in-file comment argues a shared helper would couple independently-evolving overlays), but
  a fourth copy crosses the rule-of-three line — four-way drift is now a real maintenance
  risk. **Follow-up (its own PR, off the path of this feature per #17/#8):** extract a
  shared `<DraggableDiagnosticPanel>` (drag + clamp + portal + singleton + grip header) and
  refactor all four overlays onto it; each keeps only its own pref module, testid,
  close-class, and body content. Surfaced by the PR #1129 adversarial-trio (Munger
  inversion). Not pulled into #1129 to keep that diff one-feature-one-PR.

## Touchpoints

- `docs/src/components/studio/use-breakpoint.ts` — `useLandscapePhone()`.
- `StudioShell.tsx` previewBox fit — `previewFitByHeight || landscapePhone` forces fit-by-height
  on the landscape phone (the actual fix); the cinema `<div>` just fills the `100dvh` root.
- `ViewportDebugOverlay.tsx` / `.astro` + `viewport-debug-prefs.ts` — the comprehensive
  `?vvdebug` readout (svh/dvh/lvh + stage + frame), promoted from the inline
  `LandscapeViewportDebug` into a first-class Workspace debug lever (see §Promotion). Opt-in,
  drag-repositionable, off by default. (Rounds 1–3 — `useVisualViewportHeight`, the
  `use-shared-preview-slot` dual-hoist, and the `svh` height — were all reverted; see
  §Real-device fix.)
- `docs/src/components/studio/StudioShell.tsx` — `landscapePhone` / `effPane` /
  `previewChromeless` derivation, `splitUsable`, the header suppression, the cinema
  body branch (incl. `sr-only` Prev/Next + `aria-live` position for AT), `previewPane`
  chromeless/full-bleed rendering, the `LandscapeWhisper` component + `whisperReveal`
  tap state.
