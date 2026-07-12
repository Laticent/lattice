---
status: in-progress
summary: >
  Redesign the Studio Present overlay + dual-screen presenter around a locked
  control model — one Play (narrate + advance, no separate autoplay), independent
  CC / Voice toggles (captions run on the existing 'silent' cadence rung while
  muted), and ONE segmented, section-grouped progress rail (current segment fills
  during play, click-to-jump). Chrome is "Quiet Bloom": quiet at rest, blooms on
  intent; caption is a centered teleprompter crawl (film-subtitle, not a pill);
  circular auto-hiding flanking arrows; swipe + wheel + keyboard. Rail placement A
  (with the transport, at the bottom) beat B (rail under the toolbar) 83–63 across
  an independent-checker + red-team + Munger-inversion trio. Presenter window is
  brand-dark, on-brand, whole (uncropped) current + next slides. Sections derive
  from existing section/divider slides; captions reuse the existing 'silent' rung.
last-status-update: 2026-07-12
---

# Studio Present — redesign (Quiet Bloom, rail placement A)

**Date:** 2026-07-12 · **Status:** in-progress (design locked; implementation in slices below)

Related: `docs/src/components/studio/PresentOverlay.tsx` (the overlay this redesigns),
`docs/src/playground/presenter-window.js` (the shared dual-screen kernel),
`docs/src/components/studio/read-aloud.ts` (the reader — note the `'silent'` rung),
`docs/src/lib/vetrina/README.md` (the `scrim` caption this echoes),
`engineering/decisions/2026-07-07-html-lattice-player.md` (the export player that shares the transport kernel).

Design reference (interactive): the LOCKED mock carries layout A plus B and Scrubber on a
switch, on a real 12-slide deck, both themes.

---

## The problem

As the Studio's Present mode grew (read-aloud, autoplay, rehearse, presenter, captions),
its chrome outgrew a design scoped for less. Observed on device (mobile + iPad):

- **The caption balloons over the slide.** It printed the *entire* slide narration in a
  centered box, occluding the slide — catastrophic on mobile.
- **Two competing counters** (`13/58` slide position + `0/3` read-aloud cue count).
- **Play vs. Autoplay is unclear** — two controls for one idea, ambiguous icons.
- **Captions are welded to TTS** — no "closed captions without the voice."
- **Progress is overloaded** — one bar meaning slide-position OR read-progress OR
  rehearsal-time depending on mode; within-slide and section progress unsurfaced.
- **Controls are pill-soup**, folding items in/out per breakpoint; the dual-screen
  presenter is off-brand hardcoded hex with cropped current/next slides.

## The control model (locked)

The root cause was conceptual: one bar tried to be both a **navigator** (for the live
presenter) and a **media player** (for a deck that plays itself). The model separates them:

1. **Navigation is always-on and quiet** — prev / position / next.
2. **One Play.** Play narrates the current slide AND advances, like a video. **Autoplay is
   deleted** as a separate concept. Universal ▶ / ⏸.
3. **Captions (CC) and Voice are independent toggles.** CC shows/hides the crawl; it works
   with Voice muted by running on a reading-cadence clock. Voice speaks (TTS) or mutes; the
   voice picker (Aria cloud/local) lives behind it.
4. **One progress element** — a **segmented, section-grouped rail**: one segment per slide,
   grouped by section; the current segment fills during Play (that IS within-slide progress);
   click a segment to jump. A small numeric position readout is allowed; no second counter.
5. **Rehearse stays a separate mode** with its own clock — it does not share the transport's
   semantics.

Determinism: the rail is bound to slide index always; the fill is one clock; captions adopt
new text only on navigation (never a mid-slide async swap).

## Chrome: Quiet Bloom, rail placement A

- **Quiet Bloom** — at rest only Play + position + a centered section title + a hair-thin
  rail; arrows, CC, Voice and the caption *bloom* in on intent (hover / focus / play), then
  fold back. Fewest resting pixels; the slide owns the screen. A first-run text cue teaches it.
- **Caption = a Star-Wars-style crawl without warp** — the actively-read line sits centered,
  read lines lift out the top, upcoming lines rise from the bottom, words highlight as spoken.
  Film-subtitle, never a pill.
- **Circular prev/next flank the slide**, never over it; auto-hide, reveal on
  pointermove / wheel / keydown / touchstart; faintly persistent at rest (mouse-presenter safety).
- **Section title** is ONE centered line above the rail that cross-fades on section change
  (scales to any number of sections; replaces per-segment labels). Rail is full-width so its
  geometry never shifts with the section name.
- **Layout order (bottom dock):** caption (top) → controls (middle) → section title →
  full-width rail (bottom).

### Rail placement: A vs B — decided by the adversarial trio

