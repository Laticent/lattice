---
status: in-progress
summary: The phone Compose editor hid its grammar/register bar behind the iOS keyboard while typing (normal-flow `.cs-gutter` bottom bar; `100dvh` and `position:fixed;bottom:0` don't track the keyboard on iOS). A `design-competition` (winner Keyline, both judges, fact-check clean) then the adversarial trio produced the fix. Slice 1 (landed): the registers become a `position:fixed` rail portaled to `<body>`, pinned by an ABSOLUTE visual-viewport coordinate (`top = visualViewport.offsetTop + visualViewport.height − railHeight`) so it rides the keyboard's top edge invariant to iOS's `position:fixed` reference-frame ambiguity; it DOCKS at the editor bottom when no keyboard / no `visualViewport` (never worse than today — the fallback the inversion demanded). Scoped to the mobile shell (≤699px); tablet + desktop keep the left gutter (side rail, never occluded), retiring the 640-vs-699 mismatch. New `use-visual-viewport.ts`; render-gated on the active non-inert pane (body-portal escape); `ResizeObserver` tracks the host rect. Verified in-sandbox: desktop/tablet unchanged, mobile rail docks full-width, typecheck + 1711 tests + biome clean. UNVERIFIED on real iOS (no software keyboard in a headless sandbox, HARD RULE #23): the actual keyboard-lift, touch focus-retention, caret-above-rail. Slice 2 (pending, separate PR): two-band consolidation + divider→slide-settings gear.
---

# Compose mobile editor — the keyboard-riding grammar rail (Keyline, slice 1)

**Date:** 2026-07-18
**Status:** Slice 1 landed (grammar rail); slice 2 (band consolidation + divider→settings) pending.
**Surface:** `docs/src` Studio Compose editor (`ComposeView.tsx`, `StudioShell.tsx`).

## Problem

On a phone the Compose editor's chrome was a "ball of mess": four stacked bands ate the top
third before any slide content, and the bottom formatting/register bar was **hidden behind the
iOS software keyboard** exactly while typing (user report + screenshots). The register bar
(`.cs-gutter`, reflowed to a bottom row at `@media(max-width:640px)`) sat in **normal flow**, and
neither `100dvh` nor a `position:fixed;bottom:0` element tracks the keyboard on iOS — so the
keyboard drew over it.

## How we got here

A `design-competition` (5 tracks → 4 finished; both judges' winner **Keyline**, fact-check clean:
99 claims confirmed, 0 refuted) picked the model, then the **adversarial trio** (red team,
Munger inversion, independent feasibility check) hardened the winner. The trio materially changed
the design — see "What the trio changed" below. User picked Keyline and chose: keep **two** top
bands (not 4→1), build slice 1 now.

## The design (Keyline, as hardened)

**One move fixes both problems:** the grammar registers stop being a normal-flow band (occluded)
and become a bar that is **always docked at the editor's bottom and lifts above the keyboard when
one is up.**

- **Absolute-coordinate pin.** A new hook `use-visual-viewport.ts` publishes `--cs-vv-top`
  (`visualViewport.offsetTop`) and `--cs-vv-height` (`visualViewport.height`). The rail sits at
  `top: calc(var(--cs-vv-top) + var(--cs-vv-height) − 52px)`, landing its bottom edge flush with the
  visual-viewport bottom (keyboard top when up, screen bottom when down). This is an **absolute
  layout-px coordinate**, so it is invariant to whether iOS resolves `position:fixed` against the
  layout or the visual viewport — the ambiguity that makes the `bottom:0 + translateY` approach
  double-count the keyboard on some iOS builds. This is why Keyline beat the other three tracks.
- **Portaled to `<body>`.** The editor pane has `container-type:inline-size` (`StudioShell.tsx`
  ~2105), which would make a `position:fixed` child anchor to the pane and clip it. The rail portals
  to `document.body` — the same clip-dodge the desktop `cs-selbar` already uses.
- **Always-docked fallback.** When `visualViewport` is absent, or the keyboard is down, or a hardware
  keyboard is attached (no inset), the CSS var defaults (`--cs-vv-height,100vh`) dock the rail at the
  editor bottom = today's always-visible bar. **Never worse than what it replaces** — the fix the
  inversion demanded, and what makes slice 1 a strict standalone improvement.
- **Render-gate.** The body portal escapes the pane's `inert`/hidden subtree, so the rail renders
  only when the compose surface is the **active, non-inert pane** (`visible` prop: mobile → the edit
  pane is selected; tablet/desktop → not the Read stop and not split-collapsed).
- **Host-rect tracking.** A `ResizeObserver` on the editor host keeps the rail's `left`/`width` locked
  to the editor column (rotation, split-drag).
- **Scope: mobile shell only (≤699px).** Tablet and desktop keep the **left** grammar gutter — there
  the registers sit on the side, which the keyboard never occludes, so moving them to a bottom rail
  would *introduce* the very occlusion we fix. This also retires the old 640-vs-699 CSS/JS breakpoint
  split onto the single `useBreakpoint` mobile authority.
- **Buttons unchanged from the shipped bar** — the register buttons keep their `mousedown`
  `preventDefault` (focus never leaves the editor); only *where the bar sits* changed. So the tap
  interaction is the shipped behavior, not new code, which de-risks the touch-focus question.

## What the trio changed (vs the raw competition winner)

- **Inversion (fatal ×2):** the raw Keyline made registers reachable ONLY with the keyboard up (a
  regression vs today's always-visible bar; blank on iPad hardware keyboards) and had **no fallback**
  if the pin misbehaved. → The rail is now **always docked and lifts**, with a coded fallback.
- **Inversion (severe):** 4→1 reverses a deliberate prior decision (2026-07-03) protecting the deck
  title and one-tap Present/Share/Architect. → **Keep two bands** (user-confirmed); slice 2 removes
  only the in-pane EDIT header.
- **Red-team M1:** a coarse iPad Pro at desktop width would get a fixed rail over the desktop layout.
  → Rail scoped by **width ≤699**, not pointer, so no desktop-width device mounts it.
- **Red-team B3 / M4:** rail floating over an open Sheet, and stale `left/width` on split-drag. →
  `visible` render-gate (rail only on the active, non-inert compose pane) + `ResizeObserver`.
- **Checker corrections (for slice 2):** reuse `onEditorCursorSlide(idx)` (not a new
  `mapFullToViewed`) for the divider→settings slide reconcile; use `setInsertOpen(true)` for insert.

## Verification

**Verified in-sandbox** (build the docs, drive the real Playground, `tools/screenshot.js`):
- Desktop (1440, fine pointer): left grammar gutter unchanged, no rail — **no regression**.
- Tablet (820, coarse): left gutter unchanged, no rail — tablet's working side-rail untouched.
- Mobile (390): rail renders **docked full-width** at the editor bottom with all six registers,
  gutter gone; typecheck clean, 1711 docs tests pass, biome clean.

**UNVERIFIED — needs a real iPhone/iPad (HARD RULE #23; a headless sandbox has no software
keyboard, so this cannot be confirmed here):**
1. The pin actually lifting the rail to the keyboard's top edge across the keyboard-open animation
   and momentum/rubber-band overscroll (red-team M5), and under Stage Manager / Split View (M6).
2. Touch focus-retention on a rail tap — that a tap keeps the editor focused and the keyboard up
   (iOS raises the keyboard only on a user gesture, so a lost blur can't be re-raised programmatically).
3. That the reserved caret space keeps the caret above the rail while typing near a slide's end (M7).

The always-docked fallback means each of these degrades to "docked bottom bar" rather than breaking.

## Follow-on: register-apply hardening (the `- > > > >` bug)

Testing slice 1 on-device surfaced a **pre-existing** correctness bug the rail made easy to hit:
tapping Key-insight (❦) with the caret in a list item nested a blockquote every tap
(`- > > > >`), unbounded. Red-team + inversion found the root cause: a register that **mutates a
different block than its detector reads** never toggles off. `insight` wrapped the *inner* block
(the paragraph inside the list item) via `wrapIn`, while `activeRegister` inspected the *top-level*
block (the list) — so `current` was never `insight` and every tap re-wrapped.

Fix: the apply/detect logic moved to a pure kernel `docs/src/lib/compose/registers.ts` with one
invariant — **a register mutates and detects the SAME top-level block, and is a strict no-op unless
that block is a type it can validly render from** (paragraph/heading; plus blockquote for insight's
toggle-off). `insight` now branches on block KIND (blockquote → unwrap; paragraph → wrap in place if
last, else move to slide end; else no-op), `h1`/`h2` guard to paragraph/heading, and a cross-slide
selection is a no-op. Every register is now an idempotent toggle that cannot nest. Guarded by
`registers.test.ts` (8 stress cases incl. the exact repro). Landed on this branch (HARD RULE #18 —
a defect the change's own surface exposed, fixed in place).

## Slice 2 (pending, separate branch/PR — HARD RULE #17)

Band consolidation (remove the in-pane EDIT header on mobile; relocate Insert → rail, Fix-all →
issues chip, History/mode → `⋯`; keep two top bands) and the **divider → slide-settings** gear
(the `SlideView` bar gains a gear opening `SlideContextBody` as a `side="bottom"` Sheet; reconcile
the caret slide via `onEditorCursorSlide` before opening; guard the lens −1 case; controlled Sheet
with focus/selection restore). See the competition + trio notes in the session record.
