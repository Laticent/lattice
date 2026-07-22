---
status: shipped
summary: Kill the chart-motion "flash" (static poster → blank → build) with a preview-only pre-hide so a motion chart goes hidden → build → settle; plus hover close-hysteresis, an anima-coupling test, and the finding that replay-in-Present is already satisfied by the architecture.
---

# Chart-motion flash fix + chart live-preview polish

**Date:** 2026-07-22 · **Status:** Shipped

## Problem

Four chart live-preview items surfaced while shipping the chart-detail popover (#1178):

1. **The flash.** A `motion-on` chart painted the STATIC chart (poster), then — once the async Anima
   host finished importing — hid the poster and drew the animated clone at time-zero (every mark at
   opacity 0). The viewer saw **static chart → blank → build in**. The user wants **hidden → animate →
   settle** (no static flash, no blank jolt).
2. **Popover edge-flicker.** Sweeping the pointer across a mark boundary/gap toggled the hover popover
   open→close→open faster than its ~150ms zoom animation.
3. **Coupling landmines.** The chart-interact ↔ anima invariants (`.scene-live` clone binding; not
   stamping the clone's baked-frame marks) were comment-only.
4. **Replay-on-enter?** Whether a chart re-plays its build when entered in Present.

## Decisions

### 1. The flash — a PREVIEW-ONLY pre-hide, host-stamped so exports are byte-identical

The live preview host hides a motion-eligible chart FIGURE the instant its slide parses, and reveals it
only when the animated clone's first (zero-state) frame draws — so the window that used to show the
static poster shows *nothing*, and the reveal lands on the empty frame the build grows from (hidden →
build → settle, seamless).

The mechanism keys on a **host-added class**, `anima-prehide`, which makes export parity structural:
- `prehideEligibleCharts(root, deck)` (in the zero-dep `anima-host-sel.ts` leaf) adds the class to each
  figure whose `resolveMotion(section, deck) !== null` — EXACTLY the set `rebind` mounts, so it never
  hides a chart the host won't mount (→ strand). It **skips figures already carrying `.anima-live`** (a
  rebind runs on every render; one that preserved the section node would otherwise re-hide a settled
  chart with no mount left to reveal it — the re-hide-after-reveal stranding the maker-checker flagged).
- The hiding CSS `.anima-prehide{visibility:hidden}` lives ONLY in `single-slide-render.ts`
  `themeStyleContent()` — a preview-only srcdoc builder, never an export path. `visibility` (not
  `display`) keeps the box, so no reflow / no Fit-math corruption on reveal.
- **Export parity (the sacred constraint):** the class is added ONLY by the live parent host (DeckPreview
  `syncAnima` before the import + `anima-scenes.rebind`), never by engine output; the hiding CSS is
  preview-only. Verified: every shipped/export artifact carries `anima-prehide` exactly once — the no-op
  `classList.remove` reveal in `hydrate.ts mount()` — with NO `add` and NO `visibility:hidden` rule, and
  the engine render path (`lib/core`/`engine`/`transformers`/`components`) has zero occurrences.
- **Fallbacks so a chart can never strand hidden:** the host reveals on mount (`hydrate.ts`); on a
  decline (author `still` tier / no backend, `hydrate` returns null) `anima-scenes` clears the class in
  the mount closure; on import failure DeckPreview clears it in `.catch`; and a `setTimeout(1800)`
  backstop clears it if the host never constructs (hung import). Reduced-motion mounts settled (revealed).

### 2. Hover close-hysteresis

A 70ms debounce on the hoverAny off-mark `clear`; a re-reveal cancels it, leaving the doc clears
immediately. Scoped to the hover path (the pinned hit-surface clears only on pointerleave, so it never
edge-flickered).

### 3. Coupling test

An integration test pins both invariants: chart-interact binds the `.scene-live` clone even when the
poster still has a box, and the reveal never stamps transform/opacity onto the clone's marks. Fails
without the `.scene-live` preference.

### 4. Replay-on-enter — already satisfied by the architecture (chosen: plays in Present, not editor)

No new machinery. Present's `PresentOverlay` renders its OWN `DeckPreview`, a separate component instance
with its OWN `createAnimaScenes` (→ its own `played` signature set). So each chart plays the FIRST time
it's reached while presenting (its signature isn't in Present's fresh played set), even if it was
previewed in the editor earlier. The editor's separate played set suppresses a restart on every
keystroke (a re-parsed identical signature mounts settled). A render that PRESERVES the section node
doesn't dispose a playing chart (Phase-1 disposes only on node-gone / ineligible). The flash fix is what
makes the Present first-reach play VISIBLE (from hidden), which is why it read as "didn't animate."

## Notes / follow-ups

- Not done (deliberately out of scope): re-animating on EVERY re-entry to a slide in one Present session
  (flip back-and-forth) — the chosen behavior is play-on-first-reach, which avoids that thrash.
- The t=0-is-fully-zeroed assumption (so the reveal shows an empty frame, not a partial static one) holds
  for build/together/rise by design; worth an eyeball on each style during any future motion work.