B (rail under the toolbar as a "context header", section title below it) was mocked and
evaluated head-to-head with A. Independent-checker + red-team + Munger-inversion, each scoring
both from a UI/UX lens against the real implementation:

| Lens | A (rail bottom) | B (rail top) |
|---|---|---|
| Independent checker | 87 | 69 |
| Red team (resilience) | 78 | 58 |
| Munger inversion | 85 | 62 |
| **Aggregate** | **83** | **63** |

**A wins.** Decisive, code-verified point: B's top placement used flexbox `order` / `column-reverse`,
which change *paint* order only — the rail is **seen first but tabbed / screen-read last**, a real
WCAG 2.4.3 focus-order defect A does not have. A also keeps the whole navigation cluster together
(proximity), avoids split attention during playback, and gives the best one-handed thumb reach.
B's headline benefit ("pushes the slide down / more room") is illusory — `slide-row` is `flex:1`
and absorbs the space equally. B's only real merit (progress read first) mainly helps the
secondary async viewer.

## Process (how we got here)

Two parameterized `design-competition` fan-outs (5 tracks × 5 warm iterations + one judge, 6
agents each), then the adversarial trio on the finalist:

1. **Whole-frame competition** → 5 directions (Cinema, Atelier/Editorial, Cockpit, Liquid Glass,
   Sidecar). Human picked **Cinema**; synergy analysis (Studio chrome + the vanilla export player
   that shares the transport kernel) confirmed Cinema as lowest-friction.
2. **Control-system competition** (seeded from the Cinema base) → 5 expressions (Scrubber, Quiet
   Bloom, Media Console, Instrument Dock, Edge Ambient). Finalists **Quiet Bloom** + **Scrubber**;
   human picked **Quiet Bloom**.
3. **Trio** on Quiet Bloom, then on rail placement A vs B → **A**, hardened with the fixes below.

## Scoping — what already exists (less net-new than it looks)

- **Captions without TTS → the `'silent'` rung.** `read-aloud.ts` already supports a wall-clock
  cadence estimate with no audio (`rung: 'silent'`). CC-on/Voice-off = run the reader in `silent`;
  CC-on/Voice-on = TTS. Wiring, not new engine code.
- **Sections → existing section/divider slides.** `section`/`divider` are real slide layouts
  (`HEADING_ONLY_OK`; "Section 01 · Foundations"). The rail groups by those boundaries, named by
  the section slide's heading; a deck with no sections degrades to a flat segmented rail.
- **Transport kernel is shared + frozen** (`lib/core/present-transport.mjs`): keymap, swipe, fit,
  `createTransport`. Nav comes for free and stays identical in the export player.

## Fixes folded from the trio (before implementation)

1. Enlarged (invisible) segment hit targets — the visual bar stays thin.
2. Stronger active-section legibility (tint + section-title contrast) for low-vision.
3. Faint-persistent flanking arrows at rest (mouse-presenter "back" is never fully gone).
4. **UNVERIFIED / on-device:** deliberate-tap guard against accidental rail activation in the
   phone thumb-rest zone — must be verified on a real device (HARD RULE #23), not a headless render.

## Implementation plan (slices, this branch)

Each slice builds + tests green on its own (HARD RULE #18); the six long-running galleries stay
isolated (#8); docs + CHANGELOG land with the change (#6, #10).

- **S1 — Section model + segmented rail.** Derive sections from section/divider slides
  (shared helper, tested); build the rail component (grouped segments, fill, click-to-jump,
  `aria-current`, keyboard). Replaces the dual counter.
- **S2 — Caption crawl.** Teleprompter (active line centered, cross-fade, word highlight) fed by
  the reader; driven by the `'silent'` cadence when muted. Replaces the occluding box.
- **S3 — Control model rewire.** One Play (narrate + advance) folding today's autoplay; CC / Voice
  as independent toggles over the reader rungs; kill the second counter. Behavior change → docs + CHANGELOG.
- **S4 — Quiet Bloom chrome.** Resting/Playing bloom, flanking auto-hiding circular arrows, first-run
  hint, layout A dock order, both themes, reduced-motion, focus states.
- **S5 — Presenter window.** Brand-dark, on-brand tokens, whole (uncropped) current + next slides,
  redesigned notes + controls in the same language (`presenter-window.js`).
- **S6 — Verify on real surfaces.** Build the docs, drive the real Playground Present on desktop +
  a real device (touch, iOS Safari) — mark anything unreachable UNVERIFIED (#23). Per-feature demo
  deck (#9). Maker-checker on the engine-adjacent diffs; the export-player parity is a separate PR (#17).

## Open items

- Default states: **CC on / Voice muted** by default (boardroom-safe). An async shared-deck open
  could default Voice on — keyed off how Present was entered. Confirm during S3.
- Section-count affordance (`THE MODEL · 2/3`) beside the title — deferred; name-only ships first.
